"use client";
import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import AuthGuard from "@/components/AuthGuard";
import InstallButton from "@/components/InstallButton";

import "../styles/globals.css";

export default function RootLayout({ children }) {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service Worker registration failed:", err);
      });
    }
  }, []);

  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        <SessionProvider>
          <AuthGuard>{children}</AuthGuard>
          <InstallButton />
        </SessionProvider>
      </body>
    </html>
  );
}
