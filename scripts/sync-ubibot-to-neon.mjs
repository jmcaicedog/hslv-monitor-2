import "dotenv/config";
import { runUbiBotSync } from "../src/lib/ubibot-sync.js";

async function main() {
  const summary = await runUbiBotSync();
  console.log(
    `Sincronizacion completada. Canales procesados: ${summary.syncedChannels}. Registros procesados: ${summary.totalInserted}`
  );
}

main().catch((error) => {
  console.error("Fallo la sincronizacion Ubibot -> Neon:", error);
  process.exit(1);
});
