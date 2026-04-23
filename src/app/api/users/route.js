import { NextResponse } from "next/server";
import { getAuthServer, getCurrentUser, isAdminUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json({ error: "No autenticado" }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json(
    { error: "Solo un administrador puede gestionar usuarios." },
    { status: 403 }
  );
}

export async function GET() {
  try {
    const authServer = getAuthServer();
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return unauthorizedResponse();
    }

    if (!isAdminUser(currentUser)) {
      return forbiddenResponse();
    }

    const result = await authServer.admin.listUsers({
      query: {
        limit: 200,
        offset: 0,
        sortBy: "createdAt",
        sortDirection: "desc",
      },
    });

    if (result?.error) {
      return NextResponse.json(
        { error: result.error.message || "No se pudo listar usuarios." },
        { status: 500 }
      );
    }

    const users = (result?.data?.users || []).map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || "user",
      emailVerified: Boolean(user.emailVerified),
      banned: Boolean(user.banned),
      createdAt: user.createdAt,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error listando usuarios:", error);
    return NextResponse.json(
      { error: "No se pudo listar usuarios." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const authServer = getAuthServer();
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return unauthorizedResponse();
    }

    if (!isAdminUser(currentUser)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const email = String(body?.email || "").trim();
    const name = String(body?.name || "").trim();
    const password = String(body?.password || "");
    const role = body?.role === "admin" ? "admin" : "user";

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: "Nombre, correo y contrasena son obligatorios." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contrasena debe tener al menos 8 caracteres." },
        { status: 400 }
      );
    }

    const created = await authServer.admin.createUser({
      email,
      name,
      password,
      role,
    });

    if (created?.error) {
      const message = created.error.message || "No se pudo crear el usuario.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, user: created.data?.user });
  } catch (error) {
    console.error("Error creando usuario:", error);
    return NextResponse.json(
      { error: "No se pudo crear el usuario." },
      { status: 500 }
    );
  }
}
