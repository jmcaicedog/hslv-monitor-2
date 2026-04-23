"use client";

import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-800 p-4">
      <div className="w-full max-w-lg rounded-xl bg-gray-900 p-8 text-center text-white shadow-lg">
        <h1 className="mb-3 text-2xl font-bold">Registro deshabilitado</h1>
        <p className="text-gray-300">
          La creacion de cuentas ahora la realiza un administrador desde el panel
          de usuarios.
        </p>
        <p className="mt-2 text-gray-300">
          Si necesitas acceso, contacta al administrador del sistema.
        </p>

        <div className="mt-6">
          <Link
            href="/login"
            className="inline-flex rounded-md bg-white px-4 py-2 font-semibold text-gray-900 hover:bg-gray-200"
          >
            Volver a inicio de sesion
          </Link>
        </div>
      </div>
    </div>
  );
}
