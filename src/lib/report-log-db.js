import { query } from "./db.js";
import { ensureSensorSchema } from "./sensor-db.js";

export const REPORT_TYPES = ["pdf", "csv", "out-of-range-pdf"];

const REPORT_TYPE_LABELS = {
  pdf: "PDF general",
  csv: "CSV de tablas",
  "out-of-range-pdf": "PDF fuera de rango",
};

export function getReportTypeLabel(reportType) {
  return REPORT_TYPE_LABELS[reportType] || reportType || "Reporte";
}

function toTimestampOrNull(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapRow(row) {
  return {
    id: Number(row.id),
    sensorId: row.sensor_id == null ? null : Number(row.sensor_id),
    sensorName: row.sensor_name,
    reportType: row.report_type,
    reportTypeLabel: getReportTypeLabel(row.report_type),
    observations: row.observations || "",
    rangeLabel: row.range_label || "",
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    createdAt: row.created_at,
  };
}

export async function insertReportLog({
  sensorId,
  sensorName,
  reportType,
  observations,
  rangeLabel,
  rangeStart,
  rangeEnd,
  userId,
  userName,
  userEmail,
}) {
  await ensureSensorSchema();

  const { rows } = await query(
    `
      INSERT INTO report_logs (
        sensor_id,
        sensor_name,
        report_type,
        observations,
        range_label,
        range_start,
        range_end,
        user_id,
        user_name,
        user_email
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING
        id,
        sensor_id,
        sensor_name,
        report_type,
        observations,
        range_label,
        range_start,
        range_end,
        user_id,
        user_name,
        user_email,
        created_at;
    `,
    [
      sensorId ?? null,
      sensorName || null,
      reportType,
      observations || null,
      rangeLabel || null,
      toTimestampOrNull(rangeStart),
      toTimestampOrNull(rangeEnd),
      userId || null,
      userName || null,
      userEmail || null,
    ]
  );

  return mapRow(rows[0]);
}

export async function listReportLogs({ limit = 50, offset = 0, from, to } = {}) {
  await ensureSensorSchema();

  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const fromTs = toTimestampOrNull(from);
  const toTs = toTimestampOrNull(to);

  const filters = [];
  const filterParams = [];

  if (fromTs) {
    filterParams.push(fromTs);
    filters.push(`rl.created_at >= $${filterParams.length}`);
  }

  if (toTs) {
    filterParams.push(toTs);
    filters.push(`rl.created_at <= $${filterParams.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const { rows } = await query(
    `
      SELECT
        rl.id,
        rl.sensor_id,
        COALESCE(
          NULLIF(s.title, ''),
          NULLIF(rl.sensor_name, ''),
          'Sensor ' || COALESCE(rl.sensor_id::text, 'desconocido')
        ) AS sensor_name,
        rl.report_type,
        rl.observations,
        rl.range_label,
        rl.range_start,
        rl.range_end,
        rl.user_id,
        rl.user_name,
        rl.user_email,
        rl.created_at
      FROM report_logs rl
      LEFT JOIN sensors s ON s.id = rl.sensor_id
      ${whereClause}
      ORDER BY rl.created_at DESC
      LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2};
    `,
    [...filterParams, safeLimit, safeOffset]
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM report_logs rl ${whereClause};`,
    filterParams
  );

  return {
    logs: rows.map(mapRow),
    total: countRows[0]?.total || 0,
  };
}
