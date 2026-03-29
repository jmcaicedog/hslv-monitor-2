"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  const sessionState = authClient.useSession();
  const session = sessionState.data;
  const status = sessionState.isPending
    ? "loading"
    : session
      ? "authenticated"
      : "unauthenticated";

  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("La contrasena debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: "/",
      });

      if (result?.error) {
        const rawMessage = result.error.message || "No se pudo crear la cuenta.";
        const normalizedMessage = rawMessage.toLowerCase();

        if (normalizedMessage.includes("already exists")) {
          setError("Este correo ya esta registrado. Inicia sesion o recupera tu contrasena.");
        } else {
          setError(rawMessage);
        }

        return;
      }

      setSuccess("Cuenta creada correctamente. Ya puedes iniciar sesion.");

      setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 1200);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "No se pudo crear la cuenta.";
      const normalizedMessage = rawMessage.toLowerCase();

      if (normalizedMessage.includes("already exists")) {
        setError("Este correo ya esta registrado. Inicia sesion o recupera tu contrasena.");
      } else {
        setError(rawMessage);
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

        <h1 className="text-2xl font-bold mb-4">Crear Cuenta</h1>

        <form onSubmit={handleSubmit} className="space-y-3 text-left">
          <div>
            <label className="mb-1 block text-sm text-gray-300">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-300">Correo</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-300">Contrasena</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-300">Confirmar contrasena</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-blue-400"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-green-400">{success}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-white py-2 font-bold text-gray-900 transition-all hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isSubmitting ? "Creando..." : "Crear cuenta"}
          </button>

          <div className="pt-2 text-center text-sm text-gray-300">
            Ya tienes cuenta?{" "}
            <Link href="/login" className="underline hover:text-white">
              Inicia sesion
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
