import { query } from "./db.js";
import { getAlertConfig, getSensorAlertThresholds } from "./alert-config-db.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function ensureAlertRuntimeSchema() {
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
      v.voltaje
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
    ORDER BY s.title ASC;
  `);

  return rows.map((row) => ({
    sensorId: Number(row.id),
    sensorName: row.sensor_name,
    temperature: asNumber(row.temperatura),
    humidity: asNumber(row.humedad),
    voltage: asNumber(row.voltaje),
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
    const { sensorId, sensorName, temperature, humidity, voltage } = sensor;
    const sensorThreshold = thresholdMap.get(sensorId);

    if (!sensorThreshold || sensorThreshold.enabled === false) {
      continue;
    }

    try {
      if (
        temperature !== null &&
        (temperature < sensorThreshold.tempMin || temperature > sensorThreshold.tempMax)
      ) {
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
    } catch (error) {
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
