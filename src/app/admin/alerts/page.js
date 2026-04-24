"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Users } from "lucide-react";
import {
  fetchAlertsConfig,
  fetchCurrentUser,
  fetchSensorAlertThresholds,
  runAlertsCheckNow,
  updateAlertsConfig,
  updateSensorAlertThresholds,
} from "@/utils/api";

const initialForm = {
  emailFrom: "",
  emailToText: "",
  cooldownMinutes: "180",
  enabled: true,
};

function createInitialBulkForm() {
  return {
  tempMin: "15",
  tempMax: "26",
  humMin: "40",
  humMax: "80",
  voltMin: "3.3",
  pressureMin: "0",
  pressureMax: "1000",
  lightMin: "0",
  lightMax: "200000",
  enabled: true,
  };
}

export default function AdminAlertsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [runResult, setRunResult] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [sensorThresholds, setSensorThresholds] = useState([]);
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [sensorSearch, setSensorSearch] = useState("");
  const [bulkForm, setBulkForm] = useState(createInitialBulkForm);

  useEffect(() => {
    if (!error && !success) {
      return;
    }

    const timeout = setTimeout(() => {
      setError("");
      setSuccess("");
    }, 4500);

    return () => clearTimeout(timeout);
  }, [error, success]);

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

        const [configResponse, thresholdResponse] = await Promise.all([
          fetchAlertsConfig(),
          fetchSensorAlertThresholds(),
        ]);

        const config = configResponse.config;

        setForm({
          emailFrom: config.emailFrom || "",
          emailToText: (config.emailTo || []).join("|"),
          cooldownMinutes: String(config.cooldownMinutes ?? "180"),
          enabled: Boolean(config.enabled),
        });

        setSensorThresholds(thresholdResponse.thresholds || []);
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

  function onThresholdChange(sensorId, field, value) {
    setSensorThresholds((prev) =>
      prev.map((item) =>
        item.sensorId === sensorId ? { ...item, [field]: value } : item
      )
    );
  }

  function onBulkChange(field, value) {
    setBulkForm((prev) => ({ ...prev, [field]: value }));
  }

  function getMetricInputClass(isDisabled, compact = false) {
    const sizeClass = compact ? "w-20 px-1.5 py-1 text-xs" : "px-2 py-2";
    const stateClass = isDisabled
      ? "border-gray-700 bg-gray-800 text-gray-500 cursor-not-allowed"
      : "border-gray-600 bg-gray-900";

    return `rounded-md border ${sizeClass} ${stateClass}`;
  }

  const filteredThresholds = sensorThresholds.filter((item) => {
    if (!sensorSearch) return true;
    return item.sensorName.toLowerCase().includes(sensorSearch.toLowerCase());
  });

  async function handleSave(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await updateAlertsConfig({
        emailFrom: form.emailFrom,
        emailTo: form.emailToText,
        cooldownMinutes: Number(form.cooldownMinutes),
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

  async function handleSaveThresholds() {
    try {
      setSavingThresholds(true);
      setError("");
      setSuccess("");

      const payload = {
        thresholds: sensorThresholds.map((item) => ({
          sensorId: item.sensorId,
          tempMin: Number(item.tempMin),
          tempMax: Number(item.tempMax),
          humMin: Number(item.humMin),
          humMax: Number(item.humMax),
          voltMin: Number(item.voltMin),
          pressureMin: Number(item.pressureMin),
          pressureMax: Number(item.pressureMax),
          lightMin: Number(item.lightMin),
          lightMax: Number(item.lightMax),
          enabled: Boolean(item.enabled),
        })),
      };

      const response = await updateSensorAlertThresholds(payload);
      setSensorThresholds(response.thresholds || []);
      setSuccess("Umbrales por sensor guardados correctamente.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudieron guardar umbrales."
      );
    } finally {
      setSavingThresholds(false);
    }
  }

  function handleApplyBulkToFiltered() {
    const tempMin = Number(bulkForm.tempMin);
    const tempMax = Number(bulkForm.tempMax);
    const humMin = Number(bulkForm.humMin);
    const humMax = Number(bulkForm.humMax);
    const voltMin = Number(bulkForm.voltMin);
    const pressureMin = Number(bulkForm.pressureMin);
    const pressureMax = Number(bulkForm.pressureMax);
    const lightMin = Number(bulkForm.lightMin);
    const lightMax = Number(bulkForm.lightMax);

    if (
      !Number.isFinite(tempMin) ||
      !Number.isFinite(tempMax) ||
      !Number.isFinite(humMin) ||
      !Number.isFinite(humMax) ||
      !Number.isFinite(voltMin) ||
      !Number.isFinite(pressureMin) ||
      !Number.isFinite(pressureMax) ||
      !Number.isFinite(lightMin) ||
      !Number.isFinite(lightMax)
    ) {
      setError("Los valores base deben ser numericos.");
      return;
    }

    if (tempMin >= tempMax) {
      setError("TEMP_MIN debe ser menor que TEMP_MAX en valores base.");
      return;
    }

    if (humMin >= humMax) {
      setError("HUM_MIN debe ser menor que HUM_MAX en valores base.");
      return;
    }

    if (pressureMin >= pressureMax) {
      setError("PRESSURE_MIN debe ser menor que PRESSURE_MAX en valores base.");
      return;
    }

    if (lightMin >= lightMax) {
      setError("LIGHT_MIN debe ser menor que LIGHT_MAX en valores base.");
      return;
    }

    const filteredIds = new Set(filteredThresholds.map((item) => item.sensorId));

    if (filteredIds.size === 0) {
      setError("No hay sensores filtrados para aplicar valores base.");
      return;
    }

    setSensorThresholds((prev) =>
      prev.map((item) => {
        if (!filteredIds.has(item.sensorId)) {
          return item;
        }

        return {
          ...item,
          tempMin,
          tempMax,
          humMin,
          humMax,
          voltMin,
          pressureMin: item.hasPressure ? pressureMin : item.pressureMin,
          pressureMax: item.hasPressure ? pressureMax : item.pressureMax,
          lightMin: item.hasLight ? lightMin : item.lightMin,
          lightMax: item.hasLight ? lightMax : item.lightMax,
          enabled: bulkForm.enabled,
        };
      })
    );

    setError("");
    setSuccess(
      `Valores base aplicados a ${filteredIds.size} sensor(es) filtrados. Ahora pulsa "Guardar umbrales".`
    );
  }

  function handleResetBulkForm() {
    setBulkForm(createInitialBulkForm());
    setError("");
    setSuccess("Valores base restablecidos.");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <p>Cargando configuracion de notificaciones...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-6">
      <div className="mx-auto max-w-[96rem] space-y-6">
        {(error || success) && (
          <div className="fixed top-4 right-4 z-[100]">
            <div
              className={`rounded-md px-4 py-3 text-sm shadow-lg border ${
                error
                  ? "bg-red-900/90 border-red-700 text-red-100"
                  : "bg-emerald-900/90 border-emerald-700 text-emerald-100"
              }`}
            >
              {error || success}
            </div>
          </div>
        )}

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

        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Umbrales por sensor</h2>
            <button
              type="button"
              onClick={handleSaveThresholds}
              disabled={savingThresholds}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800"
            >
              {savingThresholds ? "Guardando..." : "Guardar umbrales"}
            </button>
          </div>

          <input
            type="text"
            value={sensorSearch}
            onChange={(event) => setSensorSearch(event.target.value)}
            className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2"
            placeholder="Buscar sensor por nombre..."
          />

          <div className="rounded-lg border border-gray-700 bg-gray-900 p-3 space-y-3">
            <p className="text-sm font-semibold">Aplicacion masiva (a sensores filtrados)</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs text-gray-300">
                TEMP_MIN
                <input
                  type="number"
                  step="0.01"
                  value={bulkForm.tempMin}
                  onChange={(event) => onBulkChange("tempMin", event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                />
              </label>
              <label className="text-xs text-gray-300">
                TEMP_MAX
                <input
                  type="number"
                  step="0.01"
                  value={bulkForm.tempMax}
                  onChange={(event) => onBulkChange("tempMax", event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                />
              </label>
              <label className="text-xs text-gray-300">
                HUM_MIN
                <input
                  type="number"
                  step="0.01"
                  value={bulkForm.humMin}
                  onChange={(event) => onBulkChange("humMin", event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                />
              </label>
              <label className="text-xs text-gray-300">
                HUM_MAX
                <input
                  type="number"
                  step="0.01"
                  value={bulkForm.humMax}
                  onChange={(event) => onBulkChange("humMax", event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                />
              </label>
              <label className="text-xs text-gray-300">
                VOLT_MIN
                <input
                  type="number"
                  step="0.01"
                  value={bulkForm.voltMin}
                  onChange={(event) => onBulkChange("voltMin", event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                />
              </label>
              <label className="text-xs text-gray-300">
                PRESSURE_MIN
                <input
                  type="number"
                  step="0.01"
                  value={bulkForm.pressureMin}
                  onChange={(event) => onBulkChange("pressureMin", event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                />
              </label>
              <label className="text-xs text-gray-300">
                PRESSURE_MAX
                <input
                  type="number"
                  step="0.01"
                  value={bulkForm.pressureMax}
                  onChange={(event) => onBulkChange("pressureMax", event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                />
              </label>
              <label className="text-xs text-gray-300">
                LIGHT_MIN
                <input
                  type="number"
                  step="0.01"
                  value={bulkForm.lightMin}
                  onChange={(event) => onBulkChange("lightMin", event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                />
              </label>
              <label className="text-xs text-gray-300">
                LIGHT_MAX
                <input
                  type="number"
                  step="0.01"
                  value={bulkForm.lightMax}
                  onChange={(event) => onBulkChange("lightMax", event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={bulkForm.enabled}
                  onChange={(event) => onBulkChange("enabled", event.target.checked)}
                />
                Marcar activos al aplicar
              </label>
              <button
                type="button"
                onClick={handleApplyBulkToFiltered}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold hover:bg-indigo-500"
              >
                Aplicar a filtrados
              </button>
              <button
                type="button"
                onClick={handleResetBulkForm}
                className="rounded-md bg-slate-600 px-3 py-2 text-sm font-semibold hover:bg-slate-500"
              >
                Restablecer formulario base
              </button>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {filteredThresholds.map((item) => (
              <div
                key={item.sensorId}
                className="rounded-lg border border-gray-700 bg-gray-900 p-3"
              >
                <p className="text-sm font-semibold">{item.sensorName}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={item.tempMin}
                    onChange={(event) =>
                      onThresholdChange(item.sensorId, "tempMin", event.target.value)
                    }
                    className="rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                    placeholder="TEMP_MIN"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.tempMax}
                    onChange={(event) =>
                      onThresholdChange(item.sensorId, "tempMax", event.target.value)
                    }
                    className="rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                    placeholder="TEMP_MAX"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.humMin}
                    onChange={(event) =>
                      onThresholdChange(item.sensorId, "humMin", event.target.value)
                    }
                    className="rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                    placeholder="HUM_MIN"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.humMax}
                    onChange={(event) =>
                      onThresholdChange(item.sensorId, "humMax", event.target.value)
                    }
                    className="rounded-md border border-gray-600 bg-gray-900 px-2 py-2"
                    placeholder="HUM_MAX"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.voltMin}
                    onChange={(event) =>
                      onThresholdChange(item.sensorId, "voltMin", event.target.value)
                    }
                    className="rounded-md border border-gray-600 bg-gray-900 px-2 py-2 col-span-2"
                    placeholder="VOLT_MIN"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.pressureMin}
                    disabled={!item.hasPressure}
                    onChange={(event) =>
                      onThresholdChange(item.sensorId, "pressureMin", event.target.value)
                    }
                    title={!item.hasPressure ? "Sensor sin medicion de presion" : undefined}
                    className={getMetricInputClass(!item.hasPressure)}
                    placeholder="PRESSURE_MIN"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.pressureMax}
                    disabled={!item.hasPressure}
                    onChange={(event) =>
                      onThresholdChange(item.sensorId, "pressureMax", event.target.value)
                    }
                    title={!item.hasPressure ? "Sensor sin medicion de presion" : undefined}
                    className={getMetricInputClass(!item.hasPressure)}
                    placeholder="PRESSURE_MAX"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.lightMin}
                    disabled={!item.hasLight}
                    onChange={(event) =>
                      onThresholdChange(item.sensorId, "lightMin", event.target.value)
                    }
                    title={!item.hasLight ? "Sensor sin medicion de luz" : undefined}
                    className={getMetricInputClass(!item.hasLight)}
                    placeholder="LIGHT_MIN"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.lightMax}
                    disabled={!item.hasLight}
                    onChange={(event) =>
                      onThresholdChange(item.sensorId, "lightMax", event.target.value)
                    }
                    title={!item.hasLight ? "Sensor sin medicion de luz" : undefined}
                    className={getMetricInputClass(!item.hasLight)}
                    placeholder="LIGHT_MAX"
                  />
                </div>
                <label className="mt-3 inline-flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(event) =>
                      onThresholdChange(item.sensorId, "enabled", event.target.checked)
                    }
                  />
                  Alertas activas para este sensor
                </label>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <table className="w-full table-fixed text-xs lg:text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-left text-gray-300">
                  <th className="w-44 py-2 pr-2">Sensor</th>
                  <th className="py-2 pr-2">TEMP_MIN</th>
                  <th className="py-2 pr-2">TEMP_MAX</th>
                  <th className="py-2 pr-2">HUM_MIN</th>
                  <th className="py-2 pr-2">HUM_MAX</th>
                  <th className="py-2 pr-2">VOLT_MIN</th>
                  <th className="py-2 pr-2">PRESSURE_MIN</th>
                  <th className="py-2 pr-2">PRESSURE_MAX</th>
                  <th className="py-2 pr-2">LIGHT_MIN</th>
                  <th className="py-2 pr-2">LIGHT_MAX</th>
                  <th className="py-2 pr-2">Activo</th>
                </tr>
              </thead>
              <tbody>
                {filteredThresholds.map((item) => (
                  <tr key={item.sensorId} className="border-b border-gray-800">
                    <td className="py-2 pr-2 truncate" title={item.sensorName}>
                      {item.sensorName}
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.tempMin}
                        onChange={(event) =>
                          onThresholdChange(item.sensorId, "tempMin", event.target.value)
                        }
                        className={getMetricInputClass(false, true)}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.tempMax}
                        onChange={(event) =>
                          onThresholdChange(item.sensorId, "tempMax", event.target.value)
                        }
                        className={getMetricInputClass(false, true)}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.humMin}
                        onChange={(event) =>
                          onThresholdChange(item.sensorId, "humMin", event.target.value)
                        }
                        className={getMetricInputClass(false, true)}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.humMax}
                        onChange={(event) =>
                          onThresholdChange(item.sensorId, "humMax", event.target.value)
                        }
                        className={getMetricInputClass(false, true)}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.voltMin}
                        onChange={(event) =>
                          onThresholdChange(item.sensorId, "voltMin", event.target.value)
                        }
                        className={getMetricInputClass(false, true)}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.pressureMin}
                        disabled={!item.hasPressure}
                        onChange={(event) =>
                          onThresholdChange(item.sensorId, "pressureMin", event.target.value)
                        }
                        title={!item.hasPressure ? "Sensor sin medicion de presion" : undefined}
                        className={getMetricInputClass(!item.hasPressure, true)}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.pressureMax}
                        disabled={!item.hasPressure}
                        onChange={(event) =>
                          onThresholdChange(item.sensorId, "pressureMax", event.target.value)
                        }
                        title={!item.hasPressure ? "Sensor sin medicion de presion" : undefined}
                        className={getMetricInputClass(!item.hasPressure, true)}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.lightMin}
                        disabled={!item.hasLight}
                        onChange={(event) =>
                          onThresholdChange(item.sensorId, "lightMin", event.target.value)
                        }
                        title={!item.hasLight ? "Sensor sin medicion de luz" : undefined}
                        className={getMetricInputClass(!item.hasLight, true)}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.lightMax}
                        disabled={!item.hasLight}
                        onChange={(event) =>
                          onThresholdChange(item.sensorId, "lightMax", event.target.value)
                        }
                        title={!item.hasLight ? "Sensor sin medicion de luz" : undefined}
                        className={getMetricInputClass(!item.hasLight, true)}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(event) =>
                          onThresholdChange(item.sensorId, "enabled", event.target.checked)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              <label className="mb-1 block text-sm text-gray-300">
                COOLDOWN (min)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.cooldownMinutes}
                onChange={(event) => onChange("cooldownMinutes", event.target.value)}
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
            <p>Alertas omitidas por cooldown: {runResult.skippedByCooldown || 0}</p>
            <p>Cooldown aplicado: {runResult.cooldownMinutes || 0} min</p>
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

      </div>
    </div>
  );
}
