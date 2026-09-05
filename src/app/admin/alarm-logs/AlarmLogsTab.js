"use client";

import { useCallback, useEffect, useState } from "react";
import { FileDown } from "lucide-react";
import { fetchAlarmLogs } from "@/utils/api";
import { exportLogsToPdf } from "@/lib/logs-pdf";
import ExportRangeModal from "./ExportRangeModal";
import {
  PAGE_SIZE,
  buildRangeLabel,
  fetchAllPages,
  formatDateTime,
  toRangeParams,
} from "./logs-shared";

const EXPORT_COLUMNS = [
  { key: "sensorName", header: "Sensor", width: 1.4 },
  { key: "metricsSummary", header: "Variables", width: 2.6 },
  { key: "triggeredAt", header: "Generada", width: 1.3 },
  { key: "attendedBy", header: "Atendida por", width: 1.4 },
  { key: "attendedAt", header: "Atendida el", width: 1.3 },
  { key: "resolvedAt", header: "Resuelta el", width: 1.3 },
  { key: "status", header: "Estado", width: 1 },
];

function statusLabel(status) {
  switch (status) {
    case "attended":
      return {
        text: "Atendida",
        className: "bg-emerald-900/60 text-emerald-200 border-emerald-700",
      };
    case "resolved":
      return {
        text: "Resuelta sola",
        className: "bg-blue-900/60 text-blue-200 border-blue-700",
      };
    default:
      return { text: "Activa", className: "bg-red-900/60 text-red-200 border-red-700" };
  }
}

export default function AlarmLogsTab({ onError, currentUserName }) {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [episodes, setEpisodes] = useState([]);
  const [total, setTotal] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadPage = useCallback((offset) => fetchAlarmLogs({ limit: PAGE_SIZE, offset }), []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        const response = await loadPage(0);
        if (cancelled) return;
        setEpisodes(response.episodes || []);
        setTotal(response.total || 0);
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : "No se pudo cargar el historial.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [loadPage, onError]);

  async function handleLoadMore() {
    try {
      setLoadingMore(true);
      const response = await loadPage(episodes.length);
      setEpisodes((prev) => [...prev, ...(response.episodes || [])]);
      setTotal(response.total || 0);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo cargar mas registros.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleExport({ from, to }) {
    try {
      setExporting(true);
      const rangeParams = toRangeParams({ from, to });
      const items = await fetchAllPages(
        fetchAlarmLogs,
        rangeParams,
        (response) => response.episodes
      );

      exportLogsToPdf({
        title: "Historial de alarmas",
        columns: EXPORT_COLUMNS,
        rows: items.map((episode) => ({
          sensorName: episode.sensorName || "-",
          metricsSummary: episode.metricsSummary || "-",
          triggeredAt: formatDateTime(episode.triggeredAt),
          attendedBy: episode.attendedBy || "-",
          attendedAt: formatDateTime(episode.attendedAt),
          resolvedAt: formatDateTime(episode.resolvedAt),
          status: statusLabel(episode.status).text,
        })),
        rangeLabel: buildRangeLabel({ from, to }),
        generatedBy: currentUserName,
        fileName: "historial_alarmas.pdf",
      });

      setExportOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo exportar el historial.");
    } finally {
      setExporting(false);
    }
  }

  const hasMore = episodes.length < total;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Alarmas generadas ({total})</h2>
        <button
          onClick={() => setExportOpen(true)}
          className="flex items-center gap-2 rounded-md bg-gray-700 px-3 py-2 text-sm hover:bg-gray-600"
        >
          <FileDown size={16} />
          Exportar PDF
        </button>
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
                      <span className={`rounded-full border px-2 py-1 text-xs ${status.className}`}>
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

      <ExportRangeModal
        open={exportOpen}
        title="Exportar historial de alarmas"
        busy={exporting}
        onCancel={() => setExportOpen(false)}
        onConfirm={handleExport}
      />
    </div>
  );
}
