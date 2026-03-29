"use client";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import Card from "@/components/Card";
import SearchBar from "@/components/SearchBar";
import Sidebar from "@/components/Sidebar";
import { fetchSensorsData } from "@/utils/api";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

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

  const filteredSensors = sensors.filter((sensor) => {
    const matchLocation = selectedLocation
      ? sensor.description === selectedLocation
      : true;
    const matchSearch = searchTerm
      ? sensor.title.toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    return matchLocation && matchSearch;
  });

  useEffect(() => {
    async function loadSensors() {
      try {
        const data = await fetchSensorsData();
        const formattedData = data.map((sensor) => ({
          ...sensor,
          temperature: sensor.temperature
            ? parseFloat(sensor.temperature).toFixed(2)
            : "N/A",
          humidity: sensor.humidity
            ? parseFloat(sensor.humidity).toFixed(2)
            : "N/A",
          voltage: sensor.voltage
            ? parseFloat(sensor.voltage).toFixed(2)
            : "N/A",
          pressure: sensor.pressure
            ? parseFloat(sensor.pressure).toFixed(2)
            : null,
          light: sensor.light ? parseFloat(sensor.light).toFixed(2) : null,
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
        <div className="w-0 lg:w-64 fixed h-full overflow-hidden bg-gray-800 text-white p-0 lg:p-4">
          {sensors.length > 0 ? (
            <Sidebar
              locations={sensors.map((s) => s.description)}
              onSelectLocation={setSelectedLocation}
              itemSpacing="space-y-0"
            />
          ) : (
            <p className="text-white p-4">Cargando ubicaciones...</p>
          )}
        </div>
        <div className="fixed top-[18px] lg:top-4 right-[80px] lg:right-6">
          <button
            onClick={() => authClient.signOut()}
            className="bg-red-600 hover:bg-red-500 text-white p-2 rounded-full flex items-center shadow-lg"
            title="Cerrar sesión"
          >
            <LogOut size={20} />
          </button>
        </div>
        <div className="flex-1 p-6 pt-16 lg:p-6 ml-0 lg:ml-64">
          <p className="mb-2">
            {selectedLocation
              ? `📍 Mostrando sensores de: ${selectedLocation}`
              : "🌍 Mostrando todos los sensores"}
          </p>
          {/* Componente de barra de búsqueda */}
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredSensors.length > 0 ? (
              filteredSensors.map((sensor) => (
                <Card
                  key={sensor.id || sensor.title}
                  {...sensor}
                  showPressureAndLight={
                    sensor.pressure !== null && sensor.light !== null
                  }
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
