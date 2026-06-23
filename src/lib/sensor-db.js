import { query, withDbClient } from "./db.js";
import { ensureAlertRuntimeSchema } from "./alerts.js";

let schemaEnsured = false;
const SENSOR_SCHEMA_VERSION = 8;
const SENSOR_SCHEMA_STATE_KEY = "sensor_schema_version";
const SENSOR_SCHEMA_LOCK_KEY_A = 240513;
const SENSOR_SCHEMA_LOCK_KEY_B = 99872;

function parsePayloadMetric(payload, key) {
  const raw = payload?.[key]?.value ?? payload?.[key] ?? null;

  if (raw == null) {
    return null;
  }

  const text = String(raw).trim();
  if (!text || text.toLowerCase() === "null") {
    return null;
  }

  const parsed = Number.parseFloat(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTextForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isCarroDeParoSensor({ title, description }) {
  const haystack = `${normalizeTextForMatch(title)} ${normalizeTextForMatch(description)}`;
  return haystack.includes("carro de paro");
}

function parsePayloadMetricAny(payload, keys) {
  for (const key of keys) {
    const metric = parsePayloadMetric(payload, key);
    if (metric !== null) {
      return metric;
    }
  }

  return null;
}

export async function ensureSensorSchema() {
  if (schemaEnsured) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS sync_runtime_state (
      state_key TEXT PRIMARY KEY,
      cursor INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const versionRows = await query(
    `
      SELECT cursor
      FROM sync_runtime_state
      WHERE state_key = $1
      LIMIT 1;
    `,
    [SENSOR_SCHEMA_STATE_KEY]
  );

  const currentVersion = Number(versionRows.rows?.[0]?.cursor || 0);
  if (currentVersion >= SENSOR_SCHEMA_VERSION) {
    schemaEnsured = true;
    return;
  }

  await withDbClient(async (client) => {
    await client.query(`SELECT pg_advisory_lock($1::integer, $2::integer);`, [
      SENSOR_SCHEMA_LOCK_KEY_A,
      SENSOR_SCHEMA_LOCK_KEY_B,
    ]);

    try {
      const lockedVersionRows = await client.query(
        `
          SELECT cursor
          FROM sync_runtime_state
          WHERE state_key = $1
          LIMIT 1;
        `,
        [SENSOR_SCHEMA_STATE_KEY]
      );

      const lockedVersion = Number(lockedVersionRows.rows?.[0]?.cursor || 0);
      if (lockedVersion >= SENSOR_SCHEMA_VERSION) {
        return;
      }

      await client.query(`
        CREATE TABLE IF NOT EXISTS sensors (
          id BIGINT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          status INTEGER,
          last_payload JSONB,
          last_seen_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS sensor_readings (
          sensor_id BIGINT NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
          observed_at TIMESTAMPTZ NOT NULL,
          temperatura DOUBLE PRECISION,
          humedad DOUBLE PRECISION,
          temperatura_2 DOUBLE PRECISION,
          humedad_2 DOUBLE PRECISION,
          voltaje DOUBLE PRECISION,
          presion DOUBLE PRECISION,
          luz DOUBLE PRECISION,
          source TEXT NOT NULL DEFAULT 'api',
          inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (sensor_id, observed_at)
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_time
          ON sensor_readings(sensor_id, observed_at DESC);
      `);

      await client.query(`
        ALTER TABLE sensor_readings
        ADD COLUMN IF NOT EXISTS temperatura_2 DOUBLE PRECISION;
      `);

      await client.query(`
        ALTER TABLE sensor_readings
        ADD COLUMN IF NOT EXISTS humedad_2 DOUBLE PRECISION;
      `);

      // Corrige historico previo de Carro de Paro donde se guardo luz/voltaje invertidos.
      await client.query(`
        UPDATE sensor_readings sr
        SET
          voltaje = sr.luz,
          luz = sr.voltaje
        FROM sensors s
        WHERE s.id = sr.sensor_id
          AND (
            COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')
          ) ~* 'carro\\s*(de\\s*)?paro';
      `);

      // Carro de Paro no usa presion; limpia historico y valores invalidos arrastrados.
      await client.query(`
        UPDATE sensor_readings sr
        SET presion = NULL
        FROM sensors s
        WHERE s.id = sr.sensor_id
          AND (
            COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')
          ) ~* 'carro\\s*(de\\s*)?paro';
      `);

      await client.query(`
        UPDATE sensor_readings sr
        SET humedad_2 = NULL
        FROM sensors s
        WHERE s.id = sr.sensor_id
          AND sr.humedad_2 < 0
          AND (
            COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')
          ) ~* 'carro\\s*(de\\s*)?paro';
      `);

      await client.query(`
        UPDATE sensor_readings sr
        SET
          temperatura_2 = NULL,
          humedad_2 = NULL
        FROM sensors s
        WHERE s.id = sr.sensor_id
          AND (
            COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')
          ) ~* 'carro\\s*(de\\s*)?paro'
          AND (
            sr.temperatura_2 IS NOT NULL AND sr.temperatura_2 < 10
            OR sr.humedad_2 IS NOT NULL AND sr.humedad_2 < 0
          );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS sync_pending_sensors (
          sensor_id BIGINT PRIMARY KEY REFERENCES sensors(id) ON DELETE CASCADE,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sync_pending_sensors_next_retry
          ON sync_pending_sensors(next_retry_at ASC);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS sync_run_metrics (
          run_id TEXT PRIMARY KEY,
          attempted_channels INTEGER NOT NULL,
          processed_channels INTEGER NOT NULL,
          synced_channels INTEGER NOT NULL,
          failed_channels INTEGER NOT NULL,
          deferred_series_channels INTEGER NOT NULL,
          deferred_unprocessed_channels INTEGER NOT NULL DEFAULT 0,
          pending_retries INTEGER NOT NULL,
          retried_from_pending INTEGER NOT NULL,
          due_pending_total INTEGER NOT NULL,
          elapsed_ms INTEGER NOT NULL,
          time_budget_ms INTEGER,
          feeds_results_limit INTEGER NOT NULL,
          stopped_due_to_time_budget BOOLEAN NOT NULL DEFAULT FALSE,
          lock_skipped BOOLEAN NOT NULL DEFAULT FALSE,
          pending_quota_share DOUBLE PRECISION NOT NULL DEFAULT 0.7,
          rate_limit_hits INTEGER NOT NULL DEFAULT 0,
          request_timeout_hits INTEGER NOT NULL DEFAULT 0,
          feeds_permission_denied_hits INTEGER NOT NULL DEFAULT 0,
          account_key_feeds_denied_mode BOOLEAN NOT NULL DEFAULT FALSE,
          circuit_broken BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE sync_run_metrics
        ADD COLUMN IF NOT EXISTS pending_quota_share DOUBLE PRECISION NOT NULL DEFAULT 0.7;
      `);

      await client.query(`
        ALTER TABLE sync_run_metrics
        ADD COLUMN IF NOT EXISTS rate_limit_hits INTEGER NOT NULL DEFAULT 0;
      `);

      await client.query(`
        ALTER TABLE sync_run_metrics
        ADD COLUMN IF NOT EXISTS request_timeout_hits INTEGER NOT NULL DEFAULT 0;
      `);

      await client.query(`
        ALTER TABLE sync_run_metrics
        ADD COLUMN IF NOT EXISTS feeds_permission_denied_hits INTEGER NOT NULL DEFAULT 0;
      `);

      await client.query(`
        ALTER TABLE sync_run_metrics
        ADD COLUMN IF NOT EXISTS account_key_feeds_denied_mode BOOLEAN NOT NULL DEFAULT FALSE;
      `);

      await client.query(`
        ALTER TABLE sync_run_metrics
        ADD COLUMN IF NOT EXISTS circuit_broken BOOLEAN NOT NULL DEFAULT FALSE;
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sync_run_metrics_created_at
          ON sync_run_metrics(created_at DESC);
      `);

      await client.query(
        `
          INSERT INTO sync_runtime_state (state_key, cursor, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (state_key)
          DO UPDATE SET
            cursor = EXCLUDED.cursor,
            updated_at = NOW();
        `,
        [SENSOR_SCHEMA_STATE_KEY, SENSOR_SCHEMA_VERSION]
      );
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1::integer, $2::integer);`, [
        SENSOR_SCHEMA_LOCK_KEY_A,
        SENSOR_SCHEMA_LOCK_KEY_B,
      ]);
    }
  });

  schemaEnsured = true;
}

export async function getSensorsOverview() {
  await ensureAlertRuntimeSchema();

  const { rows } = await query(
    `
      SELECT
        s.id,
        s.title,
        s.description,
        s.status,
        s.last_payload,
        COALESCE(sas.active_alarm, FALSE) AS active_alarm,
        COALESCE(sas.silenced, FALSE) AS alarm_silenced,
        COALESCE(sas.active_metrics, '[]'::jsonb) AS active_metrics,
        COALESCE(s.last_seen_at, lr.observed_at) AS observed_at,
        lr.temperatura,
        lr.humedad,
        lr.temperatura_2,
        lr.humedad_2,
        lr.voltaje,
        lr.presion,
        lr.luz
      FROM sensors s
      LEFT JOIN sensor_alarm_state sas ON sas.sensor_id = s.id
      LEFT JOIN LATERAL (
        SELECT
          sr.observed_at,
          sr.temperatura,
          sr.humedad,
          sr.temperatura_2,
          sr.humedad_2,
          sr.voltaje,
          sr.presion,
          sr.luz
        FROM sensor_readings sr
        WHERE sr.sensor_id = s.id
        ORDER BY sr.observed_at DESC
        LIMIT 1
      ) lr ON TRUE
      ORDER BY s.title ASC;
    `
  );

  return rows.map((row) => {
    const payload =
      row.last_payload && typeof row.last_payload === "object" ? row.last_payload : null;

    const isCarroDeParo = isCarroDeParoSensor({
      title: row.title,
      description: row.description,
    });

    return {
      id: Number(row.id),
      title: row.title,
      description: row.description,
      status: row.status,
      activeAlarm: Boolean(row.active_alarm),
      alarmSilenced: Boolean(row.alarm_silenced),
      hasActiveAlarm: Boolean(row.active_alarm) && !Boolean(row.alarm_silenced),
      activeAlarmMetrics: Array.isArray(row.active_metrics) ? row.active_metrics : [],
      createdAt: row.observed_at,
      temperature: parsePayloadMetric(payload, "field1") ?? row.temperatura,
      humidity: parsePayloadMetric(payload, "field2") ?? row.humedad,
      temperatureSecondary: isCarroDeParo
        ? parsePayloadMetricAny(payload, ["field9"]) ?? row.temperatura_2
        : null,
      humiditySecondary: isCarroDeParo
        ? parsePayloadMetricAny(payload, ["field10"]) ?? row.humedad_2
        : null,
      voltage: isCarroDeParo
        ? parsePayloadMetricAny(payload, ["field4"]) ?? row.voltaje
        : parsePayloadMetricAny(payload, ["field3"]) ?? row.voltaje,
      pressure: isCarroDeParo
        ? null
        : parsePayloadMetric(payload, "field9") ?? row.presion,
      light: isCarroDeParo
        ? parsePayloadMetricAny(payload, ["field3"]) ?? row.luz
        : parsePayloadMetricAny(payload, ["field6"]) ?? row.luz,
    };
  });
}

export async function getSensorReadingsByRange({ sensorId, hours, month, startDate, endDate }) {
  const sensorMeta = await query(
    `SELECT id, title, description FROM sensors WHERE id = $1 LIMIT 1;`,
    [sensorId]
  );

  if (sensorMeta.rows.length === 0) {
    return { sensorName: String(sensorId), data: [] };
  }

  const boundsResult = await query(
    `
      SELECT
        MIN(observed_at) AS first_observed_at,
        MAX(observed_at) AS last_observed_at
      FROM sensor_readings
      WHERE sensor_id = $1;
    `,
    [sensorId]
  );

  const firstObservedAt = boundsResult.rows[0]?.first_observed_at || null;
  const lastObservedAt = boundsResult.rows[0]?.last_observed_at || null;
  const isCarroDeParo = isCarroDeParoSensor({
    title: sensorMeta.rows[0].title,
    description: sensorMeta.rows[0].description,
  });

  let whereSql = "";
  let params = [sensorId];
  let customRangeDays = 0;
  let customRangeStart = null;
  let customRangeEndExclusive = null;

  const hasCustomRange = Boolean(startDate) && Boolean(endDate);

  if (hasCustomRange) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) {
      throw new Error("Formato de fecha inicial invalido. Usa YYYY-MM-DD");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) {
      throw new Error("Formato de fecha final invalido. Usa YYYY-MM-DD");
    }

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const endInclusive = new Date(`${endDate}T00:00:00.000Z`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(endInclusive.getTime())) {
      throw new Error("Rango de fechas invalido.");
    }

    if (start.getTime() > endInclusive.getTime()) {
      throw new Error("La fecha inicial debe ser menor o igual a la fecha final.");
    }

    const endExclusive = new Date(endInclusive);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    customRangeStart = start;
    customRangeEndExclusive = endExclusive;
    customRangeDays = Math.max(
      1,
      Math.ceil((endExclusive.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
    );

    whereSql = "AND observed_at >= $2 AND observed_at < $3";
    params = [sensorId, start.toISOString(), endExclusive.toISOString()];
  } else if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error("Formato de mes invalido. Usa YYYY-MM");
    }

    const [yearStr, monthStr] = month.split("-");
    const year = Number(yearStr);
    const monthNumber = Number(monthStr);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));

    whereSql = "AND observed_at >= $2 AND observed_at < $3";
    params = [sensorId, start.toISOString(), end.toISOString()];
  } else {
    const parsedHours = Number(hours);
    const safeHours = Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : 24;
    whereSql = `
      AND observed_at >= NOW() - make_interval(hours => $2::int)
    `;
    params = [sensorId, safeHours];
  }

  const shouldAggregateCustomRange = hasCustomRange && customRangeDays > 14;

  const { rows } = shouldAggregateCustomRange
    ? await query(
        `
          SELECT
            CASE
              WHEN $4::int > 120 THEN date_trunc('day', observed_at)
              WHEN $4::int > 45 THEN (
                date_trunc('day', observed_at)
                + ((EXTRACT(HOUR FROM observed_at)::int / 6) * INTERVAL '6 hour')
              )
              ELSE (
                date_trunc('day', observed_at)
                + ((EXTRACT(HOUR FROM observed_at)::int / 3) * INTERVAL '3 hour')
              )
            END AS observed_at,
            AVG(temperatura) AS temperatura,
            AVG(humedad) AS humedad,
            AVG(temperatura_2) AS temperatura_2,
            AVG(humedad_2) AS humedad_2,
            AVG(voltaje) AS voltaje,
            AVG(presion) AS presion,
            AVG(luz) AS luz
          FROM sensor_readings
          WHERE sensor_id = $1
            AND observed_at >= $2
            AND observed_at < $3
          GROUP BY 1
          ORDER BY observed_at ASC;
        `,
        [
          sensorId,
          customRangeStart.toISOString(),
          customRangeEndExclusive.toISOString(),
          customRangeDays,
        ]
      )
    : await query(
        `
          SELECT
            observed_at,
            temperatura,
            humedad,
            temperatura_2,
            humedad_2,
            voltaje,
            presion,
            luz
          FROM sensor_readings
          WHERE sensor_id = $1
          ${whereSql}
          ORDER BY observed_at ASC;
        `,
        params
      );

  return {
    sensorName: sensorMeta.rows[0].title,
    firstObservedAt,
    lastObservedAt,
    data: rows.map((row) => ({
      timestamp: row.observed_at,
      temperatura: row.temperatura,
      humedad: row.humedad,
      temperatura2: row.temperatura_2,
      humedad2: row.humedad_2,
      voltaje: row.voltaje,
        presion: isCarroDeParo ? null : row.presion,
      luz: row.luz,
    })),
  };
}