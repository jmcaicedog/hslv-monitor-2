export async function fetchSensorsData() {
  const response = await fetch("/api/sensors", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Error al obtener los datos de sensores");
  }

  const data = await response.json();
  return data.sensors || [];
}

export async function fetchSensorReadings(sensorId, options = {}) {
  const params = new URLSearchParams();

  if (options.month) {
    params.set("month", options.month);
  } else {
    params.set("hours", String(options.hours || 24));
  }

  const response = await fetch(
    `/api/sensors/${sensorId}/readings?${params.toString()}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error("Error al obtener historico del sensor");
  }

  return response.json();
}
