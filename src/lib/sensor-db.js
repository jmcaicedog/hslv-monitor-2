import { query } from "./db.js";

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

  schemaEnsured = true;
}

export async function getSensorsOverview() {
  const { rows } = await query(
    `
      SELECT
        s.id,
        s.title,
        s.description,
        s.status,
        r.observed_at,
        r.temperatura,
        r.humedad,
        r.voltaje,
        r.presion,
        r.luz
      FROM sensors s
      LEFT JOIN LATERAL (
        SELECT observed_at, temperatura, humedad, voltaje, presion, luz
        FROM sensor_readings
        WHERE sensor_id = s.id
        ORDER BY observed_at DESC
        LIMIT 1
      ) r ON TRUE
      ORDER BY s.title ASC;
    `
  );

  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    description: row.description,
    status: row.status,
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
      AND observed_at >= (
        COALESCE(
          (
            SELECT MAX(observed_at)
            FROM sensor_readings
            WHERE sensor_id = $1
              AND source <> 'api_last'
          ),
          (
            SELECT MAX(observed_at)
            FROM sensor_readings
            WHERE sensor_id = $1
          )
        )
      ) - make_interval(hours => $2::int)
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
      ORDER BY observed_at DESC;
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