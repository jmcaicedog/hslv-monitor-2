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
  showPressureAndLight,
  status,
}) {
  const formattedDate = useMemo(
    () => new Date(createdAt).toLocaleString(),
    [createdAt]
  );

  return (
    <div className="bg-white shadow-md p-4 rounded-lg flex flex-col items-center w-full max-w-md mx-auto cursor-pointer hover:bg-gray-100 transition">
      <Link href={`/sensor/${id}`} className="w-full">
        <p className="text-sm font-semibold mb-3 text-center">{title}</p>
        <div className="flex flex-wrap justify-center w-full gap-2 sm:gap-4">
          <div className="flex flex-col items-center">
            <FaTemperatureHigh className="text-red-500 text-xl" />
            <p className="text-sm">{temperature}°C</p>
          </div>
          <div className="flex flex-col items-center">
            <FaTint className="text-blue-500 text-xl" />
            <p className="text-sm">{humidity}%</p>
          </div>
          <div className="flex flex-col items-center">
            <FaBolt className="text-yellow-500 text-xl" />
            <p className="text-sm">{voltage}V</p>
          </div>
          {showPressureAndLight && (
            <>
              <div className="flex flex-col items-center">
                <FaCompressArrowsAlt className="text-green-500 text-xl" />
                <p className="text-sm">{pressure} KPa</p>
              </div>
              <div className="flex flex-col items-center">
                <FaLightbulb className="text-yellow-400 text-xl" />
                <p className="text-sm">{light} lx</p>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-center items-center text-xs text-center text-gray-500 mt-2">
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
