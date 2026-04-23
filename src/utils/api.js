export async function fetchSensorsData() {
  const response = await fetch("/api/sensors", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Error al obtener los datos de sensores");
  }

  const data = await response.json();
  return data.sensors || [];
}

export async function fetchCurrentUser() {
  const response = await fetch("/api/me", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("No se pudo consultar el usuario actual");
  }

  return response.json();
}

export async function fetchUsers() {
  const response = await fetch("/api/users", { cache: "no-store" });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "No se pudo listar usuarios");
  }

  return response.json();
}

export async function createUser(payload) {
  const response = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "No se pudo crear el usuario");
  }

  return data;
}

export async function updateUser(userId, payload) {
  const response = await fetch(`/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "No se pudo actualizar el usuario");
  }

  return data;
}

export async function deleteUser(userId) {
  const response = await fetch(`/api/users/${userId}`, {
    method: "DELETE",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "No se pudo eliminar el usuario");
  }

  return data;
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
