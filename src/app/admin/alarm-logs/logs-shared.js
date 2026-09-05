export const PAGE_SIZE = 50;
export const EXPORT_PAGE_SIZE = 200;
export const MAX_EXPORT_ROWS = 5000;

export function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function toRangeParams({ from, to }) {
  const params = {};

  if (from) {
    const start = new Date(`${from}T00:00:00`);
    if (!Number.isNaN(start.getTime())) params.from = start.toISOString();
  }

  if (to) {
    const end = new Date(`${to}T23:59:59.999`);
    if (!Number.isNaN(end.getTime())) params.to = end.toISOString();
  }

  return params;
}

export function buildRangeLabel({ from, to }) {
  if (from && to) return `Rango: ${from} a ${to}`;
  if (from) return `Rango: desde ${from}`;
  if (to) return `Rango: hasta ${to}`;
  return "Rango: todos los registros";
}

export async function fetchAllPages(fetcher, rangeParams, extractItems) {
  const items = [];
  let offset = 0;
  let total = 0;

  do {
    const response = await fetcher({
      limit: EXPORT_PAGE_SIZE,
      offset,
      ...rangeParams,
    });

    const batch = extractItems(response) || [];
    total = response.total || 0;
    items.push(...batch);
    offset += EXPORT_PAGE_SIZE;

    if (!batch.length) break;
  } while (items.length < total && items.length < MAX_EXPORT_ROWS);

  return items;
}
