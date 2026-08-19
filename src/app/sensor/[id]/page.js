"use client";
import {
  attendSensorAlarm,
  fetchCurrentUser,
  fetchSensorAlarmState,
  fetchSensorReadings,
} from "@/utils/api";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaTimes,
  FaFileCsv,
  FaFilePdf,
} from "react-icons/fa";
import {
  Cable,
  Droplet,
  Droplets,
  Gauge,
  Sun,
  Thermometer,
  Zap,
} from "lucide-react";
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
  ReferenceLine,
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
  temperatura2: "°C",
  humedad: "%",
  humedad2: "%",
  voltaje: "V",
  presion: "KPa",
  luz: "lx",
};

const metricLabelMap = {
  temperatura: "Temperatura",
  temperatura2: "Temperatura de Sonda",
  humedad: "Humedad",
  humedad2: "Humedad de Sonda",
  voltaje: "Voltaje",
  presion: "Presion",
  luz: "Luz",
};

function getMetricLabel(metricKey) {
  return metricLabelMap[metricKey] || metricKey.charAt(0).toUpperCase() + metricKey.slice(1);
}

function getMetricIcon(metricKey) {
  switch (metricKey) {
    case "temperatura":
      return <Thermometer className="h-5 w-5 text-lime-500" strokeWidth={2.2} aria-hidden="true" />;
    case "humedad":
      return (
        <Droplet
          className="h-5 w-5 text-red-600"
          fill="currentColor"
          strokeWidth={1.8}
          aria-hidden="true"
        />
      );
    case "temperatura2":
      return (
        <span className="relative inline-flex items-center justify-center" aria-hidden="true">
          <Thermometer className="h-5 w-5 text-lime-500" strokeWidth={2.2} />
          <Cable className="absolute -right-2 -bottom-1 h-3 w-3 text-gray-500" strokeWidth={2.2} />
        </span>
      );
    case "humedad2":
      return (
        <span className="relative inline-flex items-center justify-center" aria-hidden="true">
          <Droplets className="h-5 w-5 text-amber-500" strokeWidth={2.1} />
          <Cable className="absolute -right-2 -bottom-1 h-3 w-3 text-amber-500" strokeWidth={2.2} />
        </span>
      );
    case "voltaje":
      return <Zap className="h-5 w-5 text-lime-500" strokeWidth={2.5} aria-hidden="true" />;
    case "luz":
      return <Sun className="h-5 w-5 text-yellow-500" strokeWidth={2.1} aria-hidden="true" />;
    case "presion":
      return <Gauge className="h-5 w-5 text-green-500" strokeWidth={2.2} aria-hidden="true" />;
    default:
      return null;
  }
}

const metricDisplayOrder = [
  "temperatura",
  "humedad",
  "temperatura2",
  "humedad2",
  "voltaje",
  "presion",
  "luz",
];

const allowedMetricKeys = new Set(metricDisplayOrder);

function getOrderedMetricKeys(metricMap = {}) {
  return Object.keys(metricMap).sort((a, b) => {
    const orderA = metricDisplayOrder.indexOf(a);
    const orderB = metricDisplayOrder.indexOf(b);
    const rankA = orderA === -1 ? Number.POSITIVE_INFINITY : orderA;
    const rankB = orderB === -1 ? Number.POSITIVE_INFINITY : orderB;

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    return a.localeCompare(b);
  });
}

function waitForNextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

const CHART_MAX_POINTS = 420;

function downsampleSeries(data, maxPoints = CHART_MAX_POINTS) {
  if (!Array.isArray(data) || data.length <= maxPoints) {
    return data;
  }

  const stride = Math.ceil(data.length / maxPoints);
  const sampled = [];

  for (let i = 0; i < data.length; i += stride) {
    sampled.push(data[i]);
  }

  const last = data[data.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }

  return sampled;
}

function formatTooltipDate(value, granularity = "reading") {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) {
    return String(value ?? "");
  }

  if (granularity === "day") {
    return `Dia: ${new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date)}`;
  }

  if (granularity === "hour") {
    return `Bloque horario: ${new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
    }).format(date)}:00`;
  }

  return `Lectura: ${new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function formatTooltipValue(value, metricKey) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  const unit = unitMap[metricKey] ? ` ${unitMap[metricKey]}` : "";
  return `${numeric.toFixed(2)}${unit}`;
}

function getChartMaxPoints(granularity) {
  switch (granularity) {
    case "day":
      return 120;
    case "hour":
      return 240;
    case "reading":
    default:
      return CHART_MAX_POINTS;
  }
}

function formatChartTick(value, granularity) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (granularity === "day") {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  if (granularity === "hour") {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTimeLocalValue(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-") + `T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function formatHourLocalValue(timestamp) {
  const dateTimeLocal = formatDateTimeLocalValue(timestamp);
  if (!dateTimeLocal) {
    return "";
  }

  return `${dateTimeLocal.slice(0, 13)}:00`;
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function formatReadingLabel(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-") + ` ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function formatHourlyBucketLabel(timestamp) {
  const readingLabel = formatReadingLabel(timestamp);
  if (!readingLabel) {
    return "";
  }

  return `${readingLabel.slice(0, 13)}:00`;
}

function formatDailyBucketLabel(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

function buildMetricRows(data, granularity) {
  const metricBuckets = {};

  data.forEach((entry) => {
    const timestamp = Number(entry.timestamp);
    if (!Number.isFinite(timestamp)) {
      return;
    }

    const bucketLabel = granularity === "day"
      ? formatDailyBucketLabel(timestamp)
      : granularity === "hour"
        ? formatHourlyBucketLabel(timestamp)
        : formatReadingLabel(timestamp);

    if (!bucketLabel) {
      return;
    }

    Object.keys(entry).forEach((key) => {
      if (key === "timestamp") return;
      if (!allowedMetricKeys.has(key)) return;

      const value = Number.parseFloat(entry[key]);
      if (Number.isNaN(value)) return;

      if (!metricBuckets[key]) {
        metricBuckets[key] = {};
      }

      if (!metricBuckets[key][bucketLabel]) {
        metricBuckets[key][bucketLabel] = {
          label: bucketLabel,
          sortKey: timestamp,
          value,
        };
        return;
      }

      metricBuckets[key][bucketLabel].sortKey = Math.min(metricBuckets[key][bucketLabel].sortKey, timestamp);

      // Conserva un valor puntual por bloque: la ultima lectura observada dentro del bucket.
      metricBuckets[key][bucketLabel].value = value;
    });
  });

  return Object.fromEntries(
    Object.entries(metricBuckets).map(([key, buckets]) => [
      key,
      Object.values(buckets).sort((a, b) => a.sortKey - b.sortKey),
    ])
  );
}

function getGranularityLabel(granularity) {
  switch (granularity) {
    case "reading":
      return "Fecha / hora";
    case "day":
      return "Fecha";
    case "hour":
    default:
      return "Fecha / hora";
  }
}

function getMetricThresholdRange(metricKey, threshold) {
  if (!threshold || typeof threshold !== "object") {
    return { min: null, max: null };
  }

  const asFinite = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  switch (metricKey) {
    case "temperatura":
      return { min: asFinite(threshold.tempMin), max: asFinite(threshold.tempMax) };
    case "humedad":
      return { min: asFinite(threshold.humMin), max: asFinite(threshold.humMax) };
    case "voltaje":
      return { min: asFinite(threshold.voltMin), max: null };
    case "presion":
      return {
        min: asFinite(threshold.pressureMin),
        max: asFinite(threshold.pressureMax),
      };
    case "luz":
      return { min: asFinite(threshold.lightMin), max: asFinite(threshold.lightMax) };
    default:
      return { min: null, max: null };
  }
}

function calculateTableSummary(rows) {
  const numericValues = rows
    .map((row) => Number(row?.value))
    .filter((value) => Number.isFinite(value));

  if (numericValues.length === 0) {
    return { min: null, max: null };
  }

  return {
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
  };
}

function resolveAutoGranularity({ timeRange, selectedMonth, startDate, endDate }) {
  if (selectedMonth) {
    return "hour";
  }

  if (startDate && endDate) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const rangeDays = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
      );

      if (rangeDays <= 2) {
        return "reading";
      }

      if (rangeDays <= 45) {
        return "hour";
      }

      return "day";
    }
  }

  if (Number(timeRange) <= 24) {
    return "reading";
  }

  if (Number(timeRange) <= 720) {
    return "hour";
  }

  return "day";
}

function rowMatchesDate(row, dateText) {
  if (!dateText) {
    return false;
  }

  return String(row?.label || "").startsWith(dateText);
}

function normalizeJumpValue(rawValue, granularity) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  if (granularity === "day") {
    return value.slice(0, 10);
  }

  if (granularity === "hour") {
    return `${value.replace("T", " ").slice(0, 13)}:00`;
  }

  return value.replace("T", " ").slice(0, 16);
}

function rowMatchesJumpTarget(row, jumpTarget, granularity) {
  if (!jumpTarget) {
    return false;
  }

  const label = String(row?.label || "");
  return granularity === "reading" ? label === jumpTarget : label.startsWith(jumpTarget);
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function compressCanvasForPdf(canvas, options = {}) {
  const maxWidth = Number(options.maxWidth) || 1400;
  const maxArea = Number(options.maxArea) || 900000;
  const quality = Number(options.quality) || 0.75;
  const widthRatio = Math.min(1, maxWidth / canvas.width);
  const areaRatio = Math.min(1, Math.sqrt(maxArea / (canvas.width * canvas.height)));
  const ratio = Math.min(widthRatio, areaRatio);

  const resized = document.createElement("canvas");
  resized.width = Math.max(1, Math.round(canvas.width * ratio));
  resized.height = Math.max(1, Math.round(canvas.height * ratio));

  const context = resized.getContext("2d");
  if (!context) {
    return {
      dataUrl: canvas.toDataURL("image/jpeg", quality),
      width: canvas.width,
      height: canvas.height,
    };
  }

  // Aplana transparencia sobre blanco antes de comprimir a JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, resized.width, resized.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, resized.width, resized.height);

  return {
    dataUrl: resized.toDataURL("image/jpeg", quality),
    width: resized.width,
    height: resized.height,
  };
}

async function renderElementCanvas(element, scale = 1) {
  return html2canvas(element, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    onclone: (clonedDoc) => {
      clonedDoc.body.style.background = "#ffffff";
      clonedDoc.documentElement.style.background = "#ffffff";

      clonedDoc
        .querySelectorAll(".sensor-chart, .data-table")
        .forEach((node) => {
          node.style.background = "#ffffff";
          node.style.boxShadow = "none";
          node.style.filter = "none";
          node.style.opacity = "1";

          node.querySelectorAll("*").forEach((child) => {
            child.style.boxShadow = "none";
            child.style.filter = "none";
            child.style.textShadow = "none";
          });
        });
    },
  });
}

function addCanvasPaginated(doc, canvas, options = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = options.marginLeft ?? 10;
  const marginRight = options.marginRight ?? 10;
  const marginBottom = options.marginBottom ?? 10;
  const topMargin = options.topMargin ?? 10;
  const onNewPage = typeof options.onNewPage === "function" ? options.onNewPage : null;
  const contentWidth = pageWidth - marginLeft - marginRight;

  let yOffset = options.startY ?? 10;
  let startPx = 0;

  while (startPx < canvas.height) {
    const availableHeightMm = pageHeight - yOffset - marginBottom;

    if (availableHeightMm <= 0) {
      doc.addPage();
      if (onNewPage) {
        onNewPage(doc);
      }
      yOffset = topMargin;
      continue;
    }

    const mmPerPx = contentWidth / canvas.width;
    const sliceHeightPx = Math.max(1, Math.floor(availableHeightMm / mmPerPx));
    const remainingPx = canvas.height - startPx;
    const currentSliceHeightPx = Math.min(remainingPx, sliceHeightPx);

    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = currentSliceHeightPx;

    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) {
      break;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(
      canvas,
      0,
      startPx,
      canvas.width,
      currentSliceHeightPx,
      0,
      0,
      sliceCanvas.width,
      sliceCanvas.height
    );

    const compressed = compressCanvasForPdf(sliceCanvas, {
      maxWidth: 1100,
      maxArea: 850000,
      quality: 0.72,
    });

    const renderHeightMm = (compressed.height * contentWidth) / compressed.width;

    doc.addImage(
      compressed.dataUrl,
      "JPEG",
      marginLeft,
      yOffset,
      contentWidth,
      renderHeightMm,
      undefined,
      "FAST"
    );

    startPx += currentSliceHeightPx;

    if (startPx < canvas.height) {
      doc.addPage();
      if (onNewPage) {
        onNewPage(doc);
      }
      yOffset = topMargin;
    } else {
      yOffset += renderHeightMm + (options.elementGap ?? 6);
    }
  }

  return yOffset;
}

function addCanvasAsBlock(doc, canvas, options = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = options.marginLeft ?? 10;
  const marginRight = options.marginRight ?? 10;
  const marginBottom = options.marginBottom ?? 10;
  const topMargin = options.topMargin ?? 10;
  const onNewPage = typeof options.onNewPage === "function" ? options.onNewPage : null;
  const elementGap = options.elementGap ?? 8;
  const contentWidth = pageWidth - marginLeft - marginRight;

  let yOffset = options.startY ?? 10;

  const compressed = compressCanvasForPdf(canvas, {
    maxWidth: 1100,
    maxArea: 850000,
    quality: 0.72,
  });

  const renderHeightMm = (compressed.height * contentWidth) / compressed.width;
  const maxRenderableBottom = pageHeight - marginBottom;

  if (yOffset + renderHeightMm > maxRenderableBottom) {
    doc.addPage();
    if (onNewPage) {
      onNewPage(doc);
    }
    yOffset = topMargin;
  }

  if (yOffset + renderHeightMm > maxRenderableBottom) {
    return addCanvasPaginated(doc, canvas, {
      ...options,
      startY: yOffset,
    });
  }

  doc.addImage(
    compressed.dataUrl,
    "JPEG",
    marginLeft,
    yOffset,
    contentWidth,
    renderHeightMm,
    undefined,
    "FAST"
  );

  return yOffset + renderHeightMm + elementGap;
}

function drawPdfMetricTable(doc, {
  metricTitle,
  rows,
  summary,
  unit,
  firstColumnLabel = "Fecha / hora",
  startY,
  topMargin,
  marginLeft,
  marginRight,
  marginBottom,
  onNewPage,
}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginLeft - marginRight;
  const colWidths = [contentWidth * 0.6, contentWidth * 0.4];
  const rowHeight = 6;
  const sectionGap = 4;
  const formatSummaryValue = (value) => (
    Number.isFinite(value) ? `${Number(value).toFixed(2)}${unit ? ` ${unit}` : ""}` : "--"
  );

  let y = startY;

  const ensureSpace = (requiredHeight) => {
    if (y + requiredHeight <= pageHeight - marginBottom) {
      return;
    }

    doc.addPage();
    if (typeof onNewPage === "function") {
      onNewPage(doc);
    }
    y = topMargin;
  };

  const drawTableHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(metricTitle, marginLeft + contentWidth / 2, y, { align: "center" });
    y += 4;

    doc.setFontSize(8);
    doc.text(
      `Min: ${formatSummaryValue(summary?.min)}   Max: ${formatSummaryValue(summary?.max)}`,
      marginLeft + contentWidth / 2,
      y,
      { align: "center" }
    );
    y += 4;

    doc.setFillColor(243, 244, 246);
    doc.rect(marginLeft, y, contentWidth, rowHeight, "F");
    doc.rect(marginLeft, y, contentWidth, rowHeight);

    doc.setFontSize(9);
    doc.text(firstColumnLabel, marginLeft + 2, y + 4);
    doc.text("Valor", marginLeft + colWidths[0] + 2, y + 4);

    doc.line(marginLeft + colWidths[0], y, marginLeft + colWidths[0], y + rowHeight);

    y += rowHeight;
    doc.setFont("helvetica", "normal");
  };

  ensureSpace(20);
  drawTableHeader();

  for (const row of rows) {
    ensureSpace(rowHeight + 2);

    if (y === topMargin) {
      drawTableHeader();
    }

    const isMinRow = Number.isFinite(summary?.min) && Number(row.value) === Number(summary.min);
    const isMaxRow = Number.isFinite(summary?.max) && Number(row.value) === Number(summary.max);

    if (isMinRow || isMaxRow) {
      doc.setFillColor(isMinRow ? 254 : 236, isMinRow ? 242 : 253, isMinRow ? 242 : 243);
      doc.rect(marginLeft, y, contentWidth, rowHeight, "F");
    }

    doc.rect(marginLeft, y, contentWidth, rowHeight);
    doc.line(marginLeft + colWidths[0], y, marginLeft + colWidths[0], y + rowHeight);

    doc.setFontSize(8);
    doc.text(String(row.label || row.date || ""), marginLeft + 2, y + 4);
    doc.text(String(row.valueText || ""), marginLeft + colWidths[0] + 2, y + 4);

    y += rowHeight;
  }

  return y + sectionGap;
}

const SensorDetail = () => {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;
  const [filteredData, setFilteredData] = useState([]);
  const [sensorName, setSensorName] = useState("");
  const [currentUserName, setCurrentUserName] = useState("");
  const [timeRange, setTimeRange] = useState(24);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");
  const [availableStartDate, setAvailableStartDate] = useState("");
  const [availableEndDate, setAvailableEndDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [alarmState, setAlarmState] = useState(null);
  const [attendingAlarm, setAttendingAlarm] = useState(false);
  const [alarmFeedback, setAlarmFeedback] = useState("");
  const [tablePageByMetric, setTablePageByMetric] = useState({});
  const [tableGranularityMode, setTableGranularityMode] = useState("auto");
  const [tableRowsPerPage, setTableRowsPerPage] = useState(20);
  const [tableJumpValue, setTableJumpValue] = useState("");
  const [pdfProgress, setPdfProgress] = useState({
    running: false,
    percent: 0,
    message: "",
  });
  const [csvProgress, setCsvProgress] = useState({
    running: false,
    percent: 0,
    message: "",
  });
  const didInitDateBoundsRef = useRef(false);

  useEffect(() => {
    didInitDateBoundsRef.current = false;
    setStartDate("");
    setEndDate("");
    setAppliedStartDate("");
    setAppliedEndDate("");
    setAvailableStartDate("");
    setAvailableEndDate("");
  }, [id]);

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
      const hasCustomRange = Boolean(appliedStartDate) && Boolean(appliedEndDate);

      if (hasCustomRange && appliedStartDate > appliedEndDate) {
        setError("La fecha inicial debe ser menor o igual a la fecha final.");
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const [payload, alarmPayload, me] = await Promise.all([
          fetchSensorReadings(id, {
            startDate: hasCustomRange ? appliedStartDate : undefined,
            endDate: hasCustomRange ? appliedEndDate : undefined,
            month: hasCustomRange ? undefined : selectedMonth,
            hours: hasCustomRange || selectedMonth ? undefined : timeRange,
          }),
          fetchSensorAlarmState(id).catch(() => ({ alarm: null })),
          fetchCurrentUser().catch(() => null),
        ]);

        setSensorName(payload.sensorName || id);
        setAlarmState(alarmPayload?.alarm || null);
        setCurrentUserName(me?.user?.name || me?.user?.email || "");

        const firstDate = payload.firstObservedAt
          ? new Date(payload.firstObservedAt).toISOString().slice(0, 10)
          : "";
        const lastDate = payload.lastObservedAt
          ? new Date(payload.lastObservedAt).toISOString().slice(0, 10)
          : "";

        setAvailableStartDate(firstDate);
        setAvailableEndDate(lastDate);

        if (!didInitDateBoundsRef.current) {
          if (firstDate) {
            setStartDate(firstDate);
          }

          if (lastDate) {
            setEndDate(lastDate);
          }

          didInitDateBoundsRef.current = true;
        }

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
  }, [id, timeRange, selectedMonth, appliedStartDate, appliedEndDate]);

  function handleApplyDateRange() {
    if (!startDate || !endDate) {
      setError("Debes seleccionar fecha inicial y final.");
      return;
    }

    if (startDate > endDate) {
      setError("La fecha inicial debe ser menor o igual a la fecha final.");
      return;
    }

    setSelectedMonth(null);
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setError("");
  }

  async function handleAttendAlarm() {
    if (!id) return;

    try {
      setAttendingAlarm(true);
      setAlarmFeedback("");
      const response = await attendSensorAlarm(id);
      setAlarmState(response.alarm || null);
      setAlarmFeedback("Alarma atendida y notificacion enviada correctamente.");
    } catch (err) {
      setAlarmFeedback(
        err instanceof Error ? err.message : "No se pudo atender la alarma."
      );
    } finally {
      setAttendingAlarm(false);
    }
  }

  const effectiveTableGranularity = useMemo(() => {
    if (tableGranularityMode !== "auto") {
      return tableGranularityMode;
    }

    return resolveAutoGranularity({
      timeRange,
      selectedMonth,
      startDate: appliedStartDate,
      endDate: appliedEndDate,
    });
  }, [tableGranularityMode, timeRange, selectedMonth, appliedStartDate, appliedEndDate]);

  const tableRowsByMetric = useMemo(
    () => buildMetricRows(filteredData, effectiveTableGranularity),
    [filteredData, effectiveTableGranularity]
  );

  const tableSummaryByMetric = useMemo(
    () => Object.fromEntries(
      Object.entries(tableRowsByMetric).map(([key, rows]) => [key, calculateTableSummary(rows)])
    ),
    [tableRowsByMetric]
  );

  const normalizedJumpTarget = useMemo(
    () => normalizeJumpValue(tableJumpValue, effectiveTableGranularity),
    [tableJumpValue, effectiveTableGranularity]
  );

  const jumpInputType = effectiveTableGranularity === "day" ? "date" : "datetime-local";
  const jumpInputStep = effectiveTableGranularity === "reading" ? 60 : 3600;

  const latestJumpValue = useMemo(() => {
    if (filteredData.length === 0) {
      return "";
    }

    const latestTimestamp = filteredData[filteredData.length - 1]?.timestamp;

    if (effectiveTableGranularity === "day") {
      return formatDailyBucketLabel(latestTimestamp);
    }

    if (effectiveTableGranularity === "hour") {
      return formatHourLocalValue(latestTimestamp);
    }

    return formatDateTimeLocalValue(latestTimestamp);
  }, [filteredData, effectiveTableGranularity]);

  const jumpInputMin = useMemo(() => {
    if (filteredData.length === 0) {
      return undefined;
    }

    return effectiveTableGranularity === "day"
      ? formatDailyBucketLabel(filteredData[0]?.timestamp)
      : formatDateTimeLocalValue(filteredData[0]?.timestamp);
  }, [filteredData, effectiveTableGranularity]);

  const jumpInputMax = useMemo(() => {
    if (filteredData.length === 0) {
      return undefined;
    }

    return effectiveTableGranularity === "day"
      ? formatDailyBucketLabel(filteredData[filteredData.length - 1]?.timestamp)
      : formatDateTimeLocalValue(filteredData[filteredData.length - 1]?.timestamp);
  }, [filteredData, effectiveTableGranularity]);

  const minMaxValues = useMemo(() => {
    return Object.keys(tableRowsByMetric).reduce((acc, key) => {
      acc[key] = calculateMinMax(filteredData, key);
      return acc;
    }, {});
  }, [tableRowsByMetric, filteredData]);

  const orderedMetricKeys = useMemo(() => getOrderedMetricKeys(tableRowsByMetric), [tableRowsByMetric]);

  const chartSeriesByMetric = useMemo(() => {
    const byMetric = {};
    const chartMaxPoints = getChartMaxPoints(effectiveTableGranularity);

    orderedMetricKeys.forEach((key) => {
      const rawSeries = filteredData.filter(
        (d) => d[key] != null && !Number.isNaN(parseFloat(d[key]))
      );
      byMetric[key] = downsampleSeries(rawSeries, chartMaxPoints);
    });

    return byMetric;
  }, [filteredData, orderedMetricKeys, effectiveTableGranularity]);

  useEffect(() => {
    setTablePageByMetric({});
  }, [tableRowsByMetric, effectiveTableGranularity, tableRowsPerPage]);

  useEffect(() => {
    if (!normalizedJumpTarget) {
      return;
    }

    setTablePageByMetric((prev) => {
      let changed = false;
      const next = { ...prev };

      Object.entries(tableRowsByMetric).forEach(([key, rows]) => {
        const matchIndex = rows.findIndex((row) =>
          rowMatchesJumpTarget(row, normalizedJumpTarget, effectiveTableGranularity)
        );
        if (matchIndex === -1) {
          return;
        }

        const targetPage = Math.floor(matchIndex / tableRowsPerPage) + 1;
        if (next[key] !== targetPage) {
          next[key] = targetPage;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [normalizedJumpTarget, tableRowsByMetric, tableRowsPerPage, effectiveTableGranularity]);

  const reportRangeLabel = useMemo(() => {
    if (appliedStartDate && appliedEndDate) {
      return `Rango: ${appliedStartDate} a ${appliedEndDate}`;
    }

    if (selectedMonth) {
      const [yearStr, monthStr] = String(selectedMonth).split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);

      if (Number.isFinite(year) && Number.isFinite(month)) {
        const date = new Date(year, month - 1, 1);
        return `Mes: ${date.toLocaleDateString("es-ES", {
          month: "long",
          year: "numeric",
        })}`;
      }

      return `Mes: ${selectedMonth}`;
    }

    const rangeMap = {
      24: "Ultimas 24 horas",
      72: "Ultimos 3 dias",
      168: "Ultima semana",
      720: "Ultimo mes",
    };

    return `Periodo: ${rangeMap[timeRange] || `Ultimas ${timeRange} horas`}`;
  }, [selectedMonth, timeRange, appliedStartDate, appliedEndDate]);

  const activeAlarmLabels = useMemo(() => {
    if (!alarmState?.hasActiveAlarm || !Array.isArray(alarmState?.activeMetrics)) {
      return [];
    }

    const labels = alarmState.activeMetrics
      .map((metric) => {
        if (typeof metric?.metricLabel === "string" && metric.metricLabel.trim()) {
          return metric.metricLabel.trim();
        }

        if (typeof metric?.metricKey === "string" && metric.metricKey.trim()) {
          return metric.metricKey.trim();
        }

        return null;
      })
      .filter(Boolean);

    return Array.from(new Set(labels));
  }, [alarmState]);

  async function handleDownloadPDF() {
    if (pdfProgress.running) {
      return;
    }

    setPdfProgress({
      running: true,
      percent: 3,
      message: "Preparando exportacion PDF...",
    });
    await waitForNextFrame();

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const generatedAt = new Date().toLocaleString("es-ES");
      const sensorTitle = sensorName || String(id || "Sensor");
      const generatedBy = currentUserName || "Usuario no disponible";

      const drawReportHeader = (instance) => {
      instance.setTextColor(20, 20, 20);
      instance.setFont("helvetica", "bold");
      instance.setFontSize(16);
      instance.text(sensorTitle, 10, 14);

      instance.setFont("helvetica", "normal");
      instance.setFontSize(10);
      instance.text(reportRangeLabel, 10, 20);
      instance.text(`Usuario: ${generatedBy}`, 10, 25);
      instance.text(`Generado: ${generatedAt}`, 10, 30);

      instance.setDrawColor(200, 200, 200);
      instance.line(10, 33, 200, 33);
    };

      drawReportHeader(doc);

      const chartElements = document.querySelectorAll(".sensor-chart");
      let yOffset = 37;

      const captureScale = 1;

      const metricKeys = orderedMetricKeys;
      const totalSteps = Math.max(1, chartElements.length + metricKeys.length + 1);
      let completedSteps = 0;

      for (const element of chartElements) {
      setPdfProgress((prev) => ({
        ...prev,
        message: `Renderizando grafica ${completedSteps + 1}/${chartElements.length}...`,
      }));
      await waitForNextFrame();

        const canvas = await renderElementCanvas(element, captureScale);
        yOffset = addCanvasAsBlock(doc, canvas, {
        startY: yOffset,
        topMargin: 32,
        marginLeft: 10,
        marginRight: 10,
        marginBottom: 10,
        elementGap: 8,
        onNewPage: drawReportHeader,
      });

        completedSteps += 1;
        setPdfProgress((prev) => ({
        ...prev,
        percent: Math.min(95, Math.round((completedSteps / totalSteps) * 100)),
      }));
      }

      for (const key of metricKeys) {
      setPdfProgress((prev) => ({
        ...prev,
        message: `Renderizando tabla de ${key}...`,
      }));
      await waitForNextFrame();

        const rows = tableRowsByMetric[key] || [];
        const summary = tableSummaryByMetric[key] || { min: null, max: null };

        const metricTitle = `${getMetricLabel(key)} (${unitMap[key] || ""})`;

        yOffset = drawPdfMetricTable(doc, {
          metricTitle,
          rows: rows.map((row) => ({
            ...row,
            valueText: Number.isFinite(row.value) ? `${row.value.toFixed(2)} (${unitMap[key] || ""})` : "",
          })),
          summary,
          unit: unitMap[key] || "",
          firstColumnLabel: getGranularityLabel(effectiveTableGranularity),
          startY: yOffset,
          topMargin: 37,
          marginLeft: 10,
          marginRight: 10,
          marginBottom: 10,
          onNewPage: drawReportHeader,
        });

        completedSteps += 1;
        setPdfProgress((prev) => ({
        ...prev,
        percent: Math.min(95, Math.round((completedSteps / totalSteps) * 100)),
      }));
      }

      setPdfProgress((prev) => ({
        ...prev,
        percent: 98,
        message: "Finalizando archivo...",
      }));
      await waitForNextFrame();

      const pdfBlob = doc.output("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = `sensor_${id}.pdf`;
      link.click();
      URL.revokeObjectURL(pdfUrl);

      const sizeMb = (pdfBlob.size / (1024 * 1024)).toFixed(2);
      console.info(`PDF generado: ${sizeMb} MB`);

      setPdfProgress({
        running: false,
        percent: 100,
        message: "PDF generado correctamente.",
      });

      setTimeout(() => {
        setPdfProgress((prev) => (prev.running ? prev : { running: false, percent: 0, message: "" }));
      }, 1200);
    } catch (err) {
      console.error("Error exportando PDF:", err);
      setError("No se pudo generar el PDF. Intenta con un rango mas corto o vuelve a intentar.");
      setPdfProgress({ running: false, percent: 0, message: "" });
    }
  }

  async function handleDownloadCSV() {
    if (csvProgress.running) {
      return;
    }

    setCsvProgress({
      running: true,
      percent: 3,
      message: "Preparando exportacion CSV...",
    });
    await waitForNextFrame();

    const generatedAt = new Date().toLocaleString("es-ES");
    const sensorTitle = sensorName || String(id || "Sensor");
    const generatedBy = currentUserName || "Usuario no disponible";

    const lines = [];
    lines.push(`Sensor;${escapeCsvCell(sensorTitle)}`);
    lines.push(`Usuario;${escapeCsvCell(generatedBy)}`);
    lines.push(`Rango;${escapeCsvCell(reportRangeLabel)}`);
    lines.push(`Generado;${escapeCsvCell(generatedAt)}`);
    lines.push("");

    const metricKeys = orderedMetricKeys;
    const totalSteps = Math.max(1, metricKeys.length + 1);
    let completedSteps = 0;

    for (const key of metricKeys) {
      setCsvProgress((prev) => ({
        ...prev,
        message: `Procesando ${key}...`,
        percent: Math.min(95, Math.round((completedSteps / totalSteps) * 100)),
      }));
      await waitForNextFrame();

      const unit = unitMap[key] || "";
      const rows = tableRowsByMetric[key] || [];

      if (rows.length === 0) {
        completedSteps += 1;
        continue;
      }

      const metricName = `${key.charAt(0).toUpperCase() + key.slice(1)}${unit ? ` (${unit})` : ""}`;
      const summary = tableSummaryByMetric[key] || { min: null, max: null };
      lines.push(`Variable;${escapeCsvCell(metricName)}`);
      lines.push(`Minimo global;${escapeCsvCell(Number.isFinite(summary.min) ? summary.min.toFixed(2) : "")}`);
      lines.push(`Maximo global;${escapeCsvCell(Number.isFinite(summary.max) ? summary.max.toFixed(2) : "")}`);
      lines.push(`${escapeCsvCell(getGranularityLabel(effectiveTableGranularity))};Valor`);

      rows.forEach((row) => {
        const value = Number(row?.value);
        lines.push(
          [
            escapeCsvCell(row.label || ""),
            escapeCsvCell(Number.isFinite(value) ? value.toFixed(2) : ""),
          ].join(";")
        );
      });

      lines.push("");

      completedSteps += 1;
    }

    setCsvProgress((prev) => ({
      ...prev,
      percent: 98,
      message: "Finalizando archivo CSV...",
    }));
    await waitForNextFrame();

    const csvContent = `\uFEFF${lines.join("\n")}`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sensor_${id}_tablas.csv`;
    link.click();
    URL.revokeObjectURL(url);

    setCsvProgress({
      running: false,
      percent: 100,
      message: "CSV generado correctamente.",
    });

    setTimeout(() => {
      setCsvProgress((prev) => (prev.running ? prev : { running: false, percent: 0, message: "" }));
    }, 1200);
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">{sensorName || id}</h1>
          <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700">
            Usuario: {currentUserName || "No disponible"}
          </span>
        </div>
        <div className="flex gap-4">
          <button
            className="p-2 bg-gray-200 rounded-full hover:bg-gray-300"
            onClick={() => router.push("/")}
          >
            {" "}
            <FaTimes size={20} />{" "}
          </button>
          <button
            className="p-2 bg-red-600 text-white rounded-full hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300"
            onClick={handleDownloadPDF}
            disabled={pdfProgress.running}
            title="Exportar reporte PDF"
          >
            {" "}
            <FaFilePdf size={20} />{" "}
          </button>
          <button
            className="p-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-500"
            onClick={handleDownloadCSV}
            disabled={csvProgress.running}
            title="Exportar tablas en CSV"
          >
            {" "}
            <FaFileCsv size={20} />{" "}
          </button>
        </div>
      </div>

      {pdfProgress.running || pdfProgress.message ? (
        <div className="mb-4 rounded-md border border-gray-300 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{pdfProgress.message || "Procesando PDF..."}</span>
            <span>{pdfProgress.percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
            <div
              className="h-full bg-red-600 transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, pdfProgress.percent))}%` }}
            />
          </div>
        </div>
      ) : null}

      {csvProgress.running || csvProgress.message ? (
        <div className="mb-4 rounded-md border border-gray-300 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{csvProgress.message || "Procesando CSV..."}</span>
            <span>{csvProgress.percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, csvProgress.percent))}%` }}
            />
          </div>
        </div>
      ) : null}

      {alarmState?.hasActiveAlarm ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-4 text-red-800">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide">Alarma activa</p>
              <p className="text-sm">
                Este sensor esta en estado de alarma. Para desctivarla presiona el botón.
              </p>
              {activeAlarmLabels.length > 0 ? (
                <>
                  <p className="mt-2 text-sm font-medium">
                    Estas alarmas se marcaran como &quot;Atendidas&quot;:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeAlarmLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-red-200 bg-white px-2 py-0.5 text-xs font-semibold text-red-700"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleAttendAlarm}
              disabled={attendingAlarm}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300"
            >
              {attendingAlarm
                ? "Atendiendo..."
                : activeAlarmLabels.length > 1
                  ? `Desactivar ${activeAlarmLabels.length} alarmas`
                  : "Desactivar alarma"}
            </button>
          </div>
        </div>
      ) : null}

      {alarmFeedback ? (
        <div className="mb-4 rounded-md border border-gray-300 bg-white p-3 text-sm text-gray-700">
          {alarmFeedback}
        </div>
      ) : null}

      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        <div>
          <label className="mr-2">Selecciona el periodo:</label>
          <select
            value={timeRange}
            onChange={(e) => {
              setTimeRange(Number(e.target.value));
              setSelectedMonth(null);
              setStartDate("");
              setEndDate("");
              setAppliedStartDate("");
              setAppliedEndDate("");
            }}
            className="border p-1 rounded"
          >
            <option value={24}>Últimas 24 horas</option>
            <option value={72}>Últimos 3 días</option>
            <option value={168}>Última semana</option>
            <option value={720}>Último mes</option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="mr-1">Rango:</label>
          <input
            type="date"
            value={startDate}
            min={availableStartDate || undefined}
            max={endDate || availableEndDate || undefined}
            onChange={(e) => {
              setStartDate(e.target.value);
            }}
            className="border p-1 rounded"
          />
          <span>a</span>
          <input
            type="date"
            value={endDate}
            min={startDate || availableStartDate || undefined}
            max={availableEndDate || undefined}
            onChange={(e) => {
              setEndDate(e.target.value);
            }}
            className="border p-1 rounded"
          />
          <button
            type="button"
            onClick={handleApplyDateRange}
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-500"
            title="Aplicar rango de fechas"
          >
            Aplicar
          </button>
        </div>

        <div>
          <label className="mr-2">Selecciona el mes:</label>
          <select
            value={selectedMonth || ""}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setStartDate("");
              setEndDate("");
              setAppliedStartDate("");
              setAppliedEndDate("");
            }}
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

        <div className="flex items-center gap-2 flex-wrap">
          <label className="mr-1">Tabla:</label>
          <select
            value={tableGranularityMode}
            onChange={(e) => setTableGranularityMode(e.target.value)}
            className="border p-1 rounded"
          >
            <option value="auto">Automatico</option>
            <option value="reading">Lecturas exactas</option>
            <option value="hour">Agrupado por hora</option>
            <option value="day">Agrupado por dia</option>
          </select>
          <select
            value={tableRowsPerPage}
            onChange={(e) => setTableRowsPerPage(Number(e.target.value) || 20)}
            className="border p-1 rounded"
          >
            <option value={20}>20 filas</option>
            <option value={50}>50 filas</option>
            <option value={100}>100 filas</option>
          </select>
          <input
            type={jumpInputType}
            value={tableJumpValue}
            min={jumpInputMin}
            max={jumpInputMax}
            step={jumpInputStep}
            onChange={(e) => setTableJumpValue(e.target.value)}
            className="border p-1 rounded"
            title="Ir a una fecha u hora dentro de las tablas"
          />
          <button
            type="button"
            onClick={() => setTableJumpValue(latestJumpValue)}
            disabled={!latestJumpValue}
            className="rounded border border-blue-300 px-3 py-1 text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ultima lectura
          </button>
          <button
            type="button"
            onClick={() => setTableJumpValue("")}
            className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50"
          >
            Limpiar salto
          </button>
          <span className="text-xs text-gray-500">
            {tableGranularityMode === "auto"
              ? `Granularidad actual: ${getGranularityLabel(effectiveTableGranularity)}`
              : ""}
          </span>
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
          orderedMetricKeys.map((key) => {
            const chartData = chartSeriesByMetric[key] || [];

            if (chartData.length === 0 || minMaxValues[key].min == null) {
              return null;
            }

            return (
              <div
                key={key}
                className="sensor-chart bg-white shadow-md rounded-lg p-4 border border-gray-300"
              >
                <h2 className="text-lg text-center font-semibold flex items-center justify-center gap-2">
                  {getMetricIcon(key)}
                  <span>{getMetricLabel(key)} ({unitMap[key]})</span>
                </h2>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData}>
                    <XAxis
                      dataKey="timestamp"
                      interval="preserveStartEnd"
                      minTickGap={effectiveTableGranularity === "reading" ? 28 : 20}
                      tickFormatter={(time) => formatChartTick(time, effectiveTableGranularity)}
                    />

                    <YAxis
                      domain={[
                        minMaxValues[key].min * 0.95,
                        minMaxValues[key].max * 1.05,
                      ]}
                      tickFormatter={(value) => Number(value).toFixed(2)}
                    />

                    <Tooltip
                      labelFormatter={(label) => formatTooltipDate(label, effectiveTableGranularity)}
                      formatter={(value, name) => [formatTooltipValue(value, name), name]}
                    />
                    <CartesianGrid strokeDasharray="3 3" />

                    {(() => {
                      const threshold = getMetricThresholdRange(key, alarmState?.threshold);

                      return (
                        <>
                          {Number.isFinite(threshold.min) ? (
                            <ReferenceLine
                              y={threshold.min}
                              stroke="#dc2626"
                              strokeDasharray="6 4"
                              strokeWidth={1.5}
                              ifOverflow="extendDomain"
                              label={{
                                value: `Min conf: ${threshold.min.toFixed(2)} ${unitMap[key] || ""}`,
                                position: "insideTopLeft",
                                fill: "#b91c1c",
                                fontSize: 11,
                              }}
                            />
                          ) : null}

                          {Number.isFinite(threshold.max) ? (
                            <ReferenceLine
                              y={threshold.max}
                              stroke="#15803d"
                              strokeDasharray="6 4"
                              strokeWidth={1.5}
                              ifOverflow="extendDomain"
                              label={{
                                value: `Max conf: ${threshold.max.toFixed(2)} ${unitMap[key] || ""}`,
                                position: "insideTopRight",
                                fill: "#166534",
                                fontSize: 11,
                              }}
                            />
                          ) : null}
                        </>
                      );
                    })()}

                    <Line
                      type="monotone"
                      dataKey={key}
                      stroke="#8884d8"
                      strokeWidth={effectiveTableGranularity === "day" ? 2.5 : 2}
                      dot={effectiveTableGranularity === "reading" && chartData.length <= 120}
                      isAnimationActive={false}
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
                      isAnimationActive={false}
                      label={{
                        value: `${Number(minMaxValues[key].min).toFixed(2)}`,
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
                      isAnimationActive={false}
                      label={{
                        value: `${Number(minMaxValues[key].max).toFixed(2)}`,
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
        {orderedMetricKeys.map((key) => {
          const rows = tableRowsByMetric[key] || [];
          const summary = tableSummaryByMetric[key] || { min: null, max: null };
          const totalPages = Math.max(1, Math.ceil(rows.length / tableRowsPerPage));
          const currentPage = Math.min(
            totalPages,
            Math.max(1, Number(tablePageByMetric[key] || 1))
          );
          const startIndex = (currentPage - 1) * tableRowsPerPage;
          const visibleRows = rows.slice(startIndex, startIndex + tableRowsPerPage);
          const firstColumnLabel = getGranularityLabel(effectiveTableGranularity);
          const hasDateMatch = normalizedJumpTarget
            ? rows.some((row) => rowMatchesJumpTarget(row, normalizedJumpTarget, effectiveTableGranularity))
            : false;

          return (
            <div
              key={key}
              className="bg-white shadow-md rounded-lg p-4 border border-gray-300 data-table"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <h2 className="text-lg text-center font-semibold flex items-center justify-center gap-2 md:text-left">
                  {getMetricIcon(key)}
                  <span>{getMetricLabel(key)} ({unitMap[key]})</span>
                </h2>
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold md:justify-end">
                  <span className="rounded-full bg-red-50 px-3 py-1 text-red-700 border border-red-200">
                    Min: {Number.isFinite(summary.min) ? summary.min.toFixed(2) : "--"} ({unitMap[key]})
                  </span>
                  <span className="rounded-full bg-green-50 px-3 py-1 text-green-700 border border-green-200">
                    Max: {Number.isFinite(summary.max) ? summary.max.toFixed(2) : "--"} ({unitMap[key]})
                  </span>
                </div>
              </div>
              <table className="w-full mt-4 border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 p-2">{firstColumnLabel}</th>
                    <th className="border border-gray-300 p-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const isMinRow = Number.isFinite(summary.min) && Number(row.value) === Number(summary.min);
                    const isMaxRow = Number.isFinite(summary.max) && Number(row.value) === Number(summary.max);

                    return (
                    <tr
                      key={row.label}
                      className={[
                        rowMatchesJumpTarget(row, normalizedJumpTarget, effectiveTableGranularity) ? "bg-amber-50" : "",
                        isMinRow ? "bg-red-50" : "",
                        isMaxRow ? "bg-green-50" : "",
                      ].filter(Boolean).join(" ") || undefined}
                    >
                      <td className="border text-center border-gray-300 p-2">{row.label}</td>
                      <td className={`border text-center border-gray-300 p-2 font-medium ${isMinRow ? "text-red-700" : isMaxRow ? "text-green-700" : ""}`}>
                        {row.value.toFixed(2)} ({unitMap[key]})
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-3 flex items-center justify-between gap-2 text-sm text-gray-600">
                <span>
                  Mostrando {rows.length === 0 ? 0 : startIndex + 1}-{Math.min(rows.length, startIndex + visibleRows.length)} de {rows.length} filas
                </span>
                <span>
                  Pagina {currentPage} de {totalPages}
                </span>
              </div>

              {normalizedJumpTarget ? (
                <div className="mt-2 text-xs text-gray-500">
                  {hasDateMatch
                    ? `Salto aplicado para ${normalizedJumpTarget}.`
                    : `No hay filas para ${normalizedJumpTarget} en esta variable.`}
                </div>
              ) : null}

              {rows.length > tableRowsPerPage ? (
                <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() =>
                      setTablePageByMetric((prev) => ({
                        ...prev,
                        [key]: Math.max(1, currentPage - 1),
                      }))
                    }
                    disabled={currentPage <= 1}
                    className="rounded border border-gray-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTablePageByMetric((prev) => ({
                        ...prev,
                        [key]: Math.min(totalPages, currentPage + 1),
                      }))
                    }
                    disabled={currentPage >= totalPages}
                    className="rounded border border-gray-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SensorDetail;
