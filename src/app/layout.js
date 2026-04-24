"use client";
import { useEffect } from "react";
import AuthGuard from "@/components/AuthGuard";
import InstallButton from "@/components/InstallButton";

import "../styles/globals.css";

export default function RootLayout({ children }) {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js?v=2")
        .then((registration) => {
          registration.update().catch(() => null);
        })
        .catch((err) => {
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
        <AuthGuard>{children}</AuthGuard>
        <InstallButton />
      </body>
    </html>
  );
}
