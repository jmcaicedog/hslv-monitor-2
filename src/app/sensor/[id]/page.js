"use client";
import { loadCsvData } from "@/utils/loadCsvData";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FaTimes, FaDownload } from "react-icons/fa";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import axios from "axios";
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
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [dailyMinMax, setDailyMinMax] = useState({});
  const [sensorName, setSensorName] = useState("");
  const [timeRange, setTimeRange] = useState(24); // En horas
  const [selectedMonth, setSelectedMonth] = useState(null);

  // Últimos 12 meses
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
      try {
        const response = await axios.get(
          `https://webapi.ubibot.com/channels/${id}/summary.json?account_key=${process.env.NEXT_PUBLIC_UBIBOT_KEY}`
        );
        const jsonData = response.data;

        if (!jsonData.feeds) return;

        if (jsonData.channel && jsonData.channel.name) {
          setSensorName(jsonData.channel.name);
        }

        const allData = jsonData.feeds
          .map((feed) => {
            let entry = {
              timestamp: new Date(feed.created_at).getTime(),
            };
            if (feed.field1)
              entry.temperatura = parseFloat(feed.field1.avg).toFixed(2);
            if (feed.field2)
              entry.humedad = parseFloat(feed.field2.avg).toFixed(2);
            if (feed.field3)
              entry.voltaje = parseFloat(feed.field3.avg).toFixed(2);
            if (feed.field9)
              entry.presion = parseFloat(feed.field9.avg).toFixed(2);
            if (feed.field6) entry.luz = parseFloat(feed.field6.avg).toFixed(2);
            return entry;
          })
          .filter((entry) => Object.keys(entry).length > 1);

        setData(allData);
      } catch (error) {
        console.error("Error fetching sensor data:", error);
      }
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!selectedMonth || !id) return;

    const fetchCsv = async () => {
      const allCsvData = await loadCsvData(id);

      const [year, month] = selectedMonth.split("-");
      const filtered = allCsvData.filter((d) => {
        if (!d.timestamp || isNaN(new Date(d.timestamp))) return false;
        const dDate = new Date(d.timestamp);
        const entryYear = dDate.getFullYear();
        const entryMonth = dDate.getMonth(); // 0-based
        const selectedYear = parseInt(year, 10);
        const selectedMonth = parseInt(month, 10) - 1; // ajustamos a 0-based

        return entryYear === selectedYear && entryMonth === selectedMonth;
      });

      const reversed = filtered
        .map((entry) => {
          const parsed = new Date(entry.timestamp);
          const timestamp = isNaN(parsed.getTime()) ? null : parsed.getTime();

          const numericEntry = Object.entries(entry).reduce(
            (acc, [key, value]) => {
              if (key === "timestamp") return acc;
              const num = parseFloat(value);
              acc[key] = isNaN(num) ? null : num; // 👈 IMPORTANTE: guardar como número
              return acc;
            },
            {}
          );

          return {
            ...numericEntry,
            timestamp,
          };
        })
        .filter((entry) => entry.timestamp !== null)
        .reverse();

      setFilteredData(reversed);

      const dailyValues = {};

      reversed.forEach((entry) => {
        const dateObj = new Date(entry.timestamp);
        const date = dateObj.toISOString().split("T")[0];

        Object.keys(entry).forEach((key) => {
          if (key !== "timestamp" && entry[key] != null && !isNaN(entry[key])) {
            if (!dailyValues[key]) dailyValues[key] = {};
            if (!dailyValues[key][date]) {
              dailyValues[key][date] = {
                min: entry[key],
                max: entry[key],
              };
            } else {
              dailyValues[key][date].min = Math.min(
                dailyValues[key][date].min,
                entry[key]
              );
              dailyValues[key][date].max = Math.max(
                dailyValues[key][date].max,
                entry[key]
              );
            }
          }
        });
      });

      setDailyMinMax(dailyValues);
    };

    fetchCsv();
  }, [selectedMonth, id]);

  useEffect(() => {
    if (data.length === 0) return;

    const now = new Date();
    const startTime = new Date(now.getTime() - timeRange * 60 * 60 * 1000);

    const filtered = data.filter((entry) => entry.timestamp >= startTime);
    if (!selectedMonth) {
      const reversed = filtered.reverse();
      setFilteredData(reversed);

      const dailyValues = {};

      reversed.forEach((entry) => {
        const date = new Date(entry.timestamp).toISOString().split("T")[0];

        Object.keys(entry).forEach((key) => {
          if (key !== "timestamp") {
            if (!dailyValues[key]) dailyValues[key] = {};
            if (!dailyValues[key][date]) {
              dailyValues[key][date] = {
                min: parseFloat(entry[key]),
                max: parseFloat(entry[key]),
              };
            } else {
              dailyValues[key][date].min = Math.min(
                dailyValues[key][date].min,
                parseFloat(entry[key])
              );
              dailyValues[key][date].max = Math.max(
                dailyValues[key][date].max,
                parseFloat(entry[key])
              );
            }
          }
        });
      });

      setDailyMinMax(dailyValues);
    }

    const dailyValues = {};

    filtered.forEach((entry) => {
      const date = new Date(entry.timestamp).toISOString().split("T")[0];

      Object.keys(entry).forEach((key) => {
        if (key !== "timestamp") {
          if (!dailyValues[key]) dailyValues[key] = {};
          if (!dailyValues[key][date]) {
            dailyValues[key][date] = {
              min: parseFloat(entry[key]).toFixed(2),
              max: parseFloat(entry[key]).toFixed(2),
            };
          } else {
            dailyValues[key][date].min = Math.min(
              dailyValues[key][date].min,
              parseFloat(entry[key])
            ).toFixed(2);
            dailyValues[key][date].max = Math.max(
              dailyValues[key][date].max,
              parseFloat(entry[key])
            ).toFixed(2);
          }
        }
      });
    });

    setDailyMinMax(dailyValues);
  }, [data, timeRange]);

  const handleDownloadPDF = async () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const elements = document.querySelectorAll(".sensor-chart, .data-table"); // Captura todas las gráficas y tablas
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
  };

  const minMaxValues = Object.keys(dailyMinMax).reduce((acc, key) => {
    acc[key] = calculateMinMax(filteredData, key);
    return acc;
  }, {});

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
              setSelectedMonth(null); // ✅ Reinicia selección de mes
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

      {selectedMonth && filteredData.length === 0 && (
        <div className="bg-gray-800 text-white border border-gray-800 rounded-md p-4 text-center shadow-md mb-6 mt-6">
          <p className="text-base font-medium">
            No hay datos disponibles para el mes seleccionado.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredData.length > 0 &&
          Object.keys(dailyMinMax).map((key) => {
            const chartData = filteredData.filter(
              (d) => d[key] != null && !isNaN(d[key])
            );

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
                      tickFormatter={(value) => value.toFixed(2)}
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
                  .slice(-30)
                  .map((date) => (
                    <tr key={date}>
                      <td className="border text-center border-gray-300 p-2">
                        {date}
                      </td>
                      <td className="border text-center border-gray-300 p-2">
                        {dailyMinMax[key][date].min} ({unitMap[key]})
                      </td>
                      <td className="border text-center border-gray-300 p-2">
                        {dailyMinMax[key][date].max} ({unitMap[key]})
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
