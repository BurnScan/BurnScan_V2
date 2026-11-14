/**
 * Shared FIRMS helpers used by both the Node proxy (vite.config.ts) and the
 * browser client (src/firms.ts).
 *
 * Keep this module free of `import.meta.env` / DOM / Node APIs so it can run in
 * either environment unchanged.
 */

export type LiveDetection = {
  id: string;
  lat: number;
  lng: number;
  /** Acquisition date in UTC, YYYY-MM-DD (FIRMS reports GMT). */
  date: string;
  /** Acquisition time already converted to Cambodia time (UTC+7), HH:MM. */
  time: string;
  minuteUtc: number;
  sensor: "MODIS" | "VIIRS";
  satellite: string;
  confidence: string;
  frp: number;
  brightness: number;
  daynight: string;
  source: string;
};

export type LiveFeed = {
  fetchedAt: string;
  days: number;
  sources: string[];
  bbox: number[];
  detections: LiveDetection[];
  errors: { source: string; message: string }[];
};

export type LiveQuota = {
  transaction_limit?: number;
  current_transactions?: number;
  transaction_interval?: string;
};

export type SourceAvailability = { data_id: string; min_date: string; max_date: string };

export const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov";
/** Cambodia bounding box: west,south,east,north. */
export const FIRMS_BBOX = "102.3,10.4,107.7,14.7";
export const FIRMS_MAX_DAYS = 5;
export const FIRMS_SOURCES: string[] = [
  "MODIS_NRT",
  "VIIRS_SNPP_NRT",
  "VIIRS_NOAA20_NRT",
  "VIIRS_NOAA21_NRT",
];

function splitCsvLine(line: string) {
  return line.split(",").map((cell) => cell.trim());
}

/** FIRMS CSVs are unquoted, numeric/identifier only, so a simple split is safe. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((name, index) => {
      row[name] = cells[index] ?? "";
    });
    return row;
  });
}

function satelliteLabel(value: string) {
  switch (value) {
    case "N20":
      return "NOAA-20";
    case "N21":
      return "NOAA-21";
    case "SNPP":
      return "Suomi NPP";
    default:
      return value || "Unknown";
  }
}

function confidenceLabel(value: string) {
  if (/^\d+$/.test(value)) return `${value}%`;
  if (value === "h") return "High";
  if (value === "n") return "Nominal";
  if (value === "l") return "Low";
  return value || "Unknown";
}

function clockFromMinutes(minutesUtc: number) {
  // Cambodia is UTC+7 all year, matching the historical archive views.
  const local = (((minutesUtc + 420) % 1440) + 1440) % 1440;
  return `${String(Math.floor(local / 60)).padStart(2, "0")}:${String(local % 60).padStart(2, "0")}`;
}

export function parseFirmsCsv(text: string, source: string): LiveDetection[] {
  return parseCsv(text).map((row, index) => {
    const rawTime = (row.acq_time ?? "").padStart(4, "0");
    const hour = Number(rawTime.slice(0, 2)) || 0;
    const minute = Number(rawTime.slice(2, 4)) || 0;
    const minuteUtc = hour * 60 + minute;
    return {
      id: `${source}-${index}`,
      lat: Number(row.latitude) || 0,
      lng: Number(row.longitude) || 0,
      date: row.acq_date ?? "",
      time: clockFromMinutes(minuteUtc),
      minuteUtc,
      sensor: row.instrument === "MODIS" ? "MODIS" : "VIIRS",
      satellite: satelliteLabel(row.satellite ?? ""),
      confidence: confidenceLabel(row.confidence ?? ""),
      frp: Number(row.frp) || 0,
      brightness: Number(row.bright_ti4 ?? row.brightness) || 0,
      daynight: row.daynight === "N" ? "Night" : row.daynight === "D" ? "Day" : (row.daynight ?? ""),
      source,
    };
  });
}

/** Newest first, then by UTC minute of day. */
export function sortDetections(detections: LiveDetection[]) {
  detections.sort((a, b) =>
    a.date === b.date ? b.minuteUtc - a.minuteUtc : b.date.localeCompare(a.date),
  );
  return detections;
}

export function parseAvailabilityCsv(text: string): SourceAvailability[] {
  return parseCsv(text).map((row) => ({
    data_id: row.data_id ?? "",
    min_date: row.min_date ?? "",
    max_date: row.max_date ?? "",
  }));
}
