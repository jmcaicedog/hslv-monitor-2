"use client";
import { fetchSensorReadings } from "@/utils/api";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FaTimes, FaDownload } from "react-icons/fa";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useParams } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";

const calculateMinMax = (data, key) => {
  const numeric = data.map((d) => parseFloat(d[key])).filter((v) => !isNaN(v));

  if (numeric.length === 0) return { min: null, max: null };

  return {
    min: Math.min(...numeric),
    max: Math.max(...numeric),
  };
};

const unitMap = {
  temperatura: "°C",
  humedad: "%",
  voltaje: "V",
  presion: "KPa",
  luz: "lx",
};

const SensorDetail = () => {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;
  const [filteredData, setFilteredData] = useState([]);
  const [sensorName, setSensorName] = useState("");
  const [timeRange, setTimeRange] = useState(24);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const getLast12Months = () => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - i - 1, 1);
      return {
        label: date.toLocaleString("default", {
          month: "long",
          year: "numeric",
        }),
        value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}`,
      };
    });
  };

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError("");

      try {
        const payload = await fetchSensorReadings(id, {
          month: selectedMonth,
          hours: selectedMonth ? undefined : timeRange,
        });

        setSensorName(payload.sensorName || id);

        const normalized = (payload.data || [])
          .map((entry) => ({
            ...entry,
            timestamp: new Date(entry.timestamp).getTime(),
          }))
          .filter((entry) => Number.isFinite(entry.timestamp))
          .sort((a, b) => a.timestamp - b.timestamp);

        setFilteredData(normalized);
      } catch (err) {
        console.error("Error fetching sensor data from DB:", err);
        setError("No se pudo cargar informacion del sensor desde la base de datos.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, timeRange, selectedMonth]);

  const dailyMinMax = useMemo(() => {
    const dailyValues = {};

    filteredData.forEach((entry) => {
      const date = new Date(entry.timestamp).toISOString().split("T")[0];

      Object.keys(entry).forEach((key) => {
        if (key === "timestamp") return;

        const value = parseFloat(entry[key]);
        if (Number.isNaN(value)) return;

        if (!dailyValues[key]) {
          dailyValues[key] = {};
        }

        if (!dailyValues[key][date]) {
          dailyValues[key][date] = {
            min: value,
            max: value,
          };
        } else {
          dailyValues[key][date].min = Math.min(dailyValues[key][date].min, value);
          dailyValues[key][date].max = Math.max(dailyValues[key][date].max, value);
        }
      });
    });

    return dailyValues;
  }, [filteredData]);

  const minMaxValues = useMemo(() => {
    return Object.keys(dailyMinMax).reduce((acc, key) => {
      acc[key] = calculateMinMax(filteredData, key);
      return acc;
    }, {});
  }, [dailyMinMax, filteredData]);

  async function handleDownloadPDF() {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const elements = document.querySelectorAll(".sensor-chart, .data-table");
    let yOffset = 10;

    for (let element of elements) {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const imgHeight = (canvas.height * 190) / canvas.width;

      if (yOffset + imgHeight > 260) {
        doc.addPage();
        yOffset = 10;
      }

      doc.addImage(imgData, "PNG", 10, yOffset, 190, imgHeight);
      yOffset += imgHeight + 10;
    }

    doc.save(`sensor_${id}.pdf`);
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{sensorName || id}</h1>
        <div className="flex gap-4">
          <button
            className="p-2 bg-gray-200 rounded-full hover:bg-gray-300"
            onClick={() => router.push("/")}
          >
            {" "}
            <FaTimes size={20} />{" "}
          </button>
          <button
            className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600"
            onClick={handleDownloadPDF}
          >
            {" "}
            <FaDownload size={20} />{" "}
          </button>
        </div>
      </div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        <div>
          <label className="mr-2">Selecciona el periodo:</label>
          <select
            value={timeRange}
            onChange={(e) => {
              setTimeRange(Number(e.target.value));
              setSelectedMonth(null);
            }}
            className="border p-1 rounded"
          >
            <option value={24}>Últimas 24 horas</option>
            <option value={72}>Últimos 3 días</option>
            <option value={168}>Última semana</option>
            <option value={720}>Último mes</option>
          </select>
        </div>

        <div>
          <label className="mr-2">Selecciona el mes:</label>
          <select
            value={selectedMonth || ""}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border p-1 rounded"
          >
            <option value="">Selecciona el mes</option>
            {getLast12Months().map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="bg-gray-800 text-white border border-gray-800 rounded-md p-4 text-center shadow-md mb-6 mt-6">
          <p className="text-base font-medium">Cargando datos desde la base de datos...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-md p-4 text-center shadow-md mb-6 mt-6">
          <p className="text-base font-medium">{error}</p>
        </div>
      )}

      {selectedMonth && filteredData.length === 0 && (
        <div className="bg-gray-800 text-white border border-gray-800 rounded-md p-4 text-center shadow-md mb-6 mt-6">
          <p className="text-base font-medium">
            No hay datos disponibles para el mes seleccionado.
          </p>
        </div>
      )}

      {!selectedMonth && !isLoading && !error && filteredData.length === 0 && (
        <div className="bg-gray-800 text-white border border-gray-800 rounded-md p-4 text-center shadow-md mb-6 mt-6">
          <p className="text-base font-medium">
            No hay datos disponibles para el periodo seleccionado.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredData.length > 0 &&
          Object.keys(dailyMinMax).map((key) => {
            const chartData = filteredData.filter(
              (d) => d[key] != null && !Number.isNaN(parseFloat(d[key]))
            );

            if (chartData.length === 0 || minMaxValues[key].min == null) {
              return null;
            }

            return (
              <div
                key={key}
                className="sensor-chart bg-white shadow-md rounded-lg p-4 border border-gray-300"
              >
                <h2 className="text-lg text-center font-semibold">
                  {key.charAt(0).toUpperCase() + key.slice(1)} ({unitMap[key]})
                </h2>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData}>
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(time) => {
                        const date = new Date(time);
                        if (isNaN(date.getTime())) return "";
                        return new Intl.DateTimeFormat("es-ES", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        }).format(date);
                      }}
                    />

                    <YAxis
                      domain={[
                        minMaxValues[key].min * 0.95,
                        minMaxValues[key].max * 1.05,
                      ]}
                      tickFormatter={(value) => Number(value).toFixed(2)}
                    />

                    <Tooltip />
                    <CartesianGrid strokeDasharray="3 3" />

                    <Line
                      type="monotone"
                      dataKey={key}
                      stroke="#8884d8"
                      strokeWidth={2}
                      dot={false}
                    />

                    <ReferenceDot
                      x={
                        chartData.find(
                          (d) =>
                            Math.abs(
                              parseFloat(d[key]) - minMaxValues[key].min
                            ) < 0.001
                        )?.timestamp || 0
                      }
                      y={minMaxValues[key].min}
                      fill="red"
                      label={{
                        value: `${minMaxValues[key].min}`,
                        position: "bottom",
                      }}
                    />

                    <ReferenceDot
                      x={
                        chartData.find(
                          (d) =>
                            Math.abs(
                              parseFloat(d[key]) - minMaxValues[key].max
                            ) < 0.001
                        )?.timestamp || 0
                      }
                      y={minMaxValues[key].max}
                      fill="green"
                      label={{
                        value: `${minMaxValues[key].max}`,
                        position: "bottom",
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })}
      </div>
      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.keys(dailyMinMax).map((key) => (
          <div
            key={key}
            className="bg-white shadow-md rounded-lg p-4 border border-gray-300 data-table"
          >
            <h2 className="text-lg text-center font-semibold">
              {key.charAt(0).toUpperCase() + key.slice(1)} ({unitMap[key]})
            </h2>
            <table className="w-full mt-4 border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2">Fecha</th>
                  <th className="border border-gray-300 p-2">Mínimo</th>
                  <th className="border border-gray-300 p-2">Máximo</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(dailyMinMax[key])
                  .sort((a, b) => a.localeCompare(b))
                  .slice(-30)
                  .map((date) => (
                    <tr key={date}>
                      <td className="border text-center border-gray-300 p-2">
                        {date}
                      </td>
                      <td className="border text-center border-gray-300 p-2">
                        {dailyMinMax[key][date].min.toFixed(2)} ({unitMap[key]})
                      </td>
                      <td className="border text-center border-gray-300 p-2">
                        {dailyMinMax[key][date].max.toFixed(2)} ({unitMap[key]})
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SensorDetail;
