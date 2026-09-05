"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Home, Users } from "lucide-react";
import { fetchCurrentUser } from "@/utils/api";
import AlarmLogsTab from "./AlarmLogsTab";
import ReportLogsTab from "./ReportLogsTab";

const TABS = [
  { key: "alarms", label: "Alarmas" },
  { key: "reports", label: "Reportes generados" },
];

export default function AdminAlarmLogsPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("alarms");
  const [currentUserName, setCurrentUserName] = useState("");

  const handleError = useCallback((message) => {
    setError(message);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const me = await fetchCurrentUser();
        if (cancelled) return;

        if (me?.user?.role !== "admin") {
          router.replace("/");
          return;
        }

        setCurrentUserName(me?.user?.name || me?.user?.email || "");
        setCheckingAccess(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo validar la sesion.");
          setCheckingAccess(false);
        }
      }
    }

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(""), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-6">
      <div className="mx-auto max-w-[96rem] space-y-6">
        {error && (
          <div className="fixed top-4 right-4 z-[100]">
            <div className="rounded-md px-4 py-3 text-sm shadow-lg border bg-red-900/90 border-red-700 text-red-100">
              {error}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold">Historial de eventos</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/admin/users")}
              className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full flex items-center shadow-lg"
              title="Administracion de usuarios"
            >
              <Users size={20} />
            </button>
            <button
              onClick={() => router.push("/admin/alerts")}
              className="bg-amber-600 hover:bg-amber-500 text-white p-2 rounded-full flex items-center shadow-lg"
              title="Configurar notificaciones"
            >
              <Bell size={20} />
            </button>
            <button
              onClick={() => router.push("/")}
              className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full flex items-center shadow-lg"
              title="Volver al inicio"
            >
              <Home size={20} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 border-b border-gray-700">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-blue-500 text-white"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          {checkingAccess ? (
            <p className="text-gray-400">Validando acceso...</p>
          ) : activeTab === "alarms" ? (
            <AlarmLogsTab onError={handleError} currentUserName={currentUserName} />
          ) : (
            <ReportLogsTab onError={handleError} currentUserName={currentUserName} />
          )}
        </div>
      </div>
    </div>
  );
}
