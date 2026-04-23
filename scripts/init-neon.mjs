import "dotenv/config";
import { ensureSensorSchema } from "../src/lib/sensor-db.js";
import { ensureAlertConfigSchema } from "../src/lib/alert-config-db.js";

async function main() {
  await ensureSensorSchema();
  await ensureAlertConfigSchema();
  console.log("Esquema de sensores y alertas creado/verificado en Neon.");
}

main().catch((error) => {
  console.error("No se pudo inicializar esquema en Neon:", error);
  process.exit(1);
});
