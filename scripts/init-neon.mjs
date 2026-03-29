import "dotenv/config";
import { ensureSensorSchema } from "../src/lib/sensor-db.js";

async function main() {
  await ensureSensorSchema();
  console.log("Esquema de sensores creado/verificado en Neon.");
}

main().catch((error) => {
  console.error("No se pudo inicializar esquema en Neon:", error);
  process.exit(1);
});
