"use client";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import Card from "@/components/Card";
import SearchBar from "@/components/SearchBar";
import Sidebar from "@/components/Sidebar";
import { fetchCurrentUser, fetchSensorsData } from "@/utils/api";
import {
  Bell,
  FilterX,
  LogOut,
  ScrollText,
  ShieldAlert,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

const STATUS_FILTERS = [
  { key: "connected", label: "Con conexión", icon: Wifi },
  { key: "disconnected", label: "Sin conexión", icon: WifiOff },
  { key: "alarm", label: "Con alarma", icon: ShieldAlert },
];

export default function Home() {
  const sessionState = authClient.useSession();
  const session = sessionState.data;
  const status = sessionState.isPending
    ? "loading"
    : session
      ? "authenticated"
      : "unauthenticated";
  const [sensors, setSensors] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeStatusFilters, setActiveStatusFilters] = useState(new Set());
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const toggleStatusFilter = (key) => {
    setActiveStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const clearStatusFilters = () => setActiveStatusFilters(new Set());

  const normalizeMetric = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const uniqueLocations = useMemo(() => {
    const set = new Set();
    sensors.forEach((sensor) => {
      if (sensor.description) {
        set.add(sensor.description);
      }
    });
    return Array.from(set);
  }, [sensors]);

  const filteredSensors = useMemo(() => {
    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();

    return sensors.filter((sensor) => {
      const matchLocation = selectedLocation
        ? sensor.description === selectedLocation
        : true;
      const matchSearch = normalizedSearch
        ? sensor.title.toLowerCase().includes(normalizedSearch)
        : true;
      const matchStatus =
        activeStatusFilters.size === 0
          ? true
          : (activeStatusFilters.has("connected") && Number(sensor.status) !== 0) ||
            (activeStatusFilters.has("disconnected") && Number(sensor.status) === 0) ||
            (activeStatusFilters.has("alarm") && sensor.hasActiveAlarm);
      return matchLocation && matchSearch && matchStatus;
    });
  }, [activeStatusFilters, deferredSearchTerm, selectedLocation, sensors]);

  useEffect(() => {
    async function loadSensors() {
      try {
        const [data, me] = await Promise.all([
          fetchSensorsData(),
          fetchCurrentUser().catch(() => null),
        ]);

        setIsAdmin(me?.user?.role === "admin");

        const formattedData = data.map((sensor) => ({
          ...sensor,
          temperature: normalizeMetric(sensor.temperature),
          humidity: normalizeMetric(sensor.humidity),
          temperatureSecondary: normalizeMetric(sensor.temperatureSecondary),
          humiditySecondary: normalizeMetric(sensor.humiditySecondary),
          voltage: normalizeMetric(sensor.voltage),
          pressure: normalizeMetric(sensor.pressure),
          light: normalizeMetric(sensor.light),
          hasActiveAlarm: Boolean(sensor.hasActiveAlarm),
        }));
        setSensors(formattedData);
      } catch (error) {
        console.error("Error al cargar los sensores:", error);
      }
    }
    loadSensors();
  }, []);

  if (status === "loading") {
    return <p>Cargando sesión...</p>;
  }

  if (!session) {
    return <p>No estás autenticado.</p>;
  }

  return (
    <Layout>
      <div className="flex">
        {/* Componente de menú lateral */}
        <div className="w-0 lg:w-64 fixed z-[170] h-full overflow-visible bg-gray-800 text-white p-0 lg:p-4 lg:z-auto lg:overflow-hidden">
          {sensors.length > 0 ? (
            <Sidebar
              locations={uniqueLocations}
              onSelectLocation={setSelectedLocation}
              onOpenChange={setIsSidebarOpen}
              itemSpacing="space-y-0"
            />
          ) : (
            <p className="text-white p-4">Cargando ubicaciones...</p>
          )}
        </div>
        <div className="flex-1 p-6 pt-16 lg:p-6 ml-0 lg:ml-64">
          <div
            className={`sticky top-0 z-[120] -mx-2 mb-4 rounded-b-xl border-b border-gray-200 bg-white/95 px-2 pb-3 pt-2 shadow-sm backdrop-blur ${
              isSidebarOpen ? "hidden lg:block" : "block"
            }`}
          >
            <div className="mb-2 flex items-center justify-end gap-2">
              {isAdmin && (
                <>
                  <Link
                    href="/admin/users"
                    className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full flex items-center shadow-lg"
                    title="Administrar usuarios"
                  >
                    <Users size={20} />
                  </Link>
                  <Link
                    href="/admin/alerts"
                    className="bg-amber-600 hover:bg-amber-500 text-white p-2 rounded-full flex items-center shadow-lg"
                    title="Configurar notificaciones"
                  >
                    <Bell size={20} />
                  </Link>
                  <Link
                    href="/admin/alarm-logs"
                    className="bg-purple-600 hover:bg-purple-500 text-white p-2 rounded-full flex items-center shadow-lg"
                    title="Historial de alarmas"
                  >
                    <ScrollText size={20} />
                  </Link>
                </>
              )}
              <button
                onClick={() => authClient.signOut()}
                className="bg-red-600 hover:bg-red-500 text-white p-2 rounded-full flex items-center shadow-lg"
                title="Cerrar sesión"
              >
                <LogOut size={20} />
              </button>
            </div>
            <p className="mb-2">
              {selectedLocation
                ? `📍 Mostrando sensores de: ${selectedLocation} (${filteredSensors.length})`
                : `🌍 Mostrando todos los sensores (${filteredSensors.length})`}
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map(({ key, label, icon: Icon }) => {
                const isActive = activeStatusFilters.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleStatusFilter(key)}
                    title={label}
                    aria-pressed={isActive}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? "border-blue-600 bg-blue-600 text-white shadow"
                        : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                );
              })}
              {activeStatusFilters.size > 0 && (
                <button
                  type="button"
                  onClick={clearStatusFilters}
                  title="Limpiar filtros"
                  className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100"
                >
                  <FilterX size={14} />
                  Limpiar filtros
                </button>
              )}
            </div>
            {/* Componente de barra de búsqueda */}
            <SearchBar value={searchTerm} onChange={setSearchTerm} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredSensors.length > 0 ? (
              filteredSensors.map((sensor) => (
                <Card
                  key={sensor.id || sensor.title}
                  {...sensor}
                  layout="iconsOnly"
                />
              ))
            ) : (
              <p>No hay sensores disponibles.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
