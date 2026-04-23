"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Users } from "lucide-react";
import {
  fetchAlertsConfig,
  fetchCurrentUser,
  runAlertsCheckNow,
  updateAlertsConfig,
} from "@/utils/api";

const initialForm = {
  emailFrom: "",
  emailToText: "",
  tempMin: "15",
  tempMax: "26",
  humMin: "40",
  humMax: "80",
  voltMin: "3.3",
  enabled: true,
};

export default function AdminAlertsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [runResult, setRunResult] = useState(null);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const me = await fetchCurrentUser();
        if (me?.user?.role !== "admin") {
          router.replace("/");
          return;
        }

        const response = await fetchAlertsConfig();
        const config = response.config;

        setForm({
          emailFrom: config.emailFrom || "",
          emailToText: (config.emailTo || []).join("|"),
          tempMin: String(config.tempMin ?? ""),
          tempMax: String(config.tempMax ?? ""),
          humMin: String(config.humMin ?? ""),
          humMax: String(config.humMax ?? ""),
          voltMin: String(config.voltMin ?? ""),
          enabled: Boolean(config.enabled),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  function onChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await updateAlertsConfig({
        emailFrom: form.emailFrom,
        emailTo: form.emailToText,
        tempMin: Number(form.tempMin),
        tempMax: Number(form.tempMax),
        humMin: Number(form.humMin),
        humMax: Number(form.humMax),
        voltMin: Number(form.voltMin),
        enabled: form.enabled,
      });

      setSuccess("Configuracion guardada correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    try {
      setRunning(true);
      setError("");
      setSuccess("");
      setRunResult(null);

      const result = await runAlertsCheckNow();
      setRunResult(result);
      setSuccess("Verificacion ejecutada correctamente.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo ejecutar verificacion."
      );
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <p>Cargando configuracion de notificaciones...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Configuracion de notificaciones</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/admin/users")}
              className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full flex items-center shadow-lg"
              title="Administracion de usuarios"
            >
              <Users size={20} />
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

        <form
          onSubmit={handleSave}
          className="rounded-lg border border-gray-700 bg-gray-800 p-4 space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm text-gray-300">EMAIL_FROM</label>
            <input
              value={form.emailFrom}
              onChange={(event) => onChange("emailFrom", event.target.value)}
              className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2"
              placeholder="notificaciones@dominio.com"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-300">
              EMAIL_TO (separados por |)
            </label>
            <textarea
              value={form.emailToText}
              onChange={(event) => onChange("emailToText", event.target.value)}
              className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2"
              rows={3}
              placeholder="correo1@dominio.com|correo2@dominio.com"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-gray-300">TEMP_MIN</label>
              <input
                type="number"
                step="0.01"
                value={form.tempMin}
                onChange={(event) => onChange("tempMin", event.target.value)}
                className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">TEMP_MAX</label>
              <input
                type="number"
                step="0.01"
                value={form.tempMax}
                onChange={(event) => onChange("tempMax", event.target.value)}
                className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">HUM_MIN</label>
              <input
                type="number"
                step="0.01"
                value={form.humMin}
                onChange={(event) => onChange("humMin", event.target.value)}
                className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">HUM_MAX</label>
              <input
                type="number"
                step="0.01"
                value={form.humMax}
                onChange={(event) => onChange("humMax", event.target.value)}
                className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-300">VOLT_MIN</label>
              <input
                type="number"
                step="0.01"
                value={form.voltMin}
                onChange={(event) => onChange("voltMin", event.target.value)}
                className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2"
                required
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => onChange("enabled", event.target.checked)}
            />
            Activar notificaciones
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-green-600 px-4 py-2 font-semibold hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-green-800"
            >
              {saving ? "Guardando..." : "Guardar configuracion"}
            </button>
            <button
              type="button"
              disabled={running}
              onClick={handleRunNow}
              className="rounded-md bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-800"
            >
              {running ? "Ejecutando..." : "Ejecutar verificacion ahora"}
            </button>
          </div>
        </form>

        {runResult && (
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-sm">
            <p>Sensores revisados: {runResult.checkedSensors}</p>
            <p>Alertas enviadas: {runResult.sentAlerts}</p>
            {Array.isArray(runResult.errors) && runResult.errors.length > 0 && (
              <div className="mt-2">
                <p className="font-semibold text-red-300">Errores:</p>
                {runResult.errors.map((item) => (
                  <p key={item} className="text-red-300">
                    - {item}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-400">{success}</p>}
      </div>
    </div>
  );
}
