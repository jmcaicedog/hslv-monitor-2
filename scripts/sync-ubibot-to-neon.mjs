import "dotenv/config";
import { ensureSensorSchema } from "../src/lib/sensor-db.js";
import { query } from "../src/lib/db.js";

const BATCH_SIZE = 1000;

function parseNumber(raw) {
  if (raw == null || raw === "") return null;
  const num = Number.parseFloat(String(raw).replace(",", "."));
  return Number.isNaN(num) ? null : num;
}

function chunk(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function upsertReadings(rows, source) {
  if (rows.length === 0) return;

  const sensorIds = rows.map((r) => r.sensorId);
  const observedAt = rows.map((r) => r.observedAt);
  const temperatura = rows.map((r) => r.temperatura);
  const humedad = rows.map((r) => r.humedad);
  const voltaje = rows.map((r) => r.voltaje);
  const presion = rows.map((r) => r.presion);
  const luz = rows.map((r) => r.luz);
  const sourceArr = rows.map(() => source);

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
    [sensorIds, observedAt, temperatura, humedad, voltaje, presion, luz, sourceArr]
  );
}

async function main() {
  await ensureSensorSchema();

  const accountKey = process.env.UBIBOT_ACCOUNT_KEY || process.env.NEXT_PUBLIC_UBIBOT_KEY;

  if (!accountKey) {
    throw new Error("UBIBOT_ACCOUNT_KEY o NEXT_PUBLIC_UBIBOT_KEY no esta configurada.");
  }

  const channelsResponse = await fetch(
    `https://webapi.ubibot.com/channels?account_key=${accountKey}`
  );

  if (!channelsResponse.ok) {
    throw new Error(`No se pudo consultar canales Ubibot (${channelsResponse.status}).`);
  }

  const channelsPayload = await channelsResponse.json();
  const channels = channelsPayload.channels || [];

  let totalInserted = 0;

  for (const channel of channels) {
    const sensorId = Number(channel.channel_id);
    if (!Number.isFinite(sensorId)) continue;

    let lastPayload = null;
    try {
      lastPayload = channel.last_values ? JSON.parse(channel.last_values) : null;
    } catch {
      lastPayload = null;
    }

    const lastSeenAt = lastPayload?.field1?.created_at || null;

    await query(
      `
        INSERT INTO sensors (id, title, description, status, last_payload, last_seen_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        ON CONFLICT (id)
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          last_payload = EXCLUDED.last_payload,
          last_seen_at = COALESCE(EXCLUDED.last_seen_at, sensors.last_seen_at),
          updated_at = NOW();
      `,
      [
        sensorId,
        channel.name || `Sensor ${sensorId}`,
        channel.description || "",
        Number.isFinite(Number(channel.net)) ? Number(channel.net) : null,
        JSON.stringify(lastPayload),
        lastSeenAt,
      ]
    );

    const latestReading = lastPayload
      ? [{
          sensorId,
          observedAt: lastPayload.field1?.created_at || new Date().toISOString(),
          temperatura: parseNumber(lastPayload.field1?.value),
          humedad: parseNumber(lastPayload.field2?.value),
          voltaje: parseNumber(lastPayload.field3?.value),
          presion: parseNumber(lastPayload.field9?.value),
          luz: parseNumber(lastPayload.field6?.value),
        }]
      : [];

    for (const batch of chunk(latestReading, BATCH_SIZE)) {
      await upsertReadings(batch, "api_last");
      totalInserted += batch.length;
    }

    const summaryResponse = await fetch(
      `https://webapi.ubibot.com/channels/${sensorId}/summary.json?account_key=${accountKey}`
    );

    if (!summaryResponse.ok) {
      console.warn(`No se pudo consultar summary para sensor ${sensorId}.`);
      continue;
    }

    const summaryPayload = await summaryResponse.json();
    const feeds = summaryPayload.feeds || [];

    const readings = feeds
      .map((feed) => {
        const observedAt = new Date(feed.created_at);
        if (Number.isNaN(observedAt.getTime())) return null;

        return {
          sensorId,
          observedAt: observedAt.toISOString(),
          temperatura: parseNumber(feed.field1?.avg),
          humedad: parseNumber(feed.field2?.avg),
          voltaje: parseNumber(feed.field3?.avg),
          presion: parseNumber(feed.field9?.avg),
          luz: parseNumber(feed.field6?.avg),
        };
      })
      .filter(Boolean);

    for (const batch of chunk(readings, BATCH_SIZE)) {
      await upsertReadings(batch, "api_summary");
      totalInserted += batch.length;
    }

    console.log(`Sincronizado sensor ${sensorId}: ${readings.length} registros summary`);
  }

  console.log(`Sincronizacion completada. Registros procesados: ${totalInserted}`);
}

main().catch((error) => {
  console.error("Fallo la sincronizacion Ubibot -> Neon:", error);
  process.exit(1);
});
