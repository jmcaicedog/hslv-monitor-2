"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const sessionState = authClient.useSession();
  const session = sessionState.data;
  const status = sessionState.isPending
    ? "loading"
    : session
      ? "authenticated"
      : "unauthenticated";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.email({ email, password });

      if (result?.error || !result?.data) {
        const rawMessage = (result?.error?.message || "").toLowerCase();

        if (rawMessage.includes("invalid origin")) {
          setError(
            "Origen no autorizado. Agrega esta URL en Neon Auth (Trusted Origins): " +
              window.location.origin
          );
        } else {
          setError("Credenciales invalidas. Verifica tu correo y contrasena.");
        }

        setIsSubmitting(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message.toLowerCase() : "";

      if (rawMessage.includes("invalid origin")) {
        setError(
          "Origen no autorizado. Agrega esta URL en Neon Auth (Trusted Origins): " +
            window.location.origin
        );
      } else {
        setError("No se pudo iniciar sesion. Intenta nuevamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-800">
      <div className="p-8 bg-gray-900 rounded-xl shadow-lg text-center text-white w-96">
        <div className="flex justify-center mb-4">
          <Image src="/logo.png" alt="Logo" width={100} height={100} />
        </div>

        <h1 className="text-2xl font-bold mb-4">Iniciar Sesión</h1>
        <form onSubmit={handleSubmit} className="space-y-3 text-left">
          <div>
            <label className="mb-1 block text-sm text-gray-300">Correo</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-300">Contraseña</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-blue-400"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-white py-2 font-bold text-gray-900 transition-all hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isSubmitting ? "Validando..." : "Ingresar"}
          </button>

          <div className="pt-2 text-center text-sm text-gray-300">
            <Link href="/forgot-password" className="underline hover:text-white">
              Olvide mi contrasena
            </Link>
          </div>

          <div className="text-center text-sm text-gray-300">
            Si necesitas acceso, solicita tu cuenta al administrador.
          </div>
        </form>
      </div>
    </div>
  );
}
