import { query } from "./db.js";
import { getAlertConfig, getSensorAlertThresholds } from "./alert-config-db.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function ensureAlertRuntimeSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS alert_notification_state (
      sensor_id BIGINT NOT NULL,
      metric_key TEXT NOT NULL,
      last_sent_at TIMESTAMPTZ NOT NULL,
      last_value DOUBLE PRECISION,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (sensor_id, metric_key)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sensor_alarm_state (
      sensor_id BIGINT PRIMARY KEY,
      active_alarm BOOLEAN NOT NULL DEFAULT FALSE,
      silenced BOOLEAN NOT NULL DEFAULT FALSE,
      active_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
      triggered_at TIMESTAMPTZ,
      silenced_at TIMESTAMPTZ,
      silenced_by TEXT,
      last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function createTriggerPayload(metricKey, value, threshold) {
  switch (metricKey) {
    case "temperature":
      return {
        metricKey,
        metricLabel: "Temperatura",
        value,
        unit: "°C",
        min: threshold.tempMin,
        max: threshold.tempMax,
      };
    case "humidity":
      return {
        metricKey,
        metricLabel: "Humedad",
        value,
        unit: "%",
        min: threshold.humMin,
        max: threshold.humMax,
      };
    case "voltage":
      return {
        metricKey,
        metricLabel: "Voltaje",
        value,
        unit: "V",
        min: threshold.voltMin,
        max: null,
      };
    case "pressure":
      return {
        metricKey,
        metricLabel: "Presion",
        value,
        unit: "KPa",
        min: threshold.pressureMin,
        max: threshold.pressureMax,
      };
    case "light":
      return {
        metricKey,
        metricLabel: "Luz",
        value,
        unit: "lx",
        min: threshold.lightMin,
        max: threshold.lightMax,
      };
    default:
      return {
        metricKey,
        metricLabel: metricKey,
        value,
        unit: "",
        min: null,
        max: null,
      };
  }
}

function formatTriggeredMetrics(metrics) {
  return metrics
    .map((metric) => {
      if (Number.isFinite(metric.min) && Number.isFinite(metric.max)) {
        return `${metric.metricLabel}: ${metric.value}${metric.unit} (rango ${metric.min}${metric.unit} - ${metric.max}${metric.unit})`;
      }

      if (Number.isFinite(metric.min)) {
        return `${metric.metricLabel}: ${metric.value}${metric.unit} (minimo ${metric.min}${metric.unit})`;
      }

      return `${metric.metricLabel}: ${metric.value}${metric.unit}`;
    })
    .join("; ");
}

async function upsertSensorAlarmState(sensorId, triggeredMetrics) {
  const activeAlarm = triggeredMetrics.length > 0;

  await query(
    `
      INSERT INTO sensor_alarm_state (
        sensor_id,
        active_alarm,
        silenced,
        active_metrics,
        triggered_at,
        silenced_at,
        silenced_by,
        last_checked_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        FALSE,
        $3::jsonb,
        CASE WHEN $2 THEN NOW() ELSE NULL END,
        NULL,
        NULL,
        NOW(),
        NOW()
      )
      ON CONFLICT (sensor_id)
      DO UPDATE SET
        active_alarm = EXCLUDED.active_alarm,
        silenced = FALSE,
        active_metrics = EXCLUDED.active_metrics,
        triggered_at = CASE WHEN EXCLUDED.active_alarm THEN NOW() ELSE NULL END,
        silenced_at = NULL,
        silenced_by = NULL,
        last_checked_at = NOW(),
        updated_at = NOW();
    `,
    [sensorId, activeAlarm, JSON.stringify(triggeredMetrics)]
  );
}

export async function getSensorAlarmState(sensorId) {
  await ensureAlertRuntimeSchema();

  const { rows } = await query(
    `
      SELECT
        sensor_id,
        active_alarm,
        silenced,
        active_metrics,
        triggered_at,
        silenced_at,
        silenced_by,
        last_checked_at,
        updated_at
      FROM sensor_alarm_state
      WHERE sensor_id = $1
      LIMIT 1;
    `,
    [sensorId]
  );

  if (rows.length === 0) {
    return {
      sensorId: Number(sensorId),
      activeAlarm: false,
      silenced: false,
      hasActiveAlarm: false,
      activeMetrics: [],
      triggeredAt: null,
      silencedAt: null,
      silencedBy: null,
      lastCheckedAt: null,
      updatedAt: null,
    };
  }

  const row = rows[0];
  const activeAlarm = Boolean(row.active_alarm);
  const silenced = Boolean(row.silenced);

  return {
    sensorId: Number(row.sensor_id),
    activeAlarm,
    silenced,
    hasActiveAlarm: activeAlarm && !silenced,
    activeMetrics: Array.isArray(row.active_metrics) ? row.active_metrics : [],
    triggeredAt: row.triggered_at,
    silencedAt: row.silenced_at,
    silencedBy: row.silenced_by,
    lastCheckedAt: row.last_checked_at,
    updatedAt: row.updated_at,
  };
}

export async function attendSensorAlarm(sensorId, handledBy) {
  await ensureAlertRuntimeSchema();

  const alarmState = await getSensorAlarmState(sensorId);

  if (!alarmState.hasActiveAlarm) {
    throw new Error("El sensor no tiene una alarma activa para atender.");
  }

  const config = await getAlertConfig();

  if (!config.emailFrom || !Array.isArray(config.emailTo) || config.emailTo.length === 0) {
    throw new Error(
      "Configuracion de alertas incompleta: define EMAIL_FROM y al menos un EMAIL_TO en /admin/alerts."
    );
  }

  const { rows } = await query(
    `
      SELECT COALESCE(NULLIF(title, ''), 'Sensor ' || id::text) AS sensor_name
      FROM sensors
      WHERE id = $1
      LIMIT 1;
    `,
    [sensorId]
  );

  const sensorName = rows[0]?.sensor_name || `Sensor ${sensorId}`;
  const handlerName = handledBy || "Usuario autenticado";
  const metricSummary = formatTriggeredMetrics(alarmState.activeMetrics);

  await sendEmailByResend({
    emailFrom: config.emailFrom,
    emailTo: config.emailTo,
    subject: `Alarma atendida - ${sensorName}`,
    html: `<h2>Alarma atendida</h2>
           <p>El usuario <strong>${handlerName}</strong> atendio una alarma.</p>
           <p><strong>Sensor:</strong> ${sensorName}</p>
           <p><strong>Variables:</strong> ${metricSummary || "No especificadas"}</p>
           <p><strong>Fecha y Hora:</strong> ${new Date().toLocaleString()}</p>`,
  });

  await query(
    `
      UPDATE sensor_alarm_state
      SET
        silenced = TRUE,
        silenced_at = NOW(),
        silenced_by = $2,
        updated_at = NOW()
      WHERE sensor_id = $1;
    `,
    [sensorId, handlerName]
  );

  return getSensorAlarmState(sensorId);
}

async function getAlertStateMap() {
  const { rows } = await query(`
    SELECT sensor_id, metric_key, last_sent_at
    FROM alert_notification_state;
  `);

  const map = new Map();

  for (const row of rows) {
    const key = `${row.sensor_id}:${row.metric_key}`;
    map.set(key, row.last_sent_at ? new Date(row.last_sent_at) : null);
  }

  return map;
}

function canSendByCooldown(lastSentAt, cooldownMinutes) {
  if (!lastSentAt) return true;
  if (cooldownMinutes <= 0) return true;

  const elapsedMs = Date.now() - lastSentAt.getTime();
  return elapsedMs >= cooldownMinutes * 60 * 1000;
}

async function saveAlertState(sensorId, metricKey, value) {
  await query(
    `
      INSERT INTO alert_notification_state (
        sensor_id,
        metric_key,
        last_sent_at,
        last_value,
        updated_at
      )
      VALUES ($1, $2, NOW(), $3, NOW())
      ON CONFLICT (sensor_id, metric_key)
      DO UPDATE SET
        last_sent_at = NOW(),
        last_value = EXCLUDED.last_value,
        updated_at = NOW();
    `,
    [sensorId, metricKey, value]
  );
}

async function getLatestSensorValues() {
  const { rows } = await query(`
    SELECT
      s.id,
      COALESCE(NULLIF(s.title, ''), 'Sensor ' || s.id::text) AS sensor_name,
      t.temperatura,
      h.humedad,
      v.voltaje,
      p.presion,
      l.luz
    FROM sensors s
    LEFT JOIN LATERAL (
      SELECT temperatura
      FROM sensor_readings
      WHERE sensor_id = s.id AND temperatura IS NOT NULL
      ORDER BY observed_at DESC
      LIMIT 1
    ) t ON TRUE
    LEFT JOIN LATERAL (
      SELECT humedad
      FROM sensor_readings
      WHERE sensor_id = s.id AND humedad IS NOT NULL
      ORDER BY observed_at DESC
      LIMIT 1
    ) h ON TRUE
    LEFT JOIN LATERAL (
      SELECT voltaje
      FROM sensor_readings
      WHERE sensor_id = s.id AND voltaje IS NOT NULL
      ORDER BY observed_at DESC
      LIMIT 1
    ) v ON TRUE
    LEFT JOIN LATERAL (
      SELECT presion
      FROM sensor_readings
      WHERE sensor_id = s.id AND presion IS NOT NULL
      ORDER BY observed_at DESC
      LIMIT 1
    ) p ON TRUE
    LEFT JOIN LATERAL (
      SELECT luz
      FROM sensor_readings
      WHERE sensor_id = s.id AND luz IS NOT NULL
      ORDER BY observed_at DESC
      LIMIT 1
    ) l ON TRUE
    ORDER BY s.title ASC;
  `);

  return rows.map((row) => ({
    sensorId: Number(row.id),
    sensorName: row.sensor_name,
    temperature: asNumber(row.temperatura),
    humidity: asNumber(row.humedad),
    voltage: asNumber(row.voltaje),
    pressure: asNumber(row.presion),
    light: asNumber(row.luz),
  }));
}

async function sendEmailByResend({ emailFrom, emailTo, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY no esta configurada.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: emailTo,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Error Resend ${response.status}: ${body}`);
  }

  return response.json();
}

async function sendEmailAlert(config, sensorName, subject, message) {
  return sendEmailByResend({
    emailFrom: config.emailFrom,
    emailTo: config.emailTo,
    subject: `Alerta de ${subject} - ${sensorName}`,
    html: `<h2>Alerta del Sensor: ${sensorName}</h2>
           <p>${message}</p>
           <p><strong>Fecha y Hora:</strong> ${new Date().toLocaleString()}</p>`,
  });
}

export async function runThresholdAlerts() {
  await ensureAlertRuntimeSchema();

  const config = await getAlertConfig();

  if (!config.emailFrom || !Array.isArray(config.emailTo) || config.emailTo.length === 0) {
    throw new Error(
      "Configuracion de alertas incompleta: define EMAIL_FROM y al menos un EMAIL_TO en /admin/alerts."
    );
  }

  if (!config.enabled) {
    return {
      ok: true,
      enabled: false,
      checkedSensors: 0,
      sentAlerts: 0,
      message: "Las alertas estan desactivadas en configuracion.",
    };
  }

  const sensorDataList = await getLatestSensorValues();
  const sensorThresholds = await getSensorAlertThresholds();
  const alertStateMap = await getAlertStateMap();
  const thresholdMap = new Map(
    sensorThresholds.map((item) => [item.sensorId, item])
  );

  let sentAlerts = 0;
  let skippedByCooldown = 0;
  const errors = [];

  const cooldownMinutes = Number.isFinite(Number(config.cooldownMinutes))
    ? Math.max(0, Math.floor(Number(config.cooldownMinutes)))
    : 180;

  for (const sensor of sensorDataList) {
    const { sensorId, sensorName, temperature, humidity, voltage, pressure, light } = sensor;
    const sensorThreshold = thresholdMap.get(sensorId);

    if (!sensorThreshold || sensorThreshold.enabled === false) {
      await upsertSensorAlarmState(sensorId, []);
      continue;
    }

    const triggeredMetrics = [];

    try {
      if (
        temperature !== null &&
        (temperature < sensorThreshold.tempMin || temperature > sensorThreshold.tempMax)
      ) {
        triggeredMetrics.push(createTriggerPayload("temperature", temperature, sensorThreshold));
        const metricKey = "temperature";
        const stateKey = `${sensorId}:${metricKey}`;
        const lastSentAt = alertStateMap.get(stateKey);

        if (!canSendByCooldown(lastSentAt, cooldownMinutes)) {
          skippedByCooldown += 1;
        } else {
        const message = `
          El sensor <strong>${sensorName}</strong> ha registrado una temperatura de
          <strong>${temperature}°C</strong>, fuera del rango permitido de
          ${sensorThreshold.tempMin}°C a ${sensorThreshold.tempMax}°C.`;

        await sendEmailAlert(config, sensorName, "Temperatura Fuera de Rango", message);
        await saveAlertState(sensorId, metricKey, temperature);
        alertStateMap.set(stateKey, new Date());
        sentAlerts += 1;
        await sleep(500);
        }
      }

      if (
        humidity !== null &&
        (humidity < sensorThreshold.humMin || humidity > sensorThreshold.humMax)
      ) {
        triggeredMetrics.push(createTriggerPayload("humidity", humidity, sensorThreshold));
        const metricKey = "humidity";
        const stateKey = `${sensorId}:${metricKey}`;
        const lastSentAt = alertStateMap.get(stateKey);

        if (!canSendByCooldown(lastSentAt, cooldownMinutes)) {
          skippedByCooldown += 1;
        } else {
        const message = `
          El sensor <strong>${sensorName}</strong> ha registrado una humedad de
          <strong>${humidity}%</strong>, fuera del rango permitido de
          ${sensorThreshold.humMin}% a ${sensorThreshold.humMax}%.`;

        await sendEmailAlert(config, sensorName, "Humedad Fuera de Rango", message);
        await saveAlertState(sensorId, metricKey, humidity);
        alertStateMap.set(stateKey, new Date());
        sentAlerts += 1;
        await sleep(500);
        }
      }

      if (voltage !== null && voltage < sensorThreshold.voltMin) {
        triggeredMetrics.push(createTriggerPayload("voltage", voltage, sensorThreshold));
        const metricKey = "voltage";
        const stateKey = `${sensorId}:${metricKey}`;
        const lastSentAt = alertStateMap.get(stateKey);

        if (!canSendByCooldown(lastSentAt, cooldownMinutes)) {
          skippedByCooldown += 1;
        } else {
        const message = `
          El sensor <strong>${sensorName}</strong> ha registrado un voltaje de
          <strong>${voltage}V</strong>.
          <br><strong>DEBE CARGARSE LO MAS PRONTO POSIBLE.</strong>`;

        await sendEmailAlert(config, sensorName, "Voltaje Bajo", message);
        await saveAlertState(sensorId, metricKey, voltage);
        alertStateMap.set(stateKey, new Date());
        sentAlerts += 1;
        await sleep(500);
        }
      }

      if (
        pressure !== null &&
        (pressure < sensorThreshold.pressureMin || pressure > sensorThreshold.pressureMax)
      ) {
        triggeredMetrics.push(createTriggerPayload("pressure", pressure, sensorThreshold));
        const metricKey = "pressure";
        const stateKey = `${sensorId}:${metricKey}`;
        const lastSentAt = alertStateMap.get(stateKey);

        if (!canSendByCooldown(lastSentAt, cooldownMinutes)) {
          skippedByCooldown += 1;
        } else {
          const message = `
          El sensor <strong>${sensorName}</strong> ha registrado una presion de
          <strong>${pressure} KPa</strong>, fuera del rango permitido de
          ${sensorThreshold.pressureMin} KPa a ${sensorThreshold.pressureMax} KPa.`;

          await sendEmailAlert(config, sensorName, "Presion Fuera de Rango", message);
          await saveAlertState(sensorId, metricKey, pressure);
          alertStateMap.set(stateKey, new Date());
          sentAlerts += 1;
          await sleep(500);
        }
      }

      if (light !== null && (light < sensorThreshold.lightMin || light > sensorThreshold.lightMax)) {
        triggeredMetrics.push(createTriggerPayload("light", light, sensorThreshold));
        const metricKey = "light";
        const stateKey = `${sensorId}:${metricKey}`;
        const lastSentAt = alertStateMap.get(stateKey);

        if (!canSendByCooldown(lastSentAt, cooldownMinutes)) {
          skippedByCooldown += 1;
        } else {
          const message = `
          El sensor <strong>${sensorName}</strong> ha registrado una iluminacion de
          <strong>${light} lx</strong>, fuera del rango permitido de
          ${sensorThreshold.lightMin} lx a ${sensorThreshold.lightMax} lx.`;

          await sendEmailAlert(config, sensorName, "Luz Fuera de Rango", message);
          await saveAlertState(sensorId, metricKey, light);
          alertStateMap.set(stateKey, new Date());
          sentAlerts += 1;
          await sleep(500);
        }
      }

      await upsertSensorAlarmState(sensorId, triggeredMetrics);
    } catch (error) {
      await upsertSensorAlarmState(sensorId, triggeredMetrics);
      errors.push(
        `${sensorName}: ${error instanceof Error ? error.message : "error desconocido"}`
      );
    }
  }

  return {
    ok: errors.length === 0,
    enabled: true,
    checkedSensors: sensorDataList.length,
    sentAlerts,
    skippedByCooldown,
    cooldownMinutes,
    errors,
  };
}
