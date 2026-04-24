import { NextResponse } from "next/server";
import { attendSensorAlarm, getSensorAlarmState } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

function getHandledByLabel(user) {
  if (!user) return "Usuario autenticado";

  const byEmail = typeof user.email === "string" ? user.email.trim() : "";
  if (byEmail) return byEmail;

  const byName = typeof user.name === "string" ? user.name.trim() : "";
  if (byName) return byName;

  const byId = typeof user.id === "string" ? user.id.trim() : "";
  if (byId) return `user:${byId}`;

  return "Usuario autenticado";
}

function parseSensorId(rawId) {
  const sensorId = Number(rawId);

  if (!Number.isFinite(sensorId)) {
    return null;
  }

  return sensorId;
}

export async function GET(_request, context) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const params = await context.params;
    const sensorId = parseSensorId(params.id);

    if (sensorId === null) {
      return NextResponse.json({ error: "ID de sensor invalido." }, { status: 400 });
    }

    const alarm = await getSensorAlarmState(sensorId);
    return NextResponse.json({ alarm });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo consultar el estado de alarma del sensor.",
      },
      { status: 500 }
    );
  }
}

export async function POST(_request, context) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const params = await context.params;
    const sensorId = parseSensorId(params.id);

    if (sensorId === null) {
      return NextResponse.json({ error: "ID de sensor invalido." }, { status: 400 });
    }

    const alarm = await attendSensorAlarm(sensorId, getHandledByLabel(user));

    return NextResponse.json({
      ok: true,
      message: "Alarma atendida correctamente.",
      alarm,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo atender la alarma.";

    if (message.includes("no tiene una alarma activa")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
