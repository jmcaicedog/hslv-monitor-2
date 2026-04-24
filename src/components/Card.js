import {
  FaTemperatureHigh,
  FaTint,
  FaBolt,
  FaCompressArrowsAlt,
  FaLightbulb,
  FaCircle,
  FaExclamationTriangle,
  FaPowerOff,
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
  activeAlarmMetrics,
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

  const alarmIcons = useMemo(() => {
    if (!hasActiveAlarm || !Array.isArray(activeAlarmMetrics)) {
      return [];
    }

    const iconMap = {
      temperature: {
        key: "temperature",
        label: "Temperatura en alarma",
        icon: <FaTemperatureHigh className="text-red-600 text-sm" />,
      },
      humidity: {
        key: "humidity",
        label: "Humedad en alarma",
        icon: <FaTint className="text-red-600 text-sm" />,
      },
      voltage: {
        key: "voltage",
        label: "Voltaje en alarma",
        icon: <FaBolt className="text-red-600 text-sm" />,
      },
      pressure: {
        key: "pressure",
        label: "Presion en alarma",
        icon: <FaCompressArrowsAlt className="text-red-600 text-sm" />,
      },
      light: {
        key: "light",
        label: "Luz en alarma",
        icon: <FaLightbulb className="text-red-600 text-sm" />,
      },
      inactive: {
        key: "inactive",
        label: "Sensor inactivo",
        icon: <FaPowerOff className="text-red-600 text-sm" />,
      },
    };

    const uniqueKeys = Array.from(
      new Set(activeAlarmMetrics.map((item) => item?.metricKey).filter(Boolean))
    );

    const resolved = uniqueKeys
      .map((metricKey) => iconMap[metricKey])
      .filter(Boolean);

    if (resolved.length > 0) {
      return resolved;
    }

    return [
      {
        key: "generic",
        label: "Alarma activa",
        icon: <FaExclamationTriangle className="text-red-600 text-sm" />,
      },
    ];
  }, [activeAlarmMetrics, hasActiveAlarm]);

  return (
    <div
      className={`relative shadow-md p-4 rounded-lg flex flex-col items-center w-full max-w-md mx-auto cursor-pointer transition ${
        hasActiveAlarm
          ? "bg-red-100 border border-red-300 hover:bg-red-200"
          : "bg-white hover:bg-gray-100"
      }`}
    >
      {hasActiveAlarm && alarmIcons.length > 0 ? (
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/90 border border-red-200 px-2 py-1">
          {alarmIcons.map((item) => (
            <span key={item.key} title={item.label} aria-label={item.label}>
              {item.icon}
            </span>
          ))}
        </div>
      ) : null}
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
          className={`mt-2 text-xs text-center ${
            hasActiveAlarm ? "text-red-700" : "text-gray-500"
          }`}
        >
          <p className="flex items-center justify-center gap-1">
            <strong>ESTADO:</strong>
            <FaCircle
              className={
                status == 0
                  ? "text-red-400 text-xl"
                  : "text-green-400 text-xl"
              }
            />
          </p>
          <p className="mt-1">
            <strong>ACTUALIZACIÓN:</strong> {formattedDate}
          </p>
        </div>
      </Link>
    </div>
  );
}
