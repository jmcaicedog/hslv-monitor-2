import { query } from "./db.js";
import { getAlertConfig } from "./alert-config-db.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

  let sentAlerts = 0;
  const errors = [];

  for (const sensor of sensorDataList) {
    const { sensorName, temperature, humidity, voltage } = sensor;

    try {
      if (
        temperature !== null &&
        (temperature < config.tempMin || temperature > config.tempMax)
      ) {
        const message = `
          El sensor <strong>${sensorName}</strong> ha registrado una temperatura de
          <strong>${temperature}°C</strong>, fuera del rango permitido de
          ${config.tempMin}°C a ${config.tempMax}°C.`;

        await sendEmailAlert(config, sensorName, "Temperatura Fuera de Rango", message);
        sentAlerts += 1;
        await sleep(500);
      }

      if (humidity !== null && (humidity < config.humMin || humidity > config.humMax)) {
        const message = `
          El sensor <strong>${sensorName}</strong> ha registrado una humedad de
          <strong>${humidity}%</strong>, fuera del rango permitido de
          ${config.humMin}% a ${config.humMax}%.`;

        await sendEmailAlert(config, sensorName, "Humedad Fuera de Rango", message);
        sentAlerts += 1;
        await sleep(500);
      }

      if (voltage !== null && voltage < config.voltMin) {
        const message = `
          El sensor <strong>${sensorName}</strong> ha registrado un voltaje de
          <strong>${voltage}V</strong>.
          <br><strong>DEBE CARGARSE LO MAS PRONTO POSIBLE.</strong>`;

        await sendEmailAlert(config, sensorName, "Voltaje Bajo", message);
        sentAlerts += 1;
        await sleep(500);
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
    errors,
  };
}
