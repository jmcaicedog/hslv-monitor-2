import { ensureSensorSchema } from "./sensor-db.js";
import { query, withDbClient } from "./db.js";
import { randomUUID } from "node:crypto";

const BATCH_SIZE = 1000;
const DEFAULT_FEEDS_RESULTS_LIMIT = 2016;
const FEEDS_RESULTS_LIMIT = parsePositiveInt(
  process.env.UBIBOT_FEEDS_RESULTS_LIMIT,
  DEFAULT_FEEDS_RESULTS_LIMIT
);
const UBIBOT_MAX_RETRIES = 3;
const UBIBOT_RETRY_BACKOFF_MS = 4000;
const UBIBOT_ENABLE_RETRY = process.env.UBIBOT_ENABLE_RETRY === "true";
const PENDING_RETRY_BATCH_LIMIT = 200;
const SYNC_CURSOR_STATE_KEY = "channel_cursor";
const MAX_PENDING_ATTEMPTS = 30;
const SYNC_LOCK_KEY_A = 240513;
const SYNC_LOCK_KEY_B = 99871;
const DEFAULT_PENDING_QUOTA_SHARE = 0.7;

function parsePositiveInt(raw, fallback = 0) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

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

function nowMs() {
  return Date.now();
}

function getRemainingMs(deadlineAt) {
  if (!Number.isFinite(deadlineAt)) return Number.POSITIVE_INFINITY;
  return deadlineAt - nowMs();
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

async function fetchJsonWithRetry(
  url,
  {
    label,
    maxRetries = UBIBOT_MAX_RETRIES,
    enableRetry = UBIBOT_ENABLE_RETRY,
    timeoutMs = 10000,
    deadlineAt = Number.POSITIVE_INFINITY,
  } = {}
) {
  const allowedRetries = enableRetry ? maxRetries : 0;

  for (let attempt = 0; attempt <= allowedRetries; attempt += 1) {
    const remainingMs = getRemainingMs(deadlineAt);
    if (remainingMs <= 0) {
      return {
        ok: false,
        status: 408,
        payload: null,
        rawBody: "deadline_exceeded",
      };
    }

    const effectiveTimeoutMs = Math.max(1000, Math.min(timeoutMs, remainingMs));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);

    let response;
    let rawBody = "";

    try {
      response = await fetch(url, { signal: controller.signal });
      rawBody = await response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      const isAbort =
        error instanceof Error &&
        (error.name === "AbortError" || /aborted|timeout/i.test(error.message));

      if (isAbort) {
        return {
          ok: false,
          status: 408,
          payload: null,
          rawBody: "request_timeout",
        };
      }

      return {
        ok: false,
        status: 0,
        payload: null,
        rawBody: error instanceof Error ? error.message : "fetch_error",
      };
    } finally {
      clearTimeout(timeoutId);
    }

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
    if (getRemainingMs(deadlineAt) - waitMs <= 0) {
      return { ok: false, status: 408, payload, rawBody: "deadline_before_retry" };
    }

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

function normalizeTextForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isCarroDeParoChannel(channel) {
  const haystack = `${normalizeTextForMatch(channel?.name)} ${normalizeTextForMatch(channel?.description)}`;
  return haystack.includes("carro de paro");
}

function mapFeedRecord(sensorId, feed, options = {}) {
  const observedAt = new Date(feed.created_at);
  if (Number.isNaN(observedAt.getTime())) return null;

  const isCarroDeParo = options.isCarroDeParo === true;

  return {
    sensorId,
    observedAt: observedAt.toISOString(),
    temperatura: parseNumber(feed.field1?.avg ?? feed.field1),
    humedad: parseNumber(feed.field2?.avg ?? feed.field2),
    temperatura2: parseNumber(feed.field4?.avg ?? feed.field4),
    humedad2: parseNumber(feed.field5?.avg ?? feed.field5),
    voltaje: isCarroDeParo
      ? parseNumber(feed.field6?.avg ?? feed.field6)
      : parseNumber(feed.field3?.avg ?? feed.field3),
    presion: isCarroDeParo ? null : parseNumber(feed.field9?.avg ?? feed.field9),
    luz: isCarroDeParo
      ? parseNumber(feed.field3?.avg ?? feed.field3)
      : parseNumber(feed.field6?.avg ?? feed.field6),
  };
}

async function upsertReadings(rows, source) {
  if (rows.length === 0) return;

  const sensorIds = rows.map((r) => r.sensorId);
  const observedAt = rows.map((r) => r.observedAt);
  const temperatura = rows.map((r) => r.temperatura);
  const humedad = rows.map((r) => r.humedad);
  const temperatura2 = rows.map((r) => r.temperatura2);
  const humedad2 = rows.map((r) => r.humedad2);
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
        temperatura_2,
        humedad_2,
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
        $8::double precision[],
        $9::double precision[],
        $10::text[]
      )
      ON CONFLICT (sensor_id, observed_at)
      DO UPDATE SET
        temperatura = COALESCE(EXCLUDED.temperatura, sensor_readings.temperatura),
        humedad = COALESCE(EXCLUDED.humedad, sensor_readings.humedad),
        temperatura_2 = COALESCE(EXCLUDED.temperatura_2, sensor_readings.temperatura_2),
        humedad_2 = COALESCE(EXCLUDED.humedad_2, sensor_readings.humedad_2),
        voltaje = COALESCE(EXCLUDED.voltaje, sensor_readings.voltaje),
        presion = COALESCE(EXCLUDED.presion, sensor_readings.presion),
        luz = COALESCE(EXCLUDED.luz, sensor_readings.luz),
        source = EXCLUDED.source;
    `,
    [
      sensorIds,
      observedAt,
      temperatura,
      humedad,
      temperatura2,
      humedad2,
      voltaje,
      presion,
      luz,
      sourceArr,
    ]
  );
}

async function fetchFeedsSeries({
  sensorId,
  apiKey,
  accountKey,
  feedsResultsLimit,
  requestTimeoutMs,
  enableRetry,
  deadlineAt,
}) {
  const attempts = [];

  if (apiKey) {
    attempts.push({
      label: `feeds sensor ${sensorId} (channel api_key)`,
      params: { api_key: apiKey },
      source: "api_feed_channel_key",
    });
  }

  if (accountKey) {
    attempts.push({
      label: `feeds sensor ${sensorId} (account_key)`,
      params: { account_key: accountKey },
      source: "api_feed_account_key",
    });
  }

  if (attempts.length === 0) {
    return { ok: false, status: 0, feeds: [], source: null };
  }

  let lastStatus = 0;
  let accountKeyDenied = false;

  for (const attempt of attempts) {
    const params = new URLSearchParams();
    params.set("results", String(feedsResultsLimit));

    Object.entries(attempt.params).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    const result = await fetchJsonWithRetry(
      `https://webapi.ubibot.com/channels/${sensorId}/feeds.json?${params.toString()}`,
      {
        label: attempt.label,
        timeoutMs: requestTimeoutMs,
        enableRetry,
        deadlineAt,
      }
    );

    if (!result.ok) {
      lastStatus = result.status || lastStatus;

      const usedAccountKey = Boolean(attempt.params?.account_key);
      if (usedAccountKey && result.status === 401) {
        accountKeyDenied = true;
      }

      continue;
    }

    const payload = result.payload || {};
    const feeds = payload.feeds || [];

    if (feeds.length > 0) {
      return {
        ok: true,
        status: result.status,
        feeds,
        source: attempt.source,
      };
    }
  }

  return {
    ok: false,
    status: lastStatus,
    feeds: [],
    source: null,
    accountKeyDenied,
  };
}

async function getDuePendingSensorIds() {
  const { rows } = await query(
    `
      SELECT sensor_id
      FROM sync_pending_sensors
      WHERE next_retry_at <= NOW()
      ORDER BY next_retry_at ASC
      LIMIT $1;
    `,
    [PENDING_RETRY_BATCH_LIMIT]
  );

  return rows
    .map((row) => Number(row.sensor_id))
    .filter((id) => Number.isFinite(id));
}

async function getChannelCursor() {
  const { rows } = await query(
    `
      SELECT cursor
      FROM sync_runtime_state
      WHERE state_key = $1
      LIMIT 1;
    `,
    [SYNC_CURSOR_STATE_KEY]
  );

  const cursor = Number(rows[0]?.cursor);
  return Number.isFinite(cursor) ? Math.max(0, Math.floor(cursor)) : 0;
}

async function setChannelCursor(cursor) {
  const safeCursor = Number.isFinite(cursor) ? Math.max(0, Math.floor(cursor)) : 0;

  await query(
    `
      INSERT INTO sync_runtime_state (state_key, cursor, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (state_key)
      DO UPDATE SET
        cursor = EXCLUDED.cursor,
        updated_at = NOW();
    `,
    [SYNC_CURSOR_STATE_KEY, safeCursor]
  );
}

function sortChannelsById(channels) {
  return [...channels].sort((a, b) => {
    const aId = Number(a?.channel_id);
    const bId = Number(b?.channel_id);

    if (!Number.isFinite(aId) && !Number.isFinite(bId)) return 0;
    if (!Number.isFinite(aId)) return 1;
    if (!Number.isFinite(bId)) return -1;
    return aId - bId;
  });
}

function rotateChannels(channels, startIndex) {
  if (channels.length === 0) return channels;

  const normalizedStart = ((startIndex % channels.length) + channels.length) % channels.length;
  return channels.slice(normalizedStart).concat(channels.slice(0, normalizedStart));
}

function clamp01(value, fallback = DEFAULT_PENDING_QUOTA_SHARE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function buildEffectiveChannels({ pendingChannels, baseChannels, maxChannelsPerRun, pendingQuotaShare }) {
  if (maxChannelsPerRun <= 0) {
    return [...pendingChannels, ...baseChannels];
  }

  const max = Math.max(0, maxChannelsPerRun);
  const desiredPending = Math.min(pendingChannels.length, Math.round(max * pendingQuotaShare));
  const desiredBase = Math.min(baseChannels.length, max - desiredPending);

  const selected = [
    ...pendingChannels.slice(0, desiredPending),
    ...baseChannels.slice(0, desiredBase),
  ];

  let remaining = max - selected.length;
  if (remaining > 0) {
    const extraPending = pendingChannels.slice(desiredPending, desiredPending + remaining);
    selected.push(...extraPending);
    remaining = max - selected.length;
  }

  if (remaining > 0) {
    const extraBase = baseChannels.slice(desiredBase, desiredBase + remaining);
    selected.push(...extraBase);
  }

  return selected;
}

async function clearPendingSensor(sensorId) {
  await query(`DELETE FROM sync_pending_sensors WHERE sensor_id = $1;`, [sensorId]);
}

async function deferPendingSensor(sensorId, reason = "deferred_time_budget") {
  await query(
    `
      INSERT INTO sync_pending_sensors (sensor_id, attempts, last_error, next_retry_at, updated_at)
      VALUES (
        $1,
        0,
        LEFT($2, 400),
        NOW() + INTERVAL '5 minutes',
        NOW()
      )
      ON CONFLICT (sensor_id)
      DO UPDATE SET
        last_error = LEFT(EXCLUDED.last_error, 400),
        next_retry_at = LEAST(
          sync_pending_sensors.next_retry_at,
          NOW() + INTERVAL '5 minutes'
        ),
        updated_at = NOW();
    `,
    [sensorId, String(reason)]
  );
}

async function deferRemainingChannels(channels, startIndex, reason) {
  let deferred = 0;

  for (let i = startIndex; i < channels.length; i += 1) {
    const sensorId = Number(channels[i]?.channel_id);
    if (!Number.isFinite(sensorId)) continue;

    await deferPendingSensor(sensorId, reason);
    deferred += 1;
  }

  return deferred;
}

async function markPendingSensorFailure(sensorId, reason) {
  await query(
    `
      INSERT INTO sync_pending_sensors (sensor_id, attempts, last_error, next_retry_at, updated_at)
      VALUES (
        $1,
        1,
        LEFT($2, 400),
        NOW() + INTERVAL '5 minutes',
        NOW()
      )
      ON CONFLICT (sensor_id)
      DO UPDATE SET
        attempts = LEAST(sync_pending_sensors.attempts + 1, $3),
        last_error = LEFT(EXCLUDED.last_error, 400),
        next_retry_at = CASE
          WHEN sync_pending_sensors.attempts >= $3 THEN NOW() + INTERVAL '12 hours'
          ELSE NOW() + make_interval(
            mins => LEAST(
              120,
              5 * (2 ^ LEAST(sync_pending_sensors.attempts, 5))::int
            )
          )
        END,
        updated_at = NOW();
    `,
    [sensorId, String(reason || "sync_failed"), MAX_PENDING_ATTEMPTS]
  );
}

async function runWithSyncAdvisoryLock(callback) {
  return withDbClient(async (client) => {
    const lockResult = await client.query(
      `SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired;`,
      [SYNC_LOCK_KEY_A, SYNC_LOCK_KEY_B]
    );

    const acquired = Boolean(lockResult.rows[0]?.acquired);
    if (!acquired) {
      return { acquired: false, result: null };
    }

    try {
      const result = await callback();
      return { acquired: true, result };
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1::integer, $2::integer);`, [
        SYNC_LOCK_KEY_A,
        SYNC_LOCK_KEY_B,
      ]);
    }
  });
}

async function persistSyncRunMetrics(metrics) {
  await query(
    `
      INSERT INTO sync_run_metrics (
        run_id,
        attempted_channels,
        processed_channels,
        synced_channels,
        failed_channels,
        deferred_series_channels,
        deferred_unprocessed_channels,
        pending_retries,
        retried_from_pending,
        due_pending_total,
        elapsed_ms,
        time_budget_ms,
        feeds_results_limit,
        stopped_due_to_time_budget,
        lock_skipped,
        pending_quota_share,
        rate_limit_hits,
        request_timeout_hits,
        feeds_permission_denied_hits,
        account_key_feeds_denied_mode,
        circuit_broken
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21
      )
      ON CONFLICT (run_id)
      DO UPDATE SET
        attempted_channels = EXCLUDED.attempted_channels,
        processed_channels = EXCLUDED.processed_channels,
        synced_channels = EXCLUDED.synced_channels,
        failed_channels = EXCLUDED.failed_channels,
        deferred_series_channels = EXCLUDED.deferred_series_channels,
        deferred_unprocessed_channels = EXCLUDED.deferred_unprocessed_channels,
        pending_retries = EXCLUDED.pending_retries,
        retried_from_pending = EXCLUDED.retried_from_pending,
        due_pending_total = EXCLUDED.due_pending_total,
        elapsed_ms = EXCLUDED.elapsed_ms,
        time_budget_ms = EXCLUDED.time_budget_ms,
        feeds_results_limit = EXCLUDED.feeds_results_limit,
        stopped_due_to_time_budget = EXCLUDED.stopped_due_to_time_budget,
        lock_skipped = EXCLUDED.lock_skipped,
        pending_quota_share = EXCLUDED.pending_quota_share,
        rate_limit_hits = EXCLUDED.rate_limit_hits,
        request_timeout_hits = EXCLUDED.request_timeout_hits,
        feeds_permission_denied_hits = EXCLUDED.feeds_permission_denied_hits,
        account_key_feeds_denied_mode = EXCLUDED.account_key_feeds_denied_mode,
        circuit_broken = EXCLUDED.circuit_broken;
    `,
    [
      metrics.runId,
      metrics.attemptedChannels,
      metrics.processedChannels,
      metrics.syncedChannels,
      metrics.failedChannels,
      metrics.deferredSeriesChannels,
      metrics.deferredUnprocessedChannels,
      metrics.pendingRetries,
      metrics.retriedFromPending,
      metrics.duePendingTotal,
      metrics.elapsedMs,
      metrics.timeBudgetMs,
      metrics.feedsResultsLimit,
      metrics.stoppedDueToTimeBudget,
      metrics.lockSkipped,
      metrics.pendingQuotaShare,
      metrics.rateLimitHits,
      metrics.requestTimeoutHits,
      metrics.feedsPermissionDeniedHits,
      metrics.accountKeyFeedsDeniedMode,
      metrics.circuitBroken,
    ]
  );
}

async function runUbiBotSyncUnlocked(options = {}) {
  await ensureSensorSchema();

  const timeBudgetMs = parsePositiveInt(
    options.timeBudgetMs,
    parsePositiveInt(process.env.UBIBOT_SYNC_TIME_BUDGET_MS, 0)
  );
  const startedAt = nowMs();
  const runId = randomUUID();
  const deadlineAt =
    timeBudgetMs > 0 ? startedAt + Math.max(1000, timeBudgetMs) : Number.POSITIVE_INFINITY;
  const requestTimeoutMs = parsePositiveInt(
    options.requestTimeoutMs,
    parsePositiveInt(process.env.UBIBOT_SYNC_REQUEST_TIMEOUT_MS, 10000)
  );
  const feedsResultsLimit = parsePositiveInt(
    options.feedsResultsLimit,
    FEEDS_RESULTS_LIMIT
  );
  const pendingQuotaShare = clamp01(
    options.pendingQuotaShare,
    clamp01(process.env.CRON_PENDING_QUOTA_SHARE, DEFAULT_PENDING_QUOTA_SHARE)
  );
  const rateLimitBreakThreshold = parsePositiveInt(
    options.rateLimitBreakThreshold,
    parsePositiveInt(process.env.CRON_RATE_LIMIT_BREAK_THRESHOLD, 2)
  );
  const minChannelBudgetMs = parsePositiveInt(
    options.minChannelBudgetMs,
    Math.max(2500, requestTimeoutMs + 1800)
  );
  const skipSummaryFallbackOnFeedFailure =
    options.skipSummaryFallbackOnFeedFailure === true;
  const enableRetry =
    typeof options.enableRetry === "boolean" ? options.enableRetry : UBIBOT_ENABLE_RETRY;
  const skipSeriesOnLowBudget = options.skipSeriesOnLowBudget === true;

  const maxChannelsPerRun = parsePositiveInt(
    options.maxChannelsPerRun,
    parsePositiveInt(process.env.UBIBOT_MAX_CHANNELS_PER_RUN, 0)
  );

  const accountKey = process.env.UBIBOT_ACCOUNT_KEY || process.env.NEXT_PUBLIC_UBIBOT_KEY;
  if (!accountKey) {
    throw new Error("UBIBOT_ACCOUNT_KEY o NEXT_PUBLIC_UBIBOT_KEY no esta configurada.");
  }

  const channelApiKeys = parseJsonEnv(process.env.UBIBOT_CHANNEL_API_KEYS_JSON);

  const channelsResult = await fetchJsonWithRetry(
    `https://webapi.ubibot.com/channels?account_key=${accountKey}`,
    {
      label: "channels",
      timeoutMs: requestTimeoutMs,
      enableRetry,
      deadlineAt,
    }
  );

  if (!channelsResult.ok) {
    throw new Error(`No se pudo consultar canales Ubibot (${channelsResult.status}).`);
  }

  const channelsPayload = channelsResult.payload || {};
  const channels = channelsPayload.channels || [];
  const sensorFilter = parseSensorIdFilter(process.env.UBIBOT_ONLY_SENSOR_IDS);
  const useChannelRotation = !sensorFilter && maxChannelsPerRun > 0;
  const baseCursor = useChannelRotation ? await getChannelCursor() : 0;
  const duePendingSensorIds = await getDuePendingSensorIds();
  const duePendingSet = new Set(duePendingSensorIds);
  const channelById = new Map();

  for (const channel of channels) {
    const sensorId = Number(channel.channel_id);
    if (Number.isFinite(sensorId)) {
      channelById.set(sensorId, channel);
    }
  }

  const baseChannels = sensorFilter
    ? channels.filter((channel) => sensorFilter.has(Number(channel.channel_id)))
    : channels;

  const sortedBaseChannels = sortChannelsById(baseChannels);
  const rotatedBaseChannels = useChannelRotation
    ? rotateChannels(sortedBaseChannels, baseCursor)
    : sortedBaseChannels;

  const pendingChannelsToProcess = [];
  const seenIds = new Set();

  for (const pendingId of duePendingSensorIds) {
    const pendingChannel = channelById.get(pendingId);
    if (!pendingChannel) continue;
    const channelId = Number(pendingChannel.channel_id);
    if (!Number.isFinite(channelId) || seenIds.has(channelId)) continue;
    pendingChannelsToProcess.push(pendingChannel);
    seenIds.add(channelId);
  }

  const baseChannelsToProcess = [];
  for (const channel of rotatedBaseChannels) {
    const channelId = Number(channel.channel_id);
    if (!Number.isFinite(channelId) || seenIds.has(channelId)) continue;
    baseChannelsToProcess.push(channel);
    seenIds.add(channelId);
  }

  const effectiveChannelsToProcess = buildEffectiveChannels({
    pendingChannels: pendingChannelsToProcess,
    baseChannels: baseChannelsToProcess,
    maxChannelsPerRun,
    pendingQuotaShare,
  });

  const retriedFromPending = effectiveChannelsToProcess.reduce((count, channel) => {
    const sensorId = Number(channel.channel_id);
    if (!Number.isFinite(sensorId)) return count;
    return duePendingSet.has(sensorId) ? count + 1 : count;
  }, 0);

  let totalInserted = 0;
  let syncedChannels = 0;
  let failedChannels = 0;
  const failedSensorIds = [];
  let processedBaseChannels = 0;
  let stoppedDueToTimeBudget = false;
  let deferredSeriesChannels = 0;
  let deferredUnprocessedChannels = 0;
  let rateLimitHits = 0;
  let requestTimeoutHits = 0;
  let circuitBroken = false;
  let accountKeyFeedsDeniedMode = false;
  let feedsPermissionDeniedHits = 0;

  for (let channelIndex = 0; channelIndex < effectiveChannelsToProcess.length; channelIndex += 1) {
    const channel = effectiveChannelsToProcess[channelIndex];

    if (getRemainingMs(deadlineAt) <= minChannelBudgetMs) {
      stoppedDueToTimeBudget = true;
      deferredUnprocessedChannels += await deferRemainingChannels(
        effectiveChannelsToProcess,
        channelIndex,
        "deferred_run_deadline"
      );

      break;
    }

    const sensorId = Number(channel.channel_id);
    if (!Number.isFinite(sensorId)) continue;

    const isCarroDeParo = isCarroDeParoChannel(channel);

    try {
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
              temperatura2: parseNumber(lastPayload.field4?.value),
              humedad2: parseNumber(lastPayload.field5?.value),
              voltaje: isCarroDeParo
                ? parseNumber(lastPayload.field6?.value)
                : parseNumber(lastPayload.field3?.value),
              presion: isCarroDeParo ? null : parseNumber(lastPayload.field9?.value),
              luz: isCarroDeParo
                ? parseNumber(lastPayload.field3?.value)
                : parseNumber(lastPayload.field6?.value),
            },
          ]
        : [];

      for (const batch of chunk(latestReading, BATCH_SIZE)) {
        await upsertReadings(batch, "api_last");
        totalInserted += batch.length;
      }

      const shouldDeferSeriesNow =
        skipSeriesOnLowBudget &&
        Number.isFinite(deadlineAt) &&
        getRemainingMs(deadlineAt) <= Math.max(2000, requestTimeoutMs + 1200);

      if (shouldDeferSeriesNow) {
        deferredSeriesChannels += 1;
        await deferPendingSensor(sensorId, "deferred_series_low_budget");
        syncedChannels += 1;
        if (!duePendingSet.has(sensorId)) {
          processedBaseChannels += 1;
        }
        continue;
      }

      const apiKeyForChannel = channelApiKeys[String(sensorId)] || null;
      const feedsPayload =
        accountKeyFeedsDeniedMode && !apiKeyForChannel
          ? {
              ok: false,
              status: 401,
              feeds: [],
              source: null,
              accountKeyDenied: true,
            }
          : await fetchFeedsSeries({
              sensorId,
              apiKey: apiKeyForChannel,
              accountKey,
              feedsResultsLimit,
              requestTimeoutMs,
              enableRetry,
              deadlineAt,
            });

      if (!feedsPayload.ok) {
        if (feedsPayload.status === 429) {
          rateLimitHits += 1;
        }

        if (feedsPayload.status === 408) {
          requestTimeoutHits += 1;
        }

        if (feedsPayload.status === 401 && feedsPayload.accountKeyDenied) {
          feedsPermissionDeniedHits += 1;
          accountKeyFeedsDeniedMode = true;
        }
      }

      if (rateLimitHits >= rateLimitBreakThreshold) {
        circuitBroken = true;
        await markPendingSensorFailure(sensorId, "feeds_rate_limit_break");
        failedChannels += 1;
        failedSensorIds.push(sensorId);

        if (!duePendingSet.has(sensorId)) {
          processedBaseChannels += 1;
        }

        deferredUnprocessedChannels += await deferRemainingChannels(
          effectiveChannelsToProcess,
          channelIndex + 1,
          "deferred_rate_limit_circuit_break"
        );

        break;
      }

      let readings = [];
      let sourceForSeries = "api_summary";
      let seriesFetchSucceeded = false;

      if (feedsPayload.ok && feedsPayload.feeds.length > 0) {
        readings = feedsPayload.feeds
          .map((feed) => mapFeedRecord(sensorId, feed, { isCarroDeParo }))
          .filter(Boolean);
        sourceForSeries = feedsPayload.source || "api_feed";
        seriesFetchSucceeded = true;
      } else {
        const allowSummaryFallbackFor401 =
          feedsPayload.status === 401 && feedsPayload.accountKeyDenied;

        if (
          skipSummaryFallbackOnFeedFailure &&
          feedsPayload.status > 0 &&
          !allowSummaryFallbackFor401
        ) {
          failedChannels += 1;
          failedSensorIds.push(sensorId);
          await markPendingSensorFailure(sensorId, `feeds_status_${feedsPayload.status}`);
          if (!duePendingSet.has(sensorId)) {
            processedBaseChannels += 1;
          }
          continue;
        }

        if (Number.isFinite(deadlineAt) && getRemainingMs(deadlineAt) <= requestTimeoutMs + 900) {
          deferredSeriesChannels += 1;
          await deferPendingSensor(sensorId, "deferred_before_summary_low_budget");
          syncedChannels += 1;
          if (!duePendingSet.has(sensorId)) {
            processedBaseChannels += 1;
          }
          continue;
        }

        const summaryResult = await fetchJsonWithRetry(
          `https://webapi.ubibot.com/channels/${sensorId}/summary.json?account_key=${accountKey}`,
          {
            label: `summary sensor ${sensorId}`,
            timeoutMs: requestTimeoutMs,
            enableRetry,
            deadlineAt,
          }
        );

        if (!summaryResult.ok && summaryResult.status === 429) {
          rateLimitHits += 1;
        }

        if (!summaryResult.ok && summaryResult.status === 408) {
          requestTimeoutHits += 1;
        }

        if (!summaryResult.ok) {
          failedChannels += 1;
          failedSensorIds.push(sensorId);
          await markPendingSensorFailure(sensorId, `summary_status_${summaryResult.status || 0}`);
          continue;
        }

        const summaryPayload = summaryResult.payload || {};
        const feeds = summaryPayload.feeds || [];
        readings = feeds
          .map((feed) => mapFeedRecord(sensorId, feed, { isCarroDeParo }))
          .filter(Boolean);
        seriesFetchSucceeded = true;
      }

      for (const batch of chunk(readings, BATCH_SIZE)) {
        await upsertReadings(batch, sourceForSeries);
        totalInserted += batch.length;
      }

      if (seriesFetchSucceeded) {
        await clearPendingSensor(sensorId);
      }

      syncedChannels += 1;
      if (!duePendingSet.has(sensorId)) {
        processedBaseChannels += 1;
      }
    } catch (error) {
      failedChannels += 1;
      failedSensorIds.push(sensorId);
      const message = error instanceof Error ? error.message : "unexpected_error";
      await markPendingSensorFailure(sensorId, message);
      if (!duePendingSet.has(sensorId)) {
        processedBaseChannels += 1;
      }
    }
  }

  if (useChannelRotation && sortedBaseChannels.length > 0) {
    const nextCursor =
      sortedBaseChannels.length > 0
        ? (baseCursor + processedBaseChannels) % sortedBaseChannels.length
        : 0;

    await setChannelCursor(nextCursor);
  }

  const pendingSummary = await query(`SELECT COUNT(*)::int AS count FROM sync_pending_sensors;`);
  const elapsedMs = nowMs() - startedAt;

  const result = {
    runId,
    attemptedChannels: effectiveChannelsToProcess.length,
    processedChannels: syncedChannels + failedChannels,
    maxChannelsPerRun,
    syncedChannels,
    failedChannels,
    failedSensorIds,
    pendingRetries: pendingSummary.rows[0]?.count || 0,
    retriedFromPending,
    duePendingTotal: duePendingSensorIds.length,
    deferredSeriesChannels,
    deferredUnprocessedChannels,
    pendingQuotaShare,
    rateLimitHits,
    requestTimeoutHits,
    feedsPermissionDeniedHits,
    accountKeyFeedsDeniedMode,
    circuitBroken,
    stoppedDueToTimeBudget,
    elapsedMs,
    timeBudgetMs: Number.isFinite(timeBudgetMs) && timeBudgetMs > 0 ? timeBudgetMs : null,
    feedsResultsLimit,
    totalInserted,
    lockSkipped: false,
  };

  await persistSyncRunMetrics({
    runId: result.runId,
    attemptedChannels: result.attemptedChannels,
    processedChannels: result.processedChannels,
    syncedChannels: result.syncedChannels,
    failedChannels: result.failedChannels,
    deferredSeriesChannels: result.deferredSeriesChannels,
    deferredUnprocessedChannels: result.deferredUnprocessedChannels,
    pendingRetries: result.pendingRetries,
    retriedFromPending: result.retriedFromPending,
    duePendingTotal: result.duePendingTotal,
    elapsedMs: result.elapsedMs,
    timeBudgetMs: result.timeBudgetMs,
    feedsResultsLimit: result.feedsResultsLimit,
    stoppedDueToTimeBudget: result.stoppedDueToTimeBudget,
    lockSkipped: result.lockSkipped,
    pendingQuotaShare: result.pendingQuotaShare,
    rateLimitHits: result.rateLimitHits,
    requestTimeoutHits: result.requestTimeoutHits,
    feedsPermissionDeniedHits: result.feedsPermissionDeniedHits,
    accountKeyFeedsDeniedMode: result.accountKeyFeedsDeniedMode,
    circuitBroken: result.circuitBroken,
  });

  return result;
}

export async function runUbiBotSync(options = {}) {
  const lockResult = await runWithSyncAdvisoryLock(() => runUbiBotSyncUnlocked(options));
  if (lockResult.acquired) {
    return lockResult.result;
  }

  const lockSkippedResult = {
    runId: randomUUID(),
    attemptedChannels: 0,
    processedChannels: 0,
    maxChannelsPerRun: parsePositiveInt(
      options.maxChannelsPerRun,
      parsePositiveInt(process.env.UBIBOT_MAX_CHANNELS_PER_RUN, 0)
    ),
    syncedChannels: 0,
    failedChannels: 0,
    failedSensorIds: [],
    pendingRetries: 0,
    retriedFromPending: 0,
    duePendingTotal: 0,
    deferredSeriesChannels: 0,
    deferredUnprocessedChannels: 0,
    stoppedDueToTimeBudget: false,
    elapsedMs: 0,
    timeBudgetMs: null,
    feedsResultsLimit: parsePositiveInt(options.feedsResultsLimit, FEEDS_RESULTS_LIMIT),
    pendingQuotaShare: clamp01(
      options.pendingQuotaShare,
      clamp01(process.env.CRON_PENDING_QUOTA_SHARE, DEFAULT_PENDING_QUOTA_SHARE)
    ),
    rateLimitHits: 0,
    requestTimeoutHits: 0,
    feedsPermissionDeniedHits: 0,
    accountKeyFeedsDeniedMode: false,
    circuitBroken: false,
    totalInserted: 0,
    lockSkipped: true,
  };

  await persistSyncRunMetrics({
    runId: lockSkippedResult.runId,
    attemptedChannels: lockSkippedResult.attemptedChannels,
    processedChannels: lockSkippedResult.processedChannels,
    syncedChannels: lockSkippedResult.syncedChannels,
    failedChannels: lockSkippedResult.failedChannels,
    deferredSeriesChannels: lockSkippedResult.deferredSeriesChannels,
    deferredUnprocessedChannels: lockSkippedResult.deferredUnprocessedChannels,
    pendingRetries: lockSkippedResult.pendingRetries,
    retriedFromPending: lockSkippedResult.retriedFromPending,
    duePendingTotal: lockSkippedResult.duePendingTotal,
    elapsedMs: lockSkippedResult.elapsedMs,
    timeBudgetMs: lockSkippedResult.timeBudgetMs,
    feedsResultsLimit: lockSkippedResult.feedsResultsLimit,
    stoppedDueToTimeBudget: lockSkippedResult.stoppedDueToTimeBudget,
    lockSkipped: lockSkippedResult.lockSkipped,
    pendingQuotaShare: lockSkippedResult.pendingQuotaShare,
    rateLimitHits: lockSkippedResult.rateLimitHits,
    requestTimeoutHits: lockSkippedResult.requestTimeoutHits,
    feedsPermissionDeniedHits: lockSkippedResult.feedsPermissionDeniedHits,
    accountKeyFeedsDeniedMode: lockSkippedResult.accountKeyFeedsDeniedMode,
    circuitBroken: lockSkippedResult.circuitBroken,
  });

  return lockSkippedResult;
}
