import { Pool } from "pg";

function parsePositiveInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPool() {
  if (global.pgPool) {
    return global.pgPool;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada.");
  }

  const connectionTimeoutMillis = parsePositiveInt(
    process.env.DB_CONNECTION_TIMEOUT_MS,
    5000
  );
  const idleTimeoutMillis = parsePositiveInt(process.env.DB_IDLE_TIMEOUT_MS, 30000);
  const queryTimeoutMs = parsePositiveInt(process.env.DB_QUERY_TIMEOUT_MS, 12000);
  const maxPoolSize = parsePositiveInt(process.env.DB_POOL_MAX, 10);

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : false,
    max: maxPoolSize,
    connectionTimeoutMillis,
    idleTimeoutMillis,
    query_timeout: queryTimeoutMs,
    statement_timeout: queryTimeoutMs,
    keepAlive: true,
    application_name: "hslv-monitor-cron-sync",
  });

  if (process.env.NODE_ENV !== "production") {
    global.pgPool = pool;
  }

  return pool;
}

export async function query(text, params = []) {
  const pool = getPool();
  return pool.query(text, params);
}

export async function withDbClient(callback) {
  const pool = getPool();
  const maxConnectRetries = parsePositiveInt(process.env.DB_CONNECT_RETRIES, 2);
  const retryDelayMs = parsePositiveInt(process.env.DB_CONNECT_RETRY_DELAY_MS, 250);

  let lastError = null;

  for (let attempt = 1; attempt <= maxConnectRetries; attempt += 1) {
    let client;
    try {
      client = await pool.connect();
      return await callback(client);
    } catch (error) {
      lastError = error;

      const message = String(error?.message || "").toLowerCase();
      const retryable =
        message.includes("connection timeout") ||
        message.includes("connection terminated") ||
        message.includes("timeout") ||
        message.includes("econnreset") ||
        message.includes("57p03");

      if (!retryable || attempt >= maxConnectRetries) {
        throw error;
      }

      await sleep(retryDelayMs * attempt);
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  throw lastError || new Error("No se pudo obtener conexion de base de datos.");
}
