import { NextResponse } from "next/server";
import { insertReportLog, listReportLogs, REPORT_TYPES } from "@/lib/report-log-db";
import { getCurrentUser, isAdminUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const MAX_OBSERVATIONS_LENGTH = 2000;
const MAX_SENSOR_NAME_LENGTH = 200;
const MAX_RANGE_LABEL_LENGTH = 200;

function unauthorizedResponse() {
  return NextResponse.json({ error: "No autenticado" }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json(
    { error: "Solo un administrador puede consultar este historial." },
    { status: 403 }
  );
}

function sanitizeText(value, maxLength) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function GET(request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return unauthorizedResponse();
    }

    if (!isAdminUser(user)) {
      return forbiddenResponse();
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit")) || 50;
    const offset = Number(searchParams.get("offset")) || 0;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    const result = await listReportLogs({ limit, offset, from, to });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo consultar el historial de reportes.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return unauthorizedResponse();
    }

    const body = await request.json().catch(() => ({}));
    const reportType = typeof body?.reportType === "string" ? body.reportType : "";

    if (!REPORT_TYPES.includes(reportType)) {
      return NextResponse.json(
        { ok: false, error: "Tipo de reporte no valido." },
        { status: 400 }
      );
    }

    const sensorIdRaw = Number(body?.sensorId);
    const sensorId = Number.isFinite(sensorIdRaw) ? Math.trunc(sensorIdRaw) : null;

    if (sensorId === null) {
      return NextResponse.json(
        { ok: false, error: "sensorId es obligatorio." },
        { status: 400 }
      );
    }

    const log = await insertReportLog({
      sensorId,
      sensorName: sanitizeText(body?.sensorName, MAX_SENSOR_NAME_LENGTH),
      reportType,
      observations: sanitizeText(body?.observations, MAX_OBSERVATIONS_LENGTH),
      rangeLabel: sanitizeText(body?.rangeLabel, MAX_RANGE_LABEL_LENGTH),
      rangeStart: body?.rangeStart,
      rangeEnd: body?.rangeEnd,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
    });

    return NextResponse.json({ ok: true, log }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo registrar la generacion del reporte.",
      },
      { status: 500 }
    );
  }
}
