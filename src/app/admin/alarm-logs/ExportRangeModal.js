"use client";

import { useEffect, useState } from "react";

export default function ExportRangeModal({ open, title, busy, onCancel, onConfirm }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (open) {
      setFrom("");
      setTo("");
      setLocalError("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function handleConfirm() {
    if (from && to && from > to) {
      setLocalError("La fecha inicial debe ser menor o igual a la fecha final.");
      return;
    }

    setLocalError("");
    onConfirm({ from, to });
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-800 p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm text-gray-400">
          Selecciona el rango de fechas a incluir. Deja los campos vacios para exportar todos
          los registros.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-gray-300">
            Desde
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-sm text-gray-300">
            Hasta
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            />
          </label>
        </div>

        {localError && <p className="mt-3 text-sm text-red-300">{localError}</p>}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {busy ? "Generando..." : "Exportar PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
