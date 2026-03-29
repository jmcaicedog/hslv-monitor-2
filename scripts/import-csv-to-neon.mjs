import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { ensureSensorSchema } from "../src/lib/sensor-db.js";
import { query } from "../src/lib/db.js";

const CSV_DIR = path.join(process.cwd(), "public", "csv");
const BATCH_SIZE = 1000;

function parseNumber(raw) {
  if (raw == null || raw === "") return null;
  const num = Number.parseFloat(String(raw).replace(",", "."));
  return Number.isNaN(num) ? null : num;
}

function extractValue(row, aliases) {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return parseNumber(row[key]);
    }
  }
  return null;
}

function extractFieldValue(row, fieldNumber, aliases = []) {
  const direct = extractValue(row, aliases);
  if (direct != null) {
    return direct;
  }

  const normalizedPrefix = `field${fieldNumber}`;

  for (const key of Object.keys(row)) {
    const normalizedKey = key.trim().toLowerCase();

    if (
      normalizedKey === normalizedPrefix ||
      normalizedKey.startsWith(`${normalizedPrefix}(`)
    ) {
      return parseNumber(row[key]);
    }
  }

  return null;
}

function chunk(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function upsertReadings(rows) {
  if (rows.length === 0) return;

  const sensorIds = rows.map((r) => r.sensorId);
  const observedAt = rows.map((r) => r.observedAt);
  const temperatura = rows.map((r) => r.temperatura);
  const humedad = rows.map((r) => r.humedad);
  const voltaje = rows.map((r) => r.voltaje);
  const presion = rows.map((r) => r.presion);
  const luz = rows.map((r) => r.luz);
  const source = rows.map(() => "csv");

  await query(
    `
      INSERT INTO sensor_readings (
        sensor_id,
        observed_at,
        temperatura,
        humedad,
        voltaje,
        presion,
        luz,
        source
      )
      SELECT *
      FROM UNNEST(
        $1::bigint[],
        $2::timestamptz[],
        $3::double precision[],
        $4::double precision[],
        $5::double precision[],
        $6::double precision[],
        $7::double precision[],
        $8::text[]
      )
      ON CONFLICT (sensor_id, observed_at)
      DO UPDATE SET
        temperatura = COALESCE(EXCLUDED.temperatura, sensor_readings.temperatura),
        humedad = COALESCE(EXCLUDED.humedad, sensor_readings.humedad),
        voltaje = COALESCE(EXCLUDED.voltaje, sensor_readings.voltaje),
        presion = COALESCE(EXCLUDED.presion, sensor_readings.presion),
        luz = COALESCE(EXCLUDED.luz, sensor_readings.luz),
        source = EXCLUDED.source;
    `,
    [sensorIds, observedAt, temperatura, humedad, voltaje, presion, luz, source]
  );
}

async function main() {
  await ensureSensorSchema();

  const files = (await readdir(CSV_DIR)).filter((file) => file.endsWith("-feeds.csv"));

  let imported = 0;

  for (const file of files) {
    const sensorIdRaw = file.replace("-feeds.csv", "");
    const sensorId = Number(sensorIdRaw);

    if (!Number.isFinite(sensorId)) {
      console.warn(`Saltando archivo con id invalido: ${file}`);
      continue;
    }

    const fullPath = path.join(CSV_DIR, file);
    const content = await readFile(fullPath, "utf-8");

    const parsed = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
    });

    const readings = [];
    let lastSeenAt = null;

    for (const row of parsed.data) {
      const observedAtRaw = row.created_at;
      if (!observedAtRaw) continue;

      const observedDate = new Date(observedAtRaw);
      if (Number.isNaN(observedDate.getTime())) continue;

      const record = {
        sensorId,
        observedAt: observedDate.toISOString(),
        temperatura: extractFieldValue(row, 1, [
          "field1(Temperatura ºC )",
          "field1(Temperature ºC )",
          "field1",
        ]),
        humedad: extractFieldValue(row, 2, [
          "field2(Humedad)",
          "field2(Humidity)",
          "field2",
        ]),
        voltaje: extractFieldValue(row, 3, ["field3(Voltage)", "field3"]),
        presion: extractFieldValue(row, 9, [
          "field9(Presion atmosferica)",
          "field9(Presión atmosférica)",
          "field9(Atmospheric Pressure)",
          "field9",
        ]),
        luz: extractFieldValue(row, 6, ["field6(Light)", "field6"]),
      };

      readings.push(record);

      if (!lastSeenAt || observedDate > lastSeenAt) {
        lastSeenAt = observedDate;
      }
    }

    await query(
      `
        INSERT INTO sensors (id, title, description, status, last_seen_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id)
        DO UPDATE SET
          last_seen_at = GREATEST(sensors.last_seen_at, EXCLUDED.last_seen_at),
          updated_at = NOW();
      `,
      [sensorId, `Sensor ${sensorId}`, "Importado desde CSV", 1, lastSeenAt?.toISOString() || null]
    );

    for (const batch of chunk(readings, BATCH_SIZE)) {
      await upsertReadings(batch);
      imported += batch.length;
    }

    console.log(`CSV importado: ${file} (${readings.length} registros)`);
  }

  console.log(`Importacion CSV completada. Registros procesados: ${imported}`);
}

main().catch((error) => {
  console.error("Fallo la importacion de CSV a Neon:", error);
  process.exit(1);
});
