import { query } from "./db.js";
import { ensureAlertRuntimeSchema } from "./alerts.js";

let schemaEnsured = false;

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
        COALESCE(sas.active_alarm, FALSE) AS active_alarm,
        COALESCE(sas.silenced, FALSE) AS alarm_silenced,
        COALESCE(sas.active_metrics, '[]'::jsonb) AS active_metrics,
        r.last_observed_at AS observed_at,
        r.temperatura,
        r.humedad,
        r.voltaje,
        r.presion,
        r.luz
      FROM sensors s
      LEFT JOIN sensor_alarm_state sas ON sas.sensor_id = s.id
      LEFT JOIN LATERAL (
        SELECT
          MAX(observed_at) AS last_observed_at,
          (ARRAY_AGG(temperatura ORDER BY observed_at DESC)
            FILTER (WHERE temperatura IS NOT NULL))[1] AS temperatura,
          (ARRAY_AGG(humedad ORDER BY observed_at DESC)
            FILTER (WHERE humedad IS NOT NULL))[1] AS humedad,
          (ARRAY_AGG(voltaje ORDER BY observed_at DESC)
            FILTER (WHERE voltaje IS NOT NULL))[1] AS voltaje,
          (ARRAY_AGG(presion ORDER BY observed_at DESC)
            FILTER (WHERE presion IS NOT NULL))[1] AS presion,
          (ARRAY_AGG(luz ORDER BY observed_at DESC)
            FILTER (WHERE luz IS NOT NULL))[1] AS luz
        FROM sensor_readings
        WHERE sensor_id = s.id
      ) r ON TRUE
      ORDER BY s.title ASC;
    `
  );

  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    description: row.description,
    status: row.status,
    activeAlarm: Boolean(row.active_alarm),
    alarmSilenced: Boolean(row.alarm_silenced),
    hasActiveAlarm: Boolean(row.active_alarm) && !Boolean(row.alarm_silenced),
    activeAlarmMetrics: Array.isArray(row.active_metrics) ? row.active_metrics : [],
    createdAt: row.observed_at,
    temperature: row.temperatura,
    humidity: row.humedad,
    voltage: row.voltaje,
    pressure: row.presion,
    light: row.luz,
  }));
}

export async function getSensorReadingsByRange({ sensorId, hours, month }) {
  const sensorMeta = await query(
    `SELECT id, title FROM sensors WHERE id = $1 LIMIT 1;`,
    [sensorId]
  );

  if (sensorMeta.rows.length === 0) {
    return { sensorName: String(sensorId), data: [] };
  }

  let whereSql = "";
  let params = [sensorId];

  if (month) {
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

  const { rows } = await query(
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