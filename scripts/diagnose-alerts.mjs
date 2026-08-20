import "dotenv/config";
import { query } from "../src/lib/db.js";
import { getAlertConfig, getSensorAlertThresholds } from "../src/lib/alert-config-db.js";

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getLatestSensorValues() {
  const { rows } = await query(`
    SELECT
      s.id,
      s.status,
      COALESCE(NULLIF(s.title, ''), 'Sensor ' || s.id::text) AS sensor_name,
      t.temperatura,
      h.humedad,
      t2.temperatura_2,
      h2.humedad_2,
      v.voltaje,
      p.presion,
      l.luz,
      lr.observed_at AS last_observed_at
    FROM sensors s
    LEFT JOIN LATERAL (
      SELECT temperatura FROM sensor_readings
      WHERE sensor_id = s.id AND temperatura IS NOT NULL
      ORDER BY observed_at DESC LIMIT 1
    ) t ON TRUE
    LEFT JOIN LATERAL (
      SELECT humedad FROM sensor_readings
      WHERE sensor_id = s.id AND humedad IS NOT NULL
      ORDER BY observed_at DESC LIMIT 1
    ) h ON TRUE
    LEFT JOIN LATERAL (
      SELECT temperatura_2 FROM sensor_readings
      WHERE sensor_id = s.id AND temperatura_2 IS NOT NULL
      ORDER BY observed_at DESC LIMIT 1
    ) t2 ON TRUE
    LEFT JOIN LATERAL (
      SELECT humedad_2 FROM sensor_readings
      WHERE sensor_id = s.id AND humedad_2 IS NOT NULL
      ORDER BY observed_at DESC LIMIT 1
    ) h2 ON TRUE
    LEFT JOIN LATERAL (
      SELECT voltaje FROM sensor_readings
      WHERE sensor_id = s.id AND voltaje IS NOT NULL
      ORDER BY observed_at DESC LIMIT 1
    ) v ON TRUE
    LEFT JOIN LATERAL (
      SELECT presion FROM sensor_readings
      WHERE sensor_id = s.id AND presion IS NOT NULL
      ORDER BY observed_at DESC LIMIT 1
    ) p ON TRUE
    LEFT JOIN LATERAL (
      SELECT luz FROM sensor_readings
      WHERE sensor_id = s.id AND luz IS NOT NULL
      ORDER BY observed_at DESC LIMIT 1
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT observed_at FROM sensor_readings
      WHERE sensor_id = s.id
      ORDER BY observed_at DESC LIMIT 1
    ) lr ON TRUE
    ORDER BY s.title ASC;
  `);

  return rows.map((row) => ({
    sensorId: Number(row.id),
    status: row.status,
    sensorName: row.sensor_name,
    lastObservedAt: row.last_observed_at,
    temperature: asNumber(row.temperatura),
    humidity: asNumber(row.humedad),
    temperature2: asNumber(row.temperatura_2),
    humidity2: asNumber(row.humedad_2),
    voltage: asNumber(row.voltaje),
    pressure: asNumber(row.presion),
    light: asNumber(row.luz),
  }));
}

function outOfRange(value, min, max) {
  if (value == null) return null;
  if (min != null && value < min) return `< ${min}`;
  if (max != null && value > max) return `> ${max}`;
  return null;
}

async function main() {
  console.log("== Configuracion global de alertas (alert_config) ==");
  const config = await getAlertConfig();
  console.log({
    enabled: config.enabled,
    emailFrom: config.emailFrom,
    emailTo: config.emailTo,
    cooldownMinutes: config.cooldownMinutes,
  });

  if (!config.enabled) {
    console.log("\n>>> ALERTAS DESACTIVADAS GLOBALMENTE (alert_config.enabled = false). <<<");
  }
  if (!config.emailFrom || !Array.isArray(config.emailTo) || config.emailTo.length === 0) {
    console.log("\n>>> Falta EMAIL_FROM o EMAIL_TO en configuracion. runThresholdAlerts() lanzaria error. <<<");
  }

  console.log("\n== Variables de entorno relevantes ==");
  console.log({
    RESEND_API_KEY: process.env.RESEND_API_KEY ? "definida" : "FALTA",
    CRON_SECRET: process.env.CRON_SECRET ? "definida" : "FALTA (necesaria para /api/cron/alerts en prod)",
  });

  console.log("\n== Umbrales por sensor (sensor_alert_thresholds) ==");
  const thresholds = await getSensorAlertThresholds();
  const thresholdMap = new Map(thresholds.map((t) => [t.sensorId, t]));
  const disabled = thresholds.filter((t) => t.enabled === false);
  console.log(`Total sensores con umbral configurado: ${thresholds.length}`);
  if (disabled.length > 0) {
    console.log(`Sensores con alertas DESACTIVADAS individualmente: ${disabled.map((t) => t.sensorName).join(", ")}`);
  }

  console.log("\n== Ultimos valores vs umbral (deteccion de posibles disparos) ==");
  const latest = await getLatestSensorValues();

  console.log(`Total sensores: ${latest.length}, con umbral: ${thresholds.length}`);

  const missingThreshold = latest.filter((s) => !thresholdMap.has(s.sensorId));
  if (missingThreshold.length > 0) {
    console.log(`Sensores SIN fila en sensor_alert_thresholds (nunca se evaluan umbrales): ${missingThreshold.map((s) => s.sensorName).join(", ")}`);
  }

  for (const sensor of latest) {
    const th = thresholdMap.get(sensor.sensorId);
    const flags = [];

    if (Number(sensor.status) === 0) flags.push("INACTIVO");

    if (th && th.enabled !== false) {
      const tempFlag = outOfRange(sensor.temperature, th.tempMin, th.tempMax);
      if (tempFlag) flags.push(`temperatura ${sensor.temperature} (${tempFlag})`);

      const humFlag = outOfRange(sensor.humidity, th.humMin, th.humMax);
      if (humFlag) flags.push(`humedad ${sensor.humidity} (${humFlag})`);

      if (sensor.voltage != null && sensor.voltage < th.voltMin) {
        flags.push(`voltaje ${sensor.voltage} (< ${th.voltMin})`);
      }

      if (th.hasPressure) {
        const pFlag = outOfRange(sensor.pressure, th.pressureMin, th.pressureMax);
        if (pFlag) flags.push(`presion ${sensor.pressure} (${pFlag})`);
      }

      if (th.hasLight) {
        const lFlag = outOfRange(sensor.light, th.lightMin, th.lightMax);
        if (lFlag) flags.push(`luz ${sensor.light} (${lFlag})`);
      }

      // Diagnostico informativo: la sonda (temperatura2/humedad2) usa el MISMO umbral
      // de temp/hum que el sensor principal, pero runThresholdAlerts() NO la evalua hoy.
      const probeTempFlag = outOfRange(sensor.temperature2, th.tempMin, th.tempMax);
      const probeHumFlag = outOfRange(sensor.humidity2, th.humMin, th.humMax);
      if (probeTempFlag) flags.push(`[NO EVALUADO] temperatura sonda ${sensor.temperature2} (${probeTempFlag})`);
      if (probeHumFlag) flags.push(`[NO EVALUADO] humedad sonda ${sensor.humidity2} (${probeHumFlag})`);
    } else if (th) {
      flags.push("umbral deshabilitado");
    } else {
      flags.push("sin umbral configurado");
    }

    if (flags.length > 0) {
      console.log(`- ${sensor.sensorName} (id ${sensor.sensorId}): ${flags.join(" | ")}`);
    }
  }

  console.log("\n== Estado actual de alarmas (sensor_alarm_state) ==");
  const { rows: alarmRows } = await query(`
    SELECT sas.sensor_id, s.title, sas.active_alarm, sas.silenced, sas.active_metrics, sas.triggered_at, sas.last_checked_at
    FROM sensor_alarm_state sas
    JOIN sensors s ON s.id = sas.sensor_id
    ORDER BY sas.last_checked_at DESC NULLS LAST;
  `);
  if (alarmRows.length === 0) {
    console.log("No hay filas en sensor_alarm_state todavia (runThresholdAlerts() nunca se ha ejecutado o no ha corrido desde el ultimo reinicio de esquema).");
  } else {
    alarmRows.forEach((row) => {
      console.log(
        `- ${row.title}: active=${row.active_alarm} silenced=${row.silenced} last_checked=${row.last_checked_at} metrics=${JSON.stringify(row.active_metrics)}`
      );
    });
  }

  console.log("\n== Ultimo envio por sensor/variable (alert_notification_state, cooldown) ==");
  const { rows: stateRows } = await query(`
    SELECT ans.sensor_id, s.title, ans.metric_key, ans.last_sent_at, ans.last_value
    FROM alert_notification_state ans
    JOIN sensors s ON s.id = ans.sensor_id
    ORDER BY ans.last_sent_at DESC
    LIMIT 30;
  `);
  if (stateRows.length === 0) {
    console.log("Nunca se ha registrado un envio de alerta (alert_notification_state vacia).");
  } else {
    stateRows.forEach((row) => {
      console.log(`- ${row.title} / ${row.metric_key}: last_sent_at=${row.last_sent_at} last_value=${row.last_value}`);
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error ejecutando diagnostico:", error);
    process.exit(1);
  });
