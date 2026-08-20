import { NextResponse } from "next/server";
import { listAlarmEpisodes } from "@/lib/alerts";
import { getCurrentUser, isAdminUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json({ error: "No autenticado" }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json(
    { error: "Solo un administrador puede consultar este historial." },
    { status: 403 }
  );
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

    const result = await listAlarmEpisodes({ limit, offset });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo consultar el historial de alarmas.",
      },
      { status: 500 }
    );
  }
}
