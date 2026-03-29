// src/app/api/auth/error/page.js

"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  let message = "Ocurrió un error durante el inicio de sesión.";

  if (error === "AccessDenied") {
    message =
      "⚠️ Acceso denegado: Tu correo no está autorizado para ingresar a esta aplicación.";
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center text-center p-6 bg-gray-800 text-white">
      <h1 className="text-3xl font-bold mb-4 text-amber-400">
        Error de Autenticación
      </h1>
      <Link
        href="/"
        className="mt-6 inline-block px-5 py-2 rounded-md bg-white text-gray-800 font-semibold hover:bg-gray-100 transition"
      >
        Regresar a la página principal
      </Link>
    </div>
  );
}
