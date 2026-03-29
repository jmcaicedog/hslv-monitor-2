"use client";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/"); // Redirige a la página principal si ya está autenticado
    }
  }, [status, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-800">
      <div className="p-8 bg-gray-900 rounded-xl shadow-lg text-center text-white w-96">
        {/* Logo en la parte superior */}
        <div className="flex justify-center mb-4">
          <Image src="/logo.png" alt="Logo" width={100} height={100} />
        </div>

        <h1 className="text-2xl font-bold mb-4">Iniciar Sesión</h1>
        <button
          onClick={() => signIn("google")}
          className="bg-white text-gray-900 hover:bg-gray-200 font-bold py-2 px-4 rounded transition-all"
        >
          Ingresar con Google
        </button>
      </div>
    </div>
  );
}
