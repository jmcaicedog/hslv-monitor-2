import { query } from "./db.js";

let alertSchemaEnsured = false;

function parseEmailList(raw) {
  if (!raw) return [];

  return String(raw)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumberOrFallback(raw, fallback) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDefaultConfigFromEnv() {
  return {
    emailFrom: process.env.EMAIL_FROM || "notificaciones@localhost.local",
    emailTo: parseEmailList(process.env.EMAIL_TO),
    tempMin: parseNumberOrFallback(process.env.TEMP_MIN, 15),
    tempMax: parseNumberOrFallback(process.env.TEMP_MAX, 26),
    humMin: parseNumberOrFallback(process.env.HUM_MIN, 40),
    humMax: parseNumberOrFallback(process.env.HUM_MAX, 80),
    voltMin: parseNumberOrFallback(process.env.VOLT_MIN, 3.3),
    enabled: true,
  };
}

function parseEmailToInput(emailToInput) {
  if (Array.isArray(emailToInput)) {
    return emailToInput.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(emailToInput || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeAlertConfigInput(payload = {}) {
  const normalized = {
    emailFrom: String(payload.emailFrom || "").trim(),
    emailTo: parseEmailToInput(payload.emailTo),
    tempMin: Number(payload.tempMin),
    tempMax: Number(payload.tempMax),
    humMin: Number(payload.humMin),
    humMax: Number(payload.humMax),
    voltMin: Number(payload.voltMin),
    enabled: Boolean(payload.enabled),
  };

  if (!normalized.emailFrom) {
    throw new Error("EMAIL_FROM es obligatorio.");
  }

  if (normalized.emailTo.length === 0) {
    throw new Error("Debes definir al menos un destinatario en EMAIL_TO.");
  }

  const numericFields = [
    ["tempMin", "TEMP_MIN"],
    ["tempMax", "TEMP_MAX"],
    ["humMin", "HUM_MIN"],
    ["humMax", "HUM_MAX"],
    ["voltMin", "VOLT_MIN"],
  ];

  for (const [key, label] of numericFields) {
    if (!Number.isFinite(normalized[key])) {
      throw new Error(`${label} debe ser numerico.`);
    }
  }

  if (normalized.tempMin >= normalized.tempMax) {
    throw new Error("TEMP_MIN debe ser menor que TEMP_MAX.");
  }

  if (normalized.humMin >= normalized.humMax) {
    throw new Error("HUM_MIN debe ser menor que HUM_MAX.");
  }

  return normalized;
}

export async function ensureAlertConfigSchema() {
  if (alertSchemaEnsured) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS alert_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      email_from TEXT NOT NULL,
      email_to TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      temp_min DOUBLE PRECISION NOT NULL,
      temp_max DOUBLE PRECISION NOT NULL,
      hum_min DOUBLE PRECISION NOT NULL,
      hum_max DOUBLE PRECISION NOT NULL,
      volt_min DOUBLE PRECISION NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const defaults = getDefaultConfigFromEnv();

  await query(
    `
      INSERT INTO alert_config (
        id,
        email_from,
        email_to,
        temp_min,
        temp_max,
        hum_min,
        hum_max,
        volt_min,
        enabled
      )
      VALUES (1, $1, $2::text[], $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING;
    `,
    [
      defaults.emailFrom,
      defaults.emailTo,
      defaults.tempMin,
      defaults.tempMax,
      defaults.humMin,
      defaults.humMax,
      defaults.voltMin,
      defaults.enabled,
    ]
  );

  alertSchemaEnsured = true;
}

export function mapAlertConfigRow(row) {
  return {
    emailFrom: row.email_from,
    emailTo: row.email_to || [],
    tempMin: Number(row.temp_min),
    tempMax: Number(row.temp_max),
    humMin: Number(row.hum_min),
    humMax: Number(row.hum_max),
    voltMin: Number(row.volt_min),
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at,
  };
}

export async function getAlertConfig() {
  await ensureAlertConfigSchema();

  const { rows } = await query(`SELECT * FROM alert_config WHERE id = 1 LIMIT 1;`);

  if (rows.length === 0) {
    throw new Error("No existe configuracion de alertas.");
  }

  return mapAlertConfigRow(rows[0]);
}

export async function updateAlertConfig(payload) {
  await ensureAlertConfigSchema();

  const normalized = normalizeAlertConfigInput(payload);

  const { rows } = await query(
    `
      UPDATE alert_config
      SET
        email_from = $1,
        email_to = $2::text[],
        temp_min = $3,
        temp_max = $4,
        hum_min = $5,
        hum_max = $6,
        volt_min = $7,
        enabled = $8,
        updated_at = NOW()
      WHERE id = 1
      RETURNING *;
    `,
    [
      normalized.emailFrom,
      normalized.emailTo,
      normalized.tempMin,
      normalized.tempMax,
      normalized.humMin,
      normalized.humMax,
      normalized.voltMin,
      normalized.enabled,
    ]
  );

  return mapAlertConfigRow(rows[0]);
}
