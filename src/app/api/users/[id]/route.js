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

export async function PATCH(request, context) {
  try {
    const authServer = getAuthServer();
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return unauthorizedResponse();
    }

    if (!isAdminUser(currentUser)) {
      return forbiddenResponse();
    }

    const params = await context.params;
    const userId = String(params.id || "").trim();

    if (!userId) {
      return NextResponse.json({ error: "ID invalido." }, { status: 400 });
    }

    const body = await request.json();
    const updates = {};

    if (typeof body?.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }

    if (typeof body?.email === "string" && body.email.trim()) {
      updates.email = body.email.trim();
    }

    if (body?.role && body.role !== "user" && body.role !== "admin") {
      return NextResponse.json({ error: "Rol invalido." }, { status: 400 });
    }

    if (body?.banned != null && typeof body.banned !== "boolean") {
      return NextResponse.json({ error: "Estado invalido." }, { status: 400 });
    }

    if (Object.keys(updates).length > 0) {
      const updated = await authServer.admin.updateUser({
        userId,
        data: updates,
      });

      if (updated?.error) {
        return NextResponse.json(
          { error: updated.error.message || "No se pudo actualizar el usuario." },
          { status: 400 }
        );
      }
    }

    if (body?.role === "user" || body?.role === "admin") {
      const roleUpdate = await authServer.admin.setRole({
        userId,
        role: body.role,
      });

      if (roleUpdate?.error) {
        return NextResponse.json(
          { error: roleUpdate.error.message || "No se pudo actualizar el rol." },
          { status: 400 }
        );
      }
    }

    if (body?.banned === true) {
      const banResult = await authServer.admin.banUser({
        userId,
        banReason: "Acceso desautorizado por administrador",
      });

      if (banResult?.error) {
        return NextResponse.json(
          { error: banResult.error.message || "No se pudo bloquear el usuario." },
          { status: 400 }
        );
      }
    }

    if (body?.banned === false) {
      const unbanResult = await authServer.admin.unbanUser({ userId });

      if (unbanResult?.error) {
        return NextResponse.json(
          { error: unbanResult.error.message || "No se pudo autorizar el usuario." },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error actualizando usuario:", error);
    return NextResponse.json(
      { error: "No se pudo actualizar el usuario." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request, context) {
  try {
    const authServer = getAuthServer();
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return unauthorizedResponse();
    }

    if (!isAdminUser(currentUser)) {
      return forbiddenResponse();
    }

    const params = await context.params;
    const userId = String(params.id || "").trim();

    if (!userId) {
      return NextResponse.json({ error: "ID invalido." }, { status: 400 });
    }

    if (userId === currentUser.id) {
      return NextResponse.json(
        { error: "No puedes eliminar tu propio usuario." },
        { status: 400 }
      );
    }

    const removed = await authServer.admin.removeUser({ userId });

    if (removed?.error) {
      return NextResponse.json(
        { error: removed.error.message || "No se pudo eliminar el usuario." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error eliminando usuario:", error);
    return NextResponse.json(
      { error: "No se pudo eliminar el usuario." },
      { status: 500 }
    );
  }
}
