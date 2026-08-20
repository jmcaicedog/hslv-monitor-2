"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Home, Users } from "lucide-react";
import { fetchAlarmLogs, fetchCurrentUser } from "@/utils/api";

const PAGE_SIZE = 50;

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function statusLabel(status) {
  switch (status) {
    case "attended":
      return { text: "Atendida", className: "bg-emerald-900/60 text-emerald-200 border-emerald-700" };
    case "resolved":
      return { text: "Resuelta sola", className: "bg-blue-900/60 text-blue-200 border-blue-700" };
    default:
      return { text: "Activa", className: "bg-red-900/60 text-red-200 border-red-700" };
  }
}

export default function AdminAlarmLogsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [episodes, setEpisodes] = useState([]);
  const [total, setTotal] = useState(0);

  const loadPage = useCallback(async (offset) => {
    const response = await fetchAlarmLogs({ limit: PAGE_SIZE, offset });
    return response;
  }, []);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        setError("");

        const me = await fetchCurrentUser();
        if (me?.user?.role !== "admin") {
          router.replace("/");
          return;
        }

        const response = await loadPage(0);
        setEpisodes(response.episodes || []);
        setTotal(response.total || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el historial.");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [loadPage, router]);

  async function handleLoadMore() {
    try {
      setLoadingMore(true);
      setError("");
      const response = await loadPage(episodes.length);
      setEpisodes((prev) => [...prev, ...(response.episodes || [])]);
      setTotal(response.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar mas registros.");
    } finally {
      setLoadingMore(false);
    }
  }

  const hasMore = episodes.length < total;

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
          <h1 className="text-2xl font-bold">Historial de alarmas</h1>
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

        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Alarmas generadas ({total})
            </h2>
          </div>

          {loading ? (
            <p className="text-gray-400">Cargando historial...</p>
          ) : episodes.length === 0 ? (
            <p className="text-gray-400">Aun no hay alarmas registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="py-2 pr-4">Sensor</th>
                    <th className="py-2 pr-4">Variables</th>
                    <th className="py-2 pr-4">Generada</th>
                    <th className="py-2 pr-4">Atendida por</th>
                    <th className="py-2 pr-4">Atendida el</th>
                    <th className="py-2 pr-4">Resuelta el</th>
                    <th className="py-2 pr-4">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {episodes.map((episode) => {
                    const status = statusLabel(episode.status);
                    return (
                      <tr key={episode.id} className="border-b border-gray-800 align-top">
                        <td className="py-2 pr-4 font-medium">{episode.sensorName}</td>
                        <td className="py-2 pr-4 text-gray-300 max-w-xs">
                          {episode.metricsSummary || "-"}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {formatDateTime(episode.triggeredAt)}
                        </td>
                        <td className="py-2 pr-4">{episode.attendedBy || "-"}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {formatDateTime(episode.attendedAt)}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {formatDateTime(episode.resolvedAt)}
                        </td>
                        <td className="py-2 pr-4">
                          <span
                            className={`rounded-full border px-2 py-1 text-xs ${status.className}`}
                          >
                            {status.text}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-60 px-4 py-2 text-sm"
              >
                {loadingMore ? "Cargando..." : "Cargar mas"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
