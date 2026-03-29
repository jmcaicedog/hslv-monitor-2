import { NextResponse } from "next/server";
import { ensureSensorSchema, getSensorsOverview } from "@/lib/sensor-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSensorSchema();
    const sensors = await getSensorsOverview();
    return NextResponse.json({ sensors });
  } catch (error) {
    console.error("Error al consultar sensores desde DB:", error);
    return NextResponse.json(
      { error: "No se pudo consultar sensores en la base de datos." },
      { status: 500 }
    );
  }
}
