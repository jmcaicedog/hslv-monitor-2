import { ensureSensorSchema } from "./sensor-db.js";
import { query } from "./db.js";

const BATCH_SIZE = 1000;
const FEEDS_RESULTS_LIMIT = 288;
const UBIBOT_MAX_RETRIES = 3;
const UBIBOT_RETRY_BACKOFF_MS = 4000;
const UBIBOT_ENABLE_RETRY = process.env.UBIBOT_ENABLE_RETRY === "true";

function parseSensorIdFilter(raw) {
  if (!raw) return null;

  const set = new Set(
    String(raw)
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isFinite(id))
  );

  return set.size > 0 ? set : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response, bodyText) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const sec = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(sec) && sec > 0) {
      return sec * 1000;
    }
  }

  const match = bodyText.match(/another\s+(\d+)\s+seconds?/i);
  if (match) {
    const sec = Number.parseInt(match[1], 10);
    if (Number.isFinite(sec) && sec > 0) {
      return sec * 1000;
    }
  }

  return null;
}

async function fetchJsonWithRetry(url, { label, maxRetries = UBIBOT_MAX_RETRIES } = {}) {
  const allowedRetries = UBIBOT_ENABLE_RETRY ? maxRetries : 0;

  for (let attempt = 0; attempt <= allowedRetries; attempt += 1) {
    const response = await fetch(url);
    const rawBody = await response.text();

    let payload = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = null;
    }

    if (response.ok) {
      return { ok: true, status: response.status, payload };
    }

    const bodyText = String(rawBody || "");
    const isRateLimited =
      response.status === 429 ||
      /rate\s*limit|too\s*many\s*requests|another\s+\d+\s+seconds?/i.test(bodyText);

    if (!isRateLimited || attempt === allowedRetries) {
      return { ok: false, status: response.status, payload, rawBody: bodyText };
    }

    const retryAfterMs = parseRetryAfterMs(response, bodyText);
    const waitMs = retryAfterMs ?? UBIBOT_RETRY_BACKOFF_MS * (attempt + 1);
    console.warn(
      `[ubibot-sync] ${label || "request"} limitado por rate limit (${response.status}). Reintentando en ${Math.ceil(waitMs / 1000)}s...`
    );
    await sleep(waitMs);
  }

  return { ok: false, status: 0, payload: null, rawBody: "" };
}

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

function parseJsonEnv(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function mapFeedRecord(sensorId, feed) {
  const observedAt = new Date(feed.created_at);
  if (Number.isNaN(observedAt.getTime())) return null;

  return {
    sensorId,
    observedAt: observedAt.toISOString(),
    temperatura: parseNumber(feed.field1?.avg ?? feed.field1),
    humedad: parseNumber(feed.field2?.avg ?? feed.field2),
    voltaje: parseNumber(feed.field3?.avg ?? feed.field3),
    presion: parseNumber(feed.field9?.avg ?? feed.field9),
    luz: parseNumber(feed.field6?.avg ?? feed.field6),
  };
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

async function fetchFeedsWithApiKey({ sensorId, apiKey }) {
  if (!apiKey) {
    return { ok: false, status: 0, feeds: [] };
  }

  const result = await fetchJsonWithRetry(
    `https://webapi.ubibot.com/channels/${sensorId}/feeds.json?api_key=${encodeURIComponent(apiKey)}&results=${FEEDS_RESULTS_LIMIT}`,
    { label: `feeds sensor ${sensorId}` }
  );

  if (!result.ok) {
    return { ok: false, status: result.status, feeds: [] };
  }

  const payload = result.payload || {};
  return {
    ok: true,
    status: result.status,
    feeds: payload.feeds || [],
  };
}

export async function runUbiBotSync() {
  await ensureSensorSchema();

  const accountKey = process.env.UBIBOT_ACCOUNT_KEY || process.env.NEXT_PUBLIC_UBIBOT_KEY;
  if (!accountKey) {
    throw new Error("UBIBOT_ACCOUNT_KEY o NEXT_PUBLIC_UBIBOT_KEY no esta configurada.");
  }

  const channelApiKeys = parseJsonEnv(process.env.UBIBOT_CHANNEL_API_KEYS_JSON);

  const channelsResult = await fetchJsonWithRetry(
    `https://webapi.ubibot.com/channels?account_key=${accountKey}`,
    { label: "channels" }
  );

  if (!channelsResult.ok) {
    throw new Error(`No se pudo consultar canales Ubibot (${channelsResult.status}).`);
  }

  const channelsPayload = channelsResult.payload || {};
  const channels = channelsPayload.channels || [];
  const sensorFilter = parseSensorIdFilter(process.env.UBIBOT_ONLY_SENSOR_IDS);
  const channelsToProcess = sensorFilter
    ? channels.filter((channel) => sensorFilter.has(Number(channel.channel_id)))
    : channels;

  let totalInserted = 0;
  let syncedChannels = 0;

  for (const channel of channelsToProcess) {
    const sensorId = Number(channel.channel_id);
    if (!Number.isFinite(sensorId)) continue;

    let lastPayload = null;
    try {
      lastPayload = channel.last_values ? JSON.parse(channel.last_values) : null;
    } catch {
      lastPayload = null;
    }

    const lastSeenAt =
      lastPayload?.field1?.created_at ||
      lastPayload?.field2?.created_at ||
      lastPayload?.field3?.created_at ||
      null;

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
      ? [
          {
            sensorId,
            observedAt:
              lastPayload.field1?.created_at ||
              lastPayload.field2?.created_at ||
              lastPayload.field3?.created_at ||
              new Date().toISOString(),
            temperatura: parseNumber(lastPayload.field1?.value),
            humedad: parseNumber(lastPayload.field2?.value),
            voltaje: parseNumber(lastPayload.field3?.value),
            presion: parseNumber(lastPayload.field9?.value),
            luz: parseNumber(lastPayload.field6?.value),
          },
        ]
      : [];

    for (const batch of chunk(latestReading, BATCH_SIZE)) {
      await upsertReadings(batch, "api_last");
      totalInserted += batch.length;
    }

    const apiKeyForChannel = channelApiKeys[String(sensorId)] || null;
    const feedsPayload = await fetchFeedsWithApiKey({
      sensorId,
      apiKey: apiKeyForChannel,
    });

    let readings = [];
    let sourceForSeries = "api_summary";

    if (feedsPayload.ok && feedsPayload.feeds.length > 0) {
      readings = feedsPayload.feeds.map((feed) => mapFeedRecord(sensorId, feed)).filter(Boolean);
      sourceForSeries = "api_feed";
    } else {
      const summaryResult = await fetchJsonWithRetry(
        `https://webapi.ubibot.com/channels/${sensorId}/summary.json?account_key=${accountKey}`,
        { label: `summary sensor ${sensorId}` }
      );

      if (!summaryResult.ok) {
        continue;
      }

      const summaryPayload = summaryResult.payload || {};
      const feeds = summaryPayload.feeds || [];
      readings = feeds.map((feed) => mapFeedRecord(sensorId, feed)).filter(Boolean);
    }

    for (const batch of chunk(readings, BATCH_SIZE)) {
      await upsertReadings(batch, sourceForSeries);
      totalInserted += batch.length;
    }

    syncedChannels += 1;
  }

  return {
    syncedChannels,
    totalInserted,
  };
}
