export async function fetchSensorsData() {
  const response = await fetch(
    `https://webapi.ubibot.com/channels?account_key=${process.env.NEXT_PUBLIC_UBIBOT_KEY}`
  );

  if (!response.ok) {
    throw new Error("Error al obtener los datos de la API");
  }

  const data = await response.json();

  return data.channels.map((channel) => {
    let sensorData = {};
    try {
      sensorData = JSON.parse(channel.last_values); // Convierte la cadena en un objeto JSON
    } catch (error) {
      console.error("Error al parsear last_values:", error);
    }

    return {
      id: channel.channel_id,
      title: channel.name,
      description: channel.description,
      temperature: sensorData.field1?.value ?? "N/A",
      humidity: sensorData.field2?.value ?? "N/A",
      voltage: sensorData.field3?.value ?? "N/A",
      pressure: sensorData.field9?.value ?? null, // Presión atmosférica si existe
      light: sensorData.field6?.value ?? null, // Luz si existe
      createdAt: sensorData.field1?.created_at ?? "N/A",
      status: channel.net,
    };
  });
}
