import "dotenv/config";
import { runUbiBotSync } from "../src/lib/ubibot-sync.js";

async function main() {
  await ensureSensorSchema();

  const accountKey = process.env.UBIBOT_ACCOUNT_KEY || process.env.NEXT_PUBLIC_UBIBOT_KEY;
  const channelApiKeys = parseJsonEnv(process.env.UBIBOT_CHANNEL_API_KEYS_JSON);

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
    const summary = await runUbiBotSync();
    console.log(
      `Sincronizacion completada. Canales procesados: ${summary.syncedChannels}. Registros procesados: ${summary.totalInserted}`
    );
    return fallback;
