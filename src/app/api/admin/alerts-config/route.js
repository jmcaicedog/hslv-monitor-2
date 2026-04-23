import { NextResponse } from "next/server";
import {
  getAlertConfig,
  updateAlertConfig,
} from "@/lib/alert-config-db";
import { getCurrentUser, isAdminUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json({ error: "No autenticado" }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json(
    { error: "Solo un administrador puede gestionar esta configuracion." },
    { status: 403 }
  );
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return unauthorizedResponse();
    }

    if (!isAdminUser(user)) {
      return forbiddenResponse();
    }

    const config = await getAlertConfig();
    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo consultar la configuracion de alertas.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return unauthorizedResponse();
    }

    if (!isAdminUser(user)) {
      return forbiddenResponse();
    }

    const payload = await request.json();
    const config = await updateAlertConfig(payload);
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la configuracion de alertas.",
      },
      { status: 400 }
    );
  }
}
