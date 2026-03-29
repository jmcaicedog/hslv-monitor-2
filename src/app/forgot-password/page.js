"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: "/login",
      });

      if (result?.error) {
        const rawMessage = (result.error.message || "").toLowerCase();

        if (rawMessage.includes("invalid origin")) {
          setError(
            "Origen no autorizado. Agrega esta URL en Neon Auth (Trusted Origins): " +
              window.location.origin
          );
        } else {
          setError(result.error.message || "No se pudo enviar el correo.");
        }

        return;
      }

      setSuccess("Si el correo existe, enviamos instrucciones para recuperar la contrasena.");
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message.toLowerCase() : "";

      if (rawMessage.includes("invalid origin")) {
        setError(
          "Origen no autorizado. Agrega esta URL en Neon Auth (Trusted Origins): " +
            window.location.origin
        );
      } else {
        setError("No se pudo enviar el correo.");
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

        <h1 className="text-2xl font-bold mb-4">Recuperar Contrasena</h1>

        <form onSubmit={handleSubmit} className="space-y-3 text-left">
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

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-green-400">{success}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-white py-2 font-bold text-gray-900 transition-all hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isSubmitting ? "Enviando..." : "Enviar enlace"}
          </button>

          <div className="pt-2 text-center text-sm text-gray-300">
            <Link href="/login" className="underline hover:text-white">
              Volver al inicio de sesion
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
