"use client";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

const publicRoutes = ["/login", "/api/auth/error"];

export default function AuthGuard({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated" && !publicRoutes.includes(pathname)) {
      router.replace("/login");
    }
  }, [status, router, pathname]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <p className="text-xl">🔄 Cargando sesión...</p>
      </div>
    );
  }

  // Permitir acceso si hay sesión o si está en rutas públicas
  return session || publicRoutes.includes(pathname) ? children : null;
}
