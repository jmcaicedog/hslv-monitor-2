import {
  FaTemperatureHigh,
  FaTint,
  FaBolt,
  FaCompressArrowsAlt,
  FaLightbulb,
  FaCircle,
} from "react-icons/fa";
import Link from "next/link";
import { useMemo } from "react";

export default function Card({
  id,
  title,
  temperature,
  humidity,
  voltage,
  pressure,
  light,
  createdAt,
  status,
  hasActiveAlarm,
}) {
  const formattedDate = useMemo(() => {
    const parsed = new Date(createdAt);
    return Number.isNaN(parsed.getTime()) ? "Sin lecturas" : parsed.toLocaleString();
  }, [createdAt]);

  const metrics = useMemo(() => {
    const allMetrics = [
      {
        key: "temperature",
        icon: <FaTemperatureHigh className="text-red-500 text-xl" />,
        value: temperature,
        unit: "°C",
      },
      {
        key: "humidity",
        icon: <FaTint className="text-blue-500 text-xl" />,
        value: humidity,
        unit: "%",
      },
      {
        key: "voltage",
        icon: <FaBolt className="text-yellow-500 text-xl" />,
        value: voltage,
        unit: "V",
      },
      {
        key: "pressure",
        icon: <FaCompressArrowsAlt className="text-green-500 text-xl" />,
        value: pressure,
        unit: "KPa",
      },
      {
        key: "light",
        icon: <FaLightbulb className="text-yellow-400 text-xl" />,
        value: light,
        unit: "lx",
      },
    ];

    return allMetrics.filter(
      (metric) => Number.isFinite(metric.value) && metric.value !== 0
    );
  }, [humidity, light, pressure, temperature, voltage]);

  return (
    <div
      className={`relative shadow-md p-4 rounded-lg flex flex-col items-center w-full max-w-md mx-auto cursor-pointer transition ${
        hasActiveAlarm
          ? "bg-red-100 border border-red-300 hover:bg-red-200"
          : "bg-white hover:bg-gray-100"
      }`}
    >
      {hasActiveAlarm ? (
        <span className="absolute right-3 top-3 rounded-full bg-red-600 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
          Alarma
        </span>
      ) : null}
      <Link href={`/sensor/${id}`} className="w-full">
        <p className="text-sm font-semibold mb-3 text-center">{title}</p>
        <div className="flex flex-wrap justify-center w-full gap-2 sm:gap-4">
          {metrics.length > 0 ? (
            metrics.map((metric) => (
              <div key={metric.key} className="flex flex-col items-center">
                {metric.icon}
                <p className="text-sm">{metric.value.toFixed(2)} {metric.unit}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">Sin variables con datos</p>
          )}
        </div>
        <div
          className={`flex justify-center items-center text-xs text-center mt-2 ${
            hasActiveAlarm ? "text-red-700" : "text-gray-500"
          }`}
        >
          <strong>ACTUALIZACIÓN: </strong> {formattedDate}{" "}
          <strong> ESTADO:</strong>{" "}
          <FaCircle
            className={
              status == 0
                ? "text-red-400 text-xl pl-[5px]"
                : "text-green-400 text-xl pl-[5px]"
            }
          />
        </div>
      </Link>
    </div>
  );
}
