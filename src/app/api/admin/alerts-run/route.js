import { NextResponse } from "next/server";
import { runThresholdAlerts } from "@/lib/alerts";
import { getCurrentUser, isAdminUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json({ error: "No autenticado" }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json(
    { error: "Solo un administrador puede ejecutar esta accion." },
    { status: 403 }
  );
}

export async function POST() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return unauthorizedResponse();
    }

    if (!isAdminUser(user)) {
      return forbiddenResponse();
    }

    const result = await runThresholdAlerts();

    if (result.ok) {
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json(
      {
        ok: false,
        ...result,
        error:
          Array.isArray(result.errors) && result.errors.length > 0
            ? result.errors[0]
            : "La verificacion termino con errores.",
      },
      { status: 500 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo ejecutar la verificacion.",
      },
      { status: 500 }
    );
  }
}
