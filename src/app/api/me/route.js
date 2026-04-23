import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || "user",
      },
    });
  } catch (error) {
    console.error("Error consultando sesion del usuario:", error);
    return NextResponse.json(
      { error: "No se pudo consultar la sesion." },
      { status: 500 }
    );
  }
}
