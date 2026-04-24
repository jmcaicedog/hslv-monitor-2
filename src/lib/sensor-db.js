import { query } from "./db.js";
import { ensureAlertRuntimeSchema } from "./alerts.js";

let schemaEnsured = false;

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

export async function ensureSensorSchema() {
  if (schemaEnsured) {
    return;
  }

  await query(`
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

  await query(`
    CREATE TABLE IF NOT EXISTS sensor_readings (
      sensor_id BIGINT NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
      observed_at TIMESTAMPTZ NOT NULL,
      temperatura DOUBLE PRECISION,
      humedad DOUBLE PRECISION,
      voltaje DOUBLE PRECISION,
      presion DOUBLE PRECISION,
      luz DOUBLE PRECISION,
      source TEXT NOT NULL DEFAULT 'api',
      inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (sensor_id, observed_at)
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_time
      ON sensor_readings(sensor_id, observed_at DESC);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sync_pending_sensors (
      sensor_id BIGINT PRIMARY KEY REFERENCES sensors(id) ON DELETE CASCADE,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_sync_pending_sensors_next_retry
      ON sync_pending_sensors(next_retry_at ASC);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sync_runtime_state (
      state_key TEXT PRIMARY KEY,
      cursor INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

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
      voltage: parsePayloadMetric(payload, "field3") ?? row.voltaje,
      pressure: parsePayloadMetric(payload, "field9") ?? row.presion,
      light: parsePayloadMetric(payload, "field6") ?? row.luz,
    };
  });
}

export async function getSensorReadingsByRange({ sensorId, hours, month, startDate, endDate }) {
  const sensorMeta = await query(
    `SELECT id, title FROM sensors WHERE id = $1 LIMIT 1;`,
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
      voltaje: row.voltaje,
      presion: row.presion,
      luz: row.luz,
    })),
  };
}