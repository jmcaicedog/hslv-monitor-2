import { Pool } from "pg";

function getPool() {
  if (global.pgPool) {
    return global.pgPool;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada.");
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : false,
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
  const client = await pool.connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
