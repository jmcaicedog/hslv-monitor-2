import jsPDF from "jspdf";

const MARGIN_LEFT = 10;
const MARGIN_RIGHT = 10;
const MARGIN_BOTTOM = 12;
const HEADER_HEIGHT = 26;
const LINE_HEIGHT = 4;
const CELL_PADDING = 1.5;

function splitCell(doc, text, width) {
  return doc.splitTextToSize(String(text ?? "--"), Math.max(4, width - CELL_PADDING * 2));
}

export function exportLogsToPdf({
  title,
  columns,
  rows,
  rangeLabel,
  generatedBy,
  fileName = "logs.pdf",
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
  const totalWeight = columns.reduce((acc, col) => acc + (col.width || 1), 0);
  const colWidths = columns.map((col) => ((col.width || 1) / totalWeight) * contentWidth);
  const generatedAt = new Date().toLocaleString("es-ES");

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(title, MARGIN_LEFT, 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(rangeLabel || "Rango: todos los registros", MARGIN_LEFT, 17);
    doc.text(
      `Generado por: ${generatedBy || "Usuario no disponible"}   |   Fecha de generacion: ${generatedAt}`,
      MARGIN_LEFT,
      21
    );

    doc.setDrawColor(200, 200, 200);
    doc.line(MARGIN_LEFT, 23, pageWidth - MARGIN_RIGHT, 23);
  };

  let y = HEADER_HEIGHT;
  drawHeader();

  const drawTableHeader = () => {
    const headerHeight = LINE_HEIGHT + CELL_PADDING * 2;

    doc.setFillColor(243, 244, 246);
    doc.setDrawColor(180, 180, 180);
    doc.rect(MARGIN_LEFT, y, contentWidth, headerHeight, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);

    let x = MARGIN_LEFT;
    columns.forEach((col, index) => {
      doc.text(col.header, x + CELL_PADDING, y + LINE_HEIGHT);
      if (index > 0) {
        doc.line(x, y, x, y + headerHeight);
      }
      x += colWidths[index];
    });

    y += headerHeight;
    doc.setFont("helvetica", "normal");
  };

  drawTableHeader();

  if (!rows.length) {
    doc.setFontSize(9);
    doc.text("No hay registros en el rango seleccionado.", MARGIN_LEFT + 2, y + 6);
  }

  for (const row of rows) {
    const cells = columns.map((col, index) => splitCell(doc, row[col.key], colWidths[index]));
    const maxLines = cells.reduce((acc, lines) => Math.max(acc, lines.length), 1);
    const rowHeight = maxLines * LINE_HEIGHT + CELL_PADDING * 2;

    if (y + rowHeight > pageHeight - MARGIN_BOTTOM) {
      doc.addPage();
      y = HEADER_HEIGHT;
      drawHeader();
      drawTableHeader();
    }

    doc.setDrawColor(220, 220, 220);
    doc.rect(MARGIN_LEFT, y, contentWidth, rowHeight);

    doc.setFontSize(8);
    let x = MARGIN_LEFT;
    cells.forEach((lines, index) => {
      if (index > 0) {
        doc.line(x, y, x, y + rowHeight);
      }
      doc.text(lines, x + CELL_PADDING, y + LINE_HEIGHT);
      x += colWidths[index];
    });

    y += rowHeight;
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Pagina ${page} de ${pageCount}`, pageWidth - MARGIN_RIGHT, pageHeight - 6, {
      align: "right",
    });
    doc.setTextColor(0, 0, 0);
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
