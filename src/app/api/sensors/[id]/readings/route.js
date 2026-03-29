import { NextResponse } from "next/server";
import { ensureSensorSchema, getSensorReadingsByRange } from "@/lib/sensor-db";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    await ensureSensorSchema();

    const params = await context.params;
    const sensorId = Number(params.id);

    if (!Number.isFinite(sensorId)) {
      return NextResponse.json(
        { error: "ID de sensor invalido." },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    const hours = url.searchParams.get("hours");

    const payload = await getSensorReadingsByRange({
      sensorId,
      hours,
      month,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error al consultar historico de sensor:", error);
    return NextResponse.json(
      { error: "No se pudo consultar historico en la base de datos." },
      { status: 500 }
    );
  }
}
