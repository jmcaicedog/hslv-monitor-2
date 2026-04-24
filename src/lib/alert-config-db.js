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
    cooldownMinutes: parseNumberOrFallback(process.env.ALERT_COOLDOWN_MINUTES, 180),
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

function validateThresholdRange({
  tempMin,
  tempMax,
  humMin,
  humMax,
  voltMin,
  pressureMin,
  pressureMax,
  lightMin,
  lightMax,
}) {
  const numericFields = [
    [tempMin, "TEMP_MIN"],
    [tempMax, "TEMP_MAX"],
    [humMin, "HUM_MIN"],
    [humMax, "HUM_MAX"],
    [voltMin, "VOLT_MIN"],
    [pressureMin, "PRESSURE_MIN"],
    [pressureMax, "PRESSURE_MAX"],
    [lightMin, "LIGHT_MIN"],
    [lightMax, "LIGHT_MAX"],
  ];

  for (const [value, label] of numericFields) {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} debe ser numerico.`);
    }
  }

  if (tempMin >= tempMax) {
    throw new Error("TEMP_MIN debe ser menor que TEMP_MAX.");
  }

  if (humMin >= humMax) {
    throw new Error("HUM_MIN debe ser menor que HUM_MAX.");
  }

  if (pressureMin >= pressureMax) {
    throw new Error("PRESSURE_MIN debe ser menor que PRESSURE_MAX.");
  }

  if (lightMin >= lightMax) {
    throw new Error("LIGHT_MIN debe ser menor que LIGHT_MAX.");
  }
}

export function normalizeAlertConfigInput(payload = {}) {
  const normalized = {
    emailFrom:
      payload.emailFrom == null ? null : String(payload.emailFrom || "").trim(),
    emailTo: payload.emailTo == null ? null : parseEmailToInput(payload.emailTo),
    tempMin: payload.tempMin == null ? null : Number(payload.tempMin),
    tempMax: payload.tempMax == null ? null : Number(payload.tempMax),
    humMin: payload.humMin == null ? null : Number(payload.humMin),
    humMax: payload.humMax == null ? null : Number(payload.humMax),
    voltMin: payload.voltMin == null ? null : Number(payload.voltMin),
    cooldownMinutes:
      payload.cooldownMinutes == null ? null : Number(payload.cooldownMinutes),
    enabled: payload.enabled == null ? null : Boolean(payload.enabled),
  };

  if (normalized.emailFrom !== null && !normalized.emailFrom) {
    throw new Error("EMAIL_FROM es obligatorio.");
  }

  if (normalized.emailTo !== null && normalized.emailTo.length === 0) {
    throw new Error("Debes definir al menos un destinatario en EMAIL_TO.");
  }

  if (normalized.cooldownMinutes !== null) {
    if (!Number.isFinite(normalized.cooldownMinutes)) {
      throw new Error("ALERT_COOLDOWN_MINUTES debe ser numerico.");
    }

    if (normalized.cooldownMinutes < 0) {
      throw new Error("ALERT_COOLDOWN_MINUTES debe ser mayor o igual a 0.");
    }
  }

  const hasThresholdOverride =
    normalized.tempMin !== null ||
    normalized.tempMax !== null ||
    normalized.humMin !== null ||
    normalized.humMax !== null ||
    normalized.voltMin !== null;

  if (hasThresholdOverride) {
    if (
      normalized.tempMin === null ||
      normalized.tempMax === null ||
      normalized.humMin === null ||
      normalized.humMax === null ||
      normalized.voltMin === null
    ) {
      throw new Error(
        "Para actualizar umbrales globales debes enviar todos los campos de umbral."
      );
    }

    validateThresholdRange(normalized);
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
      cooldown_minutes INTEGER NOT NULL DEFAULT 180,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE alert_config
    ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER NOT NULL DEFAULT 180;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sensor_alert_thresholds (
      sensor_id BIGINT PRIMARY KEY REFERENCES sensors(id) ON DELETE CASCADE,
      temp_min DOUBLE PRECISION NOT NULL,
      temp_max DOUBLE PRECISION NOT NULL,
      hum_min DOUBLE PRECISION NOT NULL,
      hum_max DOUBLE PRECISION NOT NULL,
      volt_min DOUBLE PRECISION NOT NULL,
      pressure_min DOUBLE PRECISION NOT NULL DEFAULT 0,
      pressure_max DOUBLE PRECISION NOT NULL DEFAULT 1000,
      light_min DOUBLE PRECISION NOT NULL DEFAULT 0,
      light_max DOUBLE PRECISION NOT NULL DEFAULT 200000,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE sensor_alert_thresholds
    ADD COLUMN IF NOT EXISTS pressure_min DOUBLE PRECISION NOT NULL DEFAULT 0;
  `);

  await query(`
    ALTER TABLE sensor_alert_thresholds
    ADD COLUMN IF NOT EXISTS pressure_max DOUBLE PRECISION NOT NULL DEFAULT 1000;
  `);

  await query(`
    ALTER TABLE sensor_alert_thresholds
    ADD COLUMN IF NOT EXISTS light_min DOUBLE PRECISION NOT NULL DEFAULT 0;
  `);

  await query(`
    ALTER TABLE sensor_alert_thresholds
    ADD COLUMN IF NOT EXISTS light_max DOUBLE PRECISION NOT NULL DEFAULT 200000;
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
        cooldown_minutes,
        enabled
      )
      VALUES (1, $1, $2::text[], $3, $4, $5, $6, $7, $8, $9)
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
      defaults.cooldownMinutes,
      defaults.enabled,
    ]
  );

  alertSchemaEnsured = true;
}

async function ensureSensorThresholdRows() {
  const base = await getAlertConfig();

  await query(
    `
      INSERT INTO sensor_alert_thresholds (
        sensor_id,
        temp_min,
        temp_max,
        hum_min,
        hum_max,
        volt_min,
        pressure_min,
        pressure_max,
        light_min,
        light_max,
        enabled,
        updated_at
      )
      SELECT
        s.id,
        $1,
        $2,
        $3,
        $4,
        $5,
        0,
        1000,
        0,
        200000,
        TRUE,
        NOW()
      FROM sensors s
      LEFT JOIN sensor_alert_thresholds sat ON sat.sensor_id = s.id
      WHERE sat.sensor_id IS NULL;
    `,
    [base.tempMin, base.tempMax, base.humMin, base.humMax, base.voltMin]
  );
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
    cooldownMinutes: Number(row.cooldown_minutes),
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
  const current = await getAlertConfig();

  const next = {
    emailFrom: normalized.emailFrom ?? current.emailFrom,
    emailTo: normalized.emailTo ?? current.emailTo,
    tempMin: normalized.tempMin ?? current.tempMin,
    tempMax: normalized.tempMax ?? current.tempMax,
    humMin: normalized.humMin ?? current.humMin,
    humMax: normalized.humMax ?? current.humMax,
    voltMin: normalized.voltMin ?? current.voltMin,
    cooldownMinutes: normalized.cooldownMinutes ?? current.cooldownMinutes,
    enabled: normalized.enabled ?? current.enabled,
  };

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
        cooldown_minutes = $8,
        enabled = $9,
        updated_at = NOW()
      WHERE id = 1
      RETURNING *;
    `,
    [
      next.emailFrom,
      next.emailTo,
      next.tempMin,
      next.tempMax,
      next.humMin,
      next.humMax,
      next.voltMin,
      Math.floor(next.cooldownMinutes),
      next.enabled,
    ]
  );

  return mapAlertConfigRow(rows[0]);
}

function mapSensorThresholdRow(row) {
  return {
    sensorId: Number(row.sensor_id),
    sensorName: row.sensor_name,
    tempMin: Number(row.temp_min),
    tempMax: Number(row.temp_max),
    humMin: Number(row.hum_min),
    humMax: Number(row.hum_max),
    voltMin: Number(row.volt_min),
    pressureMin: Number(row.pressure_min),
    pressureMax: Number(row.pressure_max),
    lightMin: Number(row.light_min),
    lightMax: Number(row.light_max),
    hasPressure: Boolean(row.has_pressure),
    hasLight: Boolean(row.has_light),
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at,
  };
}

function normalizeSensorThresholdInput(payload = {}) {
  const normalized = {
    sensorId: Number(payload.sensorId),
    tempMin: Number(payload.tempMin),
    tempMax: Number(payload.tempMax),
    humMin: Number(payload.humMin),
    humMax: Number(payload.humMax),
    voltMin: Number(payload.voltMin),
    pressureMin: Number(payload.pressureMin),
    pressureMax: Number(payload.pressureMax),
    lightMin: Number(payload.lightMin),
    lightMax: Number(payload.lightMax),
    enabled: payload.enabled !== false,
  };

  if (!Number.isFinite(normalized.sensorId)) {
    throw new Error("sensorId invalido.");
  }

  validateThresholdRange(normalized);

  return normalized;
}

export async function getSensorAlertThresholds() {
  await ensureAlertConfigSchema();
  await ensureSensorThresholdRows();

  const { rows } = await query(`
    SELECT
      s.id AS sensor_id,
      COALESCE(NULLIF(s.title, ''), 'Sensor ' || s.id::text) AS sensor_name,
      sat.temp_min,
      sat.temp_max,
      sat.hum_min,
      sat.hum_max,
      sat.volt_min,
      sat.pressure_min,
      sat.pressure_max,
      sat.light_min,
      sat.light_max,
      (
        COALESCE(sm.has_pressure, FALSE)
        OR (
          COALESCE(
            NULLIF(BTRIM(s.last_payload -> 'field9' ->> 'value'), ''),
            NULLIF(BTRIM(s.last_payload ->> 'field9'), '')
          ) IS NOT NULL
          AND LOWER(
            COALESCE(
              NULLIF(BTRIM(s.last_payload -> 'field9' ->> 'value'), ''),
              NULLIF(BTRIM(s.last_payload ->> 'field9'), '')
            )
          ) <> 'null'
        )
      ) AS has_pressure,
      (
        COALESCE(sm.has_light, FALSE)
        OR (
          COALESCE(
            NULLIF(BTRIM(s.last_payload -> 'field6' ->> 'value'), ''),
            NULLIF(BTRIM(s.last_payload ->> 'field6'), '')
          ) IS NOT NULL
          AND LOWER(
            COALESCE(
              NULLIF(BTRIM(s.last_payload -> 'field6' ->> 'value'), ''),
              NULLIF(BTRIM(s.last_payload ->> 'field6'), '')
            )
          ) <> 'null'
        )
      ) AS has_light,
      sat.enabled,
      sat.updated_at
    FROM sensors s
    INNER JOIN sensor_alert_thresholds sat ON sat.sensor_id = s.id
    LEFT JOIN LATERAL (
      SELECT
        BOOL_OR(sr.presion IS NOT NULL) AS has_pressure,
        BOOL_OR(sr.luz IS NOT NULL) AS has_light
      FROM sensor_readings sr
      WHERE sr.sensor_id = s.id
    ) sm ON TRUE
    ORDER BY s.title ASC;
  `);

  return rows.map(mapSensorThresholdRow);
}

export async function updateSensorAlertThresholds(payload = {}) {
  await ensureAlertConfigSchema();

  const items = Array.isArray(payload.thresholds) ? payload.thresholds : [];

  if (items.length === 0) {
    throw new Error("Debes enviar al menos un umbral por sensor.");
  }

  for (const item of items) {
    const threshold = normalizeSensorThresholdInput(item);

    await query(
      `
        INSERT INTO sensor_alert_thresholds (
          sensor_id,
          temp_min,
          temp_max,
          hum_min,
          hum_max,
          volt_min,
          pressure_min,
          pressure_max,
          light_min,
          light_max,
          enabled,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (sensor_id)
        DO UPDATE SET
          temp_min = EXCLUDED.temp_min,
          temp_max = EXCLUDED.temp_max,
          hum_min = EXCLUDED.hum_min,
          hum_max = EXCLUDED.hum_max,
          volt_min = EXCLUDED.volt_min,
          pressure_min = EXCLUDED.pressure_min,
          pressure_max = EXCLUDED.pressure_max,
          light_min = EXCLUDED.light_min,
          light_max = EXCLUDED.light_max,
          enabled = EXCLUDED.enabled,
          updated_at = NOW();
      `,
      [
        threshold.sensorId,
        threshold.tempMin,
        threshold.tempMax,
        threshold.humMin,
        threshold.humMax,
        threshold.voltMin,
        threshold.pressureMin,
        threshold.pressureMax,
        threshold.lightMin,
        threshold.lightMax,
        threshold.enabled,
      ]
    );
  }

  return getSensorAlertThresholds();
}
