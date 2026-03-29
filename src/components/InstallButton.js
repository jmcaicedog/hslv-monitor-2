"use client";
import { useEffect, useState } from "react";

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === "accepted") {
          console.log("Usuario instaló la PWA");
        }
        setDeferredPrompt(null);
        setIsInstallable(false);
      });
    }
  };

  // Para debugging: Verifica en consola si el evento se dispara
  useEffect(() => {
    console.log("isInstallable:", isInstallable);
  }, [isInstallable]);

  return isInstallable ? (
    <button
      onClick={handleInstall}
      style={{
        padding: "10px",
        fontSize: "16px",
        cursor: "pointer",
        position: "fixed",
        bottom: "20px",
        right: "20px",
        background: "#007bff",
        color: "#fff",
        border: "none",
        borderRadius: "5px",
      }}
    >
      📲 Instalar App
    </button>
  ) : null;
}
