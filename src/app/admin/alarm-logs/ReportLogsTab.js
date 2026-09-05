"use client";

import { useCallback, useEffect, useState } from "react";
import { FileDown } from "lucide-react";
import { fetchReportLogs } from "@/utils/api";
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
  { key: "userName", header: "Usuario", width: 1.6 },
  { key: "createdAt", header: "Fecha / hora", width: 1.3 },
  { key: "sensorName", header: "Sensor", width: 1.4 },
  { key: "reportTypeLabel", header: "Tipo de reporte", width: 1.2 },
  { key: "rangeLabel", header: "Rango consultado", width: 1.5 },
  { key: "observations", header: "Observaciones", width: 3 },
];

function reportTypeClassName(reportType) {
  switch (reportType) {
    case "csv":
      return "bg-emerald-900/60 text-emerald-200 border-emerald-700";
    case "out-of-range-pdf":
      return "bg-amber-900/60 text-amber-200 border-amber-700";
    default:
      return "bg-red-900/60 text-red-200 border-red-700";
  }
}

export default function ReportLogsTab({ onError, currentUserName }) {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadPage = useCallback((offset) => fetchReportLogs({ limit: PAGE_SIZE, offset }), []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        const response = await loadPage(0);
        if (cancelled) return;
        setLogs(response.logs || []);
        setTotal(response.total || 0);
      } catch (err) {
        if (!cancelled) {
          onError(
            err instanceof Error ? err.message : "No se pudo cargar el historial de reportes."
          );
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
      const response = await loadPage(logs.length);
      setLogs((prev) => [...prev, ...(response.logs || [])]);
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
      const items = await fetchAllPages(fetchReportLogs, rangeParams, (response) => response.logs);

      exportLogsToPdf({
        title: "Historial de generacion de reportes",
        columns: EXPORT_COLUMNS,
        rows: items.map((log) => ({
          userName: log.userName || log.userEmail || "-",
          createdAt: formatDateTime(log.createdAt),
          sensorName: log.sensorName || "-",
          reportTypeLabel: log.reportTypeLabel || log.reportType || "-",
          rangeLabel: log.rangeLabel || "-",
          observations: log.observations || "Sin observaciones",
        })),
        rangeLabel: buildRangeLabel({ from, to }),
        generatedBy: currentUserName,
        fileName: "historial_reportes.pdf",
      });

      setExportOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo exportar el historial.");
    } finally {
      setExporting(false);
    }
  }

  const hasMore = logs.length < total;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Reportes generados ({total})</h2>
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
      ) : logs.length === 0 ? (
        <p className="text-gray-400">Aun no hay reportes registrados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700">
                <th className="py-2 pr-4">Usuario</th>
                <th className="py-2 pr-4">Fecha / hora</th>
                <th className="py-2 pr-4">Sensor</th>
                <th className="py-2 pr-4">Tipo de reporte</th>
                <th className="py-2 pr-4">Rango consultado</th>
                <th className="py-2 pr-4">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                const observations = log.observations || "";
                const isLong = observations.length > 120;

                return (
                  <tr key={log.id} className="border-b border-gray-800 align-top">
                    <td className="py-2 pr-4 font-medium">
                      {log.userName || log.userEmail || "-"}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="py-2 pr-4">{log.sensorName || "-"}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`whitespace-nowrap rounded-full border px-2 py-1 text-xs ${reportTypeClassName(
                          log.reportType
                        )}`}
                      >
                        {log.reportTypeLabel || log.reportType}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-300">{log.rangeLabel || "-"}</td>
                    <td className="py-2 pr-4 text-gray-300 max-w-md">
                      {observations ? (
                        <>
                          <span className="whitespace-pre-wrap">
                            {isExpanded || !isLong
                              ? observations
                              : `${observations.slice(0, 120)}...`}
                          </span>
                          {isLong && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : log.id)}
                              className="ml-2 text-xs text-blue-400 hover:text-blue-300"
                            >
                              {isExpanded ? "Ver menos" : "Ver mas"}
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-500">Sin observaciones</span>
                      )}
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
        title="Exportar historial de reportes"
        busy={exporting}
        onCancel={() => setExportOpen(false)}
        onConfirm={handleExport}
      />
    </div>
  );
}
