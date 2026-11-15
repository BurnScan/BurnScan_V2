/**
 * Client-side hotspot dataset.
 *
 * `npm run data` converts the source Parquet export into two static assets in
 * `public/data/`:
 *
 *   hotspots.json  dictionaries + byte layout
 *   hotspots.bin   column-oriented typed arrays
 *
 * Because the arrays arrive as raw little-endian bytes, the browser rebuilds
 * typed arrays without parsing anything, so filtering 2.7M observations stays
 * in the tens of milliseconds.
 */
import type { AreaBounds, MapPoint } from "./MapView";

export type Sensor = "MODIS" | "VIIRS";

export type Filters = {
  province: string;
  sensor: string;
  satellite: string;
  start: string;
  end: string;
};

export type Hotspot = {
  id: number;
  date: string;
  time: string;
  province: string;
  sensor: Sensor;
  satellite: string;
  lat: number;
  lng: number;
  confidence: string;
  highConfidence: boolean;
  frp: number;
};

export type MapCell = {
  id: number;
  lat: number;
  lng: number;
  count: number;
  modis: number;
  viirs: number;
  sensor: Sensor;
  province: string;
  maxFrp: number;
  firstDate: string;
  lastDate: string;
  top: Hotspot;
};

export type Count = readonly [label: string, value: number];

export type AreaStats = {
  bounds: AreaBounds;
  count: number;
  modis: number;
  viirs: number;
  provinces: Count[];
  firstDay: string;
  lastDay: string;
  maxFrp: number;
  meanFrp: number;
  flaggedCount: number;
  byMonth: Count[];
  byMonthOfYear: number[];
  byYear: Count[];
  peakDay: Count | null;
  peakMonth: Count | null;
  peakYear: Count | null;
  /** Calendar months that together account for ~80 % of detections in the area. */
  criticalMonths: string[];
  /** Months at or above the 95th percentile of the same calendar month's history. */
  anomalyMonths: MonthAnomaly[];
};

export type MonthAnomaly = {
  /** `YYYY-MM` */
  label: string;
  value: number;
  median: number;
  ratio: number;
  percentile: number;
};

export type SensorCounts = {
  label: string;
  modis: number;
  viirs: number;
};

export type YearMatch = SensorCounts & {
  matchedModis: number;
  matchedViirs: number;
  modisRate: number;
  viirsRate: number;
};

export type CrossSensorStats = {
  modis: number;
  viirs: number;
  matchedModis: number;
  matchedViirs: number;
  modisMatchRate: number;
  viirsMatchRate: number;
  matchedHotspots: number;
  modisOnly: number;
  viirsOnly: number;
  byMonth: SensorCounts[];
  byYear: SensorCounts[];
  byYearMatch: YearMatch[];
  frp: {
    modisMean: number;
    viirsMean: number;
    modisMatchedMean: number;
    viirsMatchedMean: number;
  };
  highConfidence: { modis: number; viirs: number };
  overlap: { first: string; last: string } | null;
  /** VIIRS ÷ MODIS over the 2012+ overlap where both sensors exist. */
  ratio: number | null;
  /** VIIRS ÷ MODIS over the whole applied range (diluted by MODIS-only years). */
  rangeRatio: number | null;
};

/** Spatial radius used for cross-sensor matching. */
const MATCH_RADIUS_KM = 1;
const MATCH_CELL_DEG = 0.01;

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export type FilterResult = {
  count: number;
  cells: MapCell[];
  byProvince: Count[];
  byDay: Count[];
  byMonth: Count[];
  byMonthOfYear: number[];
  byYear: Count[];
  bySensor: Count[];
  bySatellite: Count[];
  flaggedCount: number;
  flagged: Hotspot[];
  maxFrp: number;
  meanFrp: number;
  firstDay: string;
  lastDay: string;
  provinceCount: number;
};

type LayoutEntry = { offset: number; length: number; bytes: number };

type Manifest = {
  source: string;
  sourceBytes: number;
  generatedAt: string;
  rows: number;
  binary: string;
  layout: Record<string, LayoutEntry>;
  dictionaries: {
    sensors: string[];
    satellites: string[];
    provinces: string[];
    confidences: string[];
  };
  coverage: {
    start: string;
    end: string;
    days: number;
    startDay: number;
    endDay: number;
  };
  frp: { max: number; mean: number };
  byYear: Record<string, number>;
};

const MS_PER_DAY = 86_400_000;
const DAY_MINUTES = 1440;
/** Cambodia is UTC+7 all year; hotspot times are shown in local time. */
const ICT_OFFSET_MINUTES = 7 * 60;

/** Map aggregation grid: 0.1° cells (~11 km), which keeps marker counts sane. */
const CELL_SIZE = 0.1;
const CELL_LAT_MIN = 9;
const CELL_LNG_MIN = 101;
const CELL_LAT_COUNT = 80;
const CELL_LNG_COUNT = 90;

const FLAGGED_FRP = 100;
const FLAGGED_LIMIT = 100;
const CELLS_CACHE_LIMIT = 24;

const asset = (name: string, version?: string) =>
  `${import.meta.env.BASE_URL}data/${name}${version ? `?v=${encodeURIComponent(version)}` : ""}`;

function isoFromDay(day: number) {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

function clockFromMinutes(minutes: number) {
  const local = ((minutes + ICT_OFFSET_MINUTES) % DAY_MINUTES + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(local / 60)).padStart(2, "0")}:${String(local % 60).padStart(2, "0")}`;
}

function displayConfidence(raw: string) {
  if (/^\d+(\.\d+)?$/.test(raw)) return `${raw}%`;
  if (raw === "high") return "High";
  if (raw === "nominal") return "Nominal";
  if (raw === "low") return "Low";
  return raw;
}

function isHighConfidence(raw: string) {
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw) >= 80;
  return raw === "high";
}

function readBinary<T>(buffer: ArrayBuffer, layout: LayoutEntry, Ctor: new (b: ArrayBuffer, o?: number, l?: number) => T) {
  return new Ctor(buffer, layout.offset, layout.length);
}

export class Dataset {
  readonly manifest: Manifest;
  readonly size: number;

  readonly day: Int32Array;
  readonly minute: Uint16Array;
  readonly lat: Float32Array;
  readonly lng: Float32Array;
  readonly frp: Float32Array;
  readonly sensorId: Uint8Array;
  readonly satelliteId: Uint8Array;
  readonly provinceId: Uint8Array;
  readonly confidenceId: Uint8Array;
  readonly highConfidence: Uint8Array;

  readonly sensors: string[];
  readonly satellites: string[];
  readonly provinces: string[];
  readonly confidences: string[];
  readonly confidenceLabels: string[];

  readonly minDay: number;
  readonly maxDay: number;
  readonly dayCount: number;
  readonly dayLabels: string[];
  readonly monthKeys: string[];
  readonly monthOfDay: Uint16Array;
  readonly monthBase: number;

  private cache = new Map<string, FilterResult>();
  private areaCache = new Map<string, AreaStats>();
  private crossCache = new Map<string, CrossSensorStats>();
  private dayOrder: Int32Array | null = null;
  private dayOffsets: Int32Array | null = null;

  constructor(manifest: Manifest, buffer: ArrayBuffer) {
    this.manifest = manifest;
    this.size = manifest.rows;

    const { layout } = manifest;
    this.day = readBinary(buffer, layout.day, Int32Array);
    this.minute = readBinary(buffer, layout.minute, Uint16Array);
    this.lat = readBinary(buffer, layout.lat, Float32Array);
    this.lng = readBinary(buffer, layout.lng, Float32Array);
    this.frp = readBinary(buffer, layout.frp, Float32Array);
    this.sensorId = readBinary(buffer, layout.sensor, Uint8Array);
    this.satelliteId = readBinary(buffer, layout.satellite, Uint8Array);
    this.provinceId = readBinary(buffer, layout.province, Uint8Array);
    this.confidenceId = readBinary(buffer, layout.confidence, Uint8Array);

    this.sensors = [...manifest.dictionaries.sensors].sort();
    this.satellites = [...manifest.dictionaries.satellites].sort();
    this.provinces = [...manifest.dictionaries.provinces].sort();
    this.confidences = manifest.dictionaries.confidences;
    this.confidenceLabels = this.confidences.map(displayConfidence);

    this.sensorId = remap(this.sensorId, manifest.dictionaries.sensors, this.sensors);
    this.satelliteId = remap(this.satelliteId, manifest.dictionaries.satellites, this.satellites);
    this.provinceId = remap(this.provinceId, manifest.dictionaries.provinces, this.provinces);

    this.highConfidence = new Uint8Array(this.confidences.length);
    this.confidences.forEach((raw, index) => {
      this.highConfidence[index] = isHighConfidence(raw) ? 1 : 0;
    });

    this.minDay = manifest.coverage.startDay;
    this.maxDay = manifest.coverage.endDay;
    this.dayCount = this.maxDay - this.minDay + 1;
    this.dayLabels = Array.from({ length: this.dayCount }, (_, index) => isoFromDay(this.minDay + index));

    const first = new Date(this.minDay * MS_PER_DAY);
    const last = new Date(this.maxDay * MS_PER_DAY);
    this.monthBase = first.getUTCFullYear() * 12 + first.getUTCMonth();
    const monthEnd = last.getUTCFullYear() * 12 + last.getUTCMonth();
    this.monthKeys = Array.from({ length: monthEnd - this.monthBase + 1 }, (_, index) => {
      const key = this.monthBase + index;
      return `${Math.floor(key / 12)}-${String((key % 12) + 1).padStart(2, "0")}`;
    });
    this.monthOfDay = new Uint16Array(this.dayCount);
    for (let index = 0; index < this.dayCount; index++) {
      const date = new Date((this.minDay + index) * MS_PER_DAY);
      this.monthOfDay[index] = date.getUTCFullYear() * 12 + date.getUTCMonth() - this.monthBase;
    }
  }

  get source() {
    return this.manifest.source;
  }

  private satelliteCache = new Map<string, string[]>();

  /** Satellites that belong to a sensor, for the dependent filter dropdown. */
  satellitesFor(sensor: string) {
    const cached = this.satelliteCache.get(sensor);
    if (cached) return cached;
    // Satellite selection only makes sense inside one sensor; with "All
    // sensors" the control is locked to All satellites.
    let options = ["All satellites"];
    if (sensor === "MODIS" || sensor === "VIIRS") {
      const index = this.sensors.indexOf(sensor);
      const list: string[] = [];
      for (let row = 0; row < this.size; row++) {
        if (this.sensorId[row] !== index) continue;
        const name = this.satellites[this.satelliteId[row]];
        if (!list.includes(name)) list.push(name);
      }
      if (list.length) options = ["All satellites", ...list.sort()];
    }
    this.satelliteCache.set(sensor, options);
    return options;
  }

  label(row: number, kind: "province" | "sensor" | "satellite" | "confidence") {
    switch (kind) {
      case "province":
        return this.provinces[this.provinceId[row]];
      case "sensor":
        return this.sensors[this.sensorId[row]];
      case "satellite":
        return this.satellites[this.satelliteId[row]];
      default:
        return this.confidenceLabels[this.confidenceId[row]];
    }
  }

  hotspot(row: number): Hotspot {
    return {
      id: row,
      date: this.dayLabels[this.day[row] - this.minDay],
      time: clockFromMinutes(this.minute[row]),
      province: this.provinces[this.provinceId[row]],
      sensor: this.sensors[this.sensorId[row]] as Sensor,
      satellite: this.satellites[this.satelliteId[row]],
      lat: this.lat[row],
      lng: this.lng[row],
      confidence: this.confidenceLabels[this.confidenceId[row]],
      highConfidence: this.highConfidence[this.confidenceId[row]] === 1,
      frp: Math.round(this.frp[row] * 10) / 10,
    };
  }

  /** Run the full filter/aggregate pass. Results are cached per filter set. */
  query(filters: Filters): FilterResult {
    const key = `${filters.province}|${filters.sensor}|${filters.satellite}|${filters.start}|${filters.end}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const result = this.compute(filters);
    if (this.cache.size >= CELLS_CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, result);
    return result;
  }

  private compute(filters: Filters): FilterResult {
    const provinceIndex = filters.province === "All provinces" ? -1 : this.provinces.indexOf(filters.province);
    const sensorIndex = filters.sensor === "All sensors" || filters.sensor === "All Sensor" ? -1 : this.sensors.indexOf(filters.sensor);
    const satelliteIndex = filters.satellite === "All satellites" ? -1 : this.satellites.indexOf(filters.satellite);
    const startDay = filters.start ? dayFromInput(filters.start) : Number.NEGATIVE_INFINITY;
    const endDay = filters.end ? dayFromInput(filters.end) : Number.POSITIVE_INFINITY;

    const byProvince = new Int32Array(this.provinces.length);
    const bySensor = new Int32Array(this.sensors.length);
    const bySatellite = new Int32Array(this.satellites.length);
    const byDay = new Int32Array(this.dayCount);
    const monthCounts = new Int32Array(this.monthKeys.length);

    const cellsPerAxis = CELL_LAT_COUNT * CELL_LNG_COUNT;
    const cellCount = new Int32Array(cellsPerAxis);
    const cellModis = new Int32Array(cellsPerAxis);
    const cellMaxFrp = new Float32Array(cellsPerAxis);
    const cellTop = new Int32Array(cellsPerAxis).fill(-1);
    const cellProvince = new Int16Array(cellsPerAxis).fill(-1);
    const cellFirst = new Int32Array(cellsPerAxis).fill(0);
    const cellLast = new Int32Array(cellsPerAxis).fill(0);

    const { day, lat, lng, frp, sensorId, satelliteId, provinceId } = this;
    let count = 0;
    let frpSum = 0;
    let maxFrp = 0;
    let flaggedCount = 0;
    let firstMatch = Number.POSITIVE_INFINITY;
    let lastMatch = Number.NEGATIVE_INFINITY;
    const flagged: number[] = [];

    for (let row = 0; row < this.size; row++) {
      const dayValue = day[row];
      if (dayValue < startDay || dayValue > endDay) continue;
      if (provinceIndex !== -1 && provinceId[row] !== provinceIndex) continue;
      if (sensorIndex !== -1 && sensorId[row] !== sensorIndex) continue;
      if (satelliteIndex !== -1 && satelliteId[row] !== satelliteIndex) continue;

      count++;
      const frpValue = frp[row];
      frpSum += frpValue;
      if (frpValue > maxFrp) maxFrp = frpValue;
      if (dayValue < firstMatch) firstMatch = dayValue;
      if (dayValue > lastMatch) lastMatch = dayValue;

      byProvince[provinceId[row]]++;
      bySensor[sensorId[row]]++;
      bySatellite[satelliteId[row]]++;
      const dayIndex = dayValue - this.minDay;
      byDay[dayIndex]++;
      monthCounts[this.monthOfDay[dayIndex]]++;

      if (frpValue >= FLAGGED_FRP) {
        flaggedCount++;
        if (flagged.length < FLAGGED_LIMIT) {
          flagged.push(row);
          if (flagged.length === FLAGGED_LIMIT) flagged.sort((a, b) => frp[b] - frp[a]);
        } else if (frpValue > frp[flagged[FLAGGED_LIMIT - 1]]) {
          flagged[FLAGGED_LIMIT - 1] = row;
          flagged.sort((a, b) => frp[b] - frp[a]);
        }
      }

      const cellLat = Math.floor((lat[row] - CELL_LAT_MIN) / CELL_SIZE);
      const cellLng = Math.floor((lng[row] - CELL_LNG_MIN) / CELL_SIZE);
      if (cellLat < 0 || cellLat >= CELL_LAT_COUNT || cellLng < 0 || cellLng >= CELL_LNG_COUNT) continue;
      const cell = cellLat * CELL_LNG_COUNT + cellLng;
      cellCount[cell]++;
      if (sensorId[row] === 0) cellModis[cell]++;
      if (cellTop[cell] === -1) {
        cellFirst[cell] = dayValue;
        cellProvince[cell] = provinceId[row];
      }
      cellLast[cell] = dayValue;
      if (frpValue > cellMaxFrp[cell] || cellTop[cell] === -1) {
        cellMaxFrp[cell] = frpValue;
        cellTop[cell] = row;
      }
    }

    const cells: MapCell[] = [];
    for (let cell = 0; cell < cellsPerAxis; cell++) {
      const total = cellCount[cell];
      if (total === 0) continue;
      const cellLat = Math.floor(cell / CELL_LNG_COUNT);
      const cellLng = cell % CELL_LNG_COUNT;
      cells.push({
        id: cell,
        lat: CELL_LAT_MIN + (cellLat + 0.5) * CELL_SIZE,
        lng: CELL_LNG_MIN + (cellLng + 0.5) * CELL_SIZE,
        count: total,
        modis: cellModis[cell],
        viirs: total - cellModis[cell],
        sensor: cellModis[cell] * 2 >= total ? "MODIS" : "VIIRS",
        province: this.provinces[cellProvince[cell]],
        maxFrp: Math.round(cellMaxFrp[cell] * 10) / 10,
        firstDate: isoFromDay(cellFirst[cell]),
        lastDate: isoFromDay(cellLast[cell]),
        top: this.hotspot(cellTop[cell]),
      });
    }
    cells.sort((a, b) => b.count - a.count);

    const byMonthOfYear = new Array(12).fill(0) as number[];
    const byYearMap = new Map<string, number>();
    const byMonth: Count[] = [];
    this.monthKeys.forEach((label, index) => {
      const value = monthCounts[index];
      if (value === 0) return;
      byMonthOfYear[Number(label.slice(5, 7)) - 1] += value;
      byMonth.push([label, value] as const);
      const year = label.slice(0, 4);
      byYearMap.set(year, (byYearMap.get(year) ?? 0) + value);
    });

    const dayEntries: Count[] = [];
    for (let index = 0; index < byDay.length; index++) {
      if (byDay[index] > 0) dayEntries.push([this.dayLabels[index], byDay[index]]);
    }
    dayEntries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    return {
      count,
      cells,
      byProvince: countEntries(this.provinces, byProvince),
      byDay: dayEntries,
      byMonth,
      byMonthOfYear,
      byYear: [...byYearMap].sort((a, b) => a[0].localeCompare(b[0])),
      bySensor: countEntries(this.sensors, bySensor),
      bySatellite: countEntries(this.satellites, bySatellite),
      flaggedCount,
      flagged: flagged.map((row) => this.hotspot(row)),
      maxFrp: Math.round(maxFrp * 10) / 10,
      meanFrp: count ? Number((frpSum / count).toFixed(2)) : 0,
      firstDay: count ? isoFromDay(firstMatch) : "",
      lastDay: count ? isoFromDay(lastMatch) : "",
      provinceCount: byProvince.filter((value) => value > 0).length,
    };
  }

  /** Marker payload for the Leaflet map: one aggregated bubble per grid cell. */
  mapPoints(result: FilterResult): MapPoint[] {
    return result.cells.map((cell) => ({
      id: cell.id,
      lat: cell.lat,
      lng: cell.lng,
      sensor: cell.sensor,
      province: cell.province,
      count: cell.count,
    }));
  }

  /**
   * Aggregate the archive inside a drawn rectangle. Applies the same filters as
   * {@link query}, but is scoped to the bounds and adds the multi-year baseline
   * used to flag unusual months and critical periods for that area.
   */
  areaStats(filters: Filters, bounds: AreaBounds): AreaStats {
    const key = `${filters.province}|${filters.sensor}|${filters.satellite}|${filters.start}|${filters.end}|${bounds.south.toFixed(4)},${bounds.west.toFixed(4)},${bounds.north.toFixed(4)},${bounds.east.toFixed(4)}`;
    const cached = this.areaCache.get(key);
    if (cached) return cached;

    const stats = this.computeArea(filters, bounds);
    if (this.areaCache.size >= CELLS_CACHE_LIMIT) {
      const oldest = this.areaCache.keys().next().value;
      if (oldest !== undefined) this.areaCache.delete(oldest);
    }
    this.areaCache.set(key, stats);
    return stats;
  }

  private computeArea(filters: Filters, bounds: AreaBounds): AreaStats {
    const provinceIndex =
      filters.province === "All provinces" ? -1 : this.provinces.indexOf(filters.province);
    const sensorIndex =
      filters.sensor === "All sensors" || filters.sensor === "All Sensor"
        ? -1
        : this.sensors.indexOf(filters.sensor);
    const satelliteIndex =
      filters.satellite === "All satellites" ? -1 : this.satellites.indexOf(filters.satellite);
    const startDay = filters.start ? dayFromInput(filters.start) : Number.NEGATIVE_INFINITY;
    const endDay = filters.end ? dayFromInput(filters.end) : Number.POSITIVE_INFINITY;

    const modisIndex = this.sensors.indexOf("MODIS");
    const byProvince = new Int32Array(this.provinces.length);
    const byMonth = new Int32Array(this.monthKeys.length);
    const byDay = new Int32Array(this.dayCount);
    // Multi-year baseline for the same rectangle: keyed by global month index
    // (year * 12 + month), so it ignores the applied date range on purpose.
    const baseline = new Map<number, number>();

    const { day, lat, lng, frp, sensorId, satelliteId, provinceId } = this;
    let count = 0;
    let modis = 0;
    let viirs = 0;
    let frpSum = 0;
    let maxFrp = 0;
    let flaggedCount = 0;
    let firstMatch = Number.POSITIVE_INFINITY;
    let lastMatch = Number.NEGATIVE_INFINITY;

    for (let row = 0; row < this.size; row++) {
      const rowLat = lat[row];
      const rowLng = lng[row];
      if (
        rowLat < bounds.south ||
        rowLat > bounds.north ||
        rowLng < bounds.west ||
        rowLng > bounds.east
      ) {
        continue;
      }
      if (sensorIndex !== -1 && sensorId[row] !== sensorIndex) continue;
      if (satelliteIndex !== -1 && satelliteId[row] !== satelliteIndex) continue;
      if (provinceIndex !== -1 && provinceId[row] !== provinceIndex) continue;

      const dayValue = day[row];
      const dayIndex = dayValue - this.minDay;
      const monthIndex = this.monthBase + this.monthOfDay[dayIndex];
      baseline.set(monthIndex, (baseline.get(monthIndex) ?? 0) + 1);

      if (dayValue < startDay || dayValue > endDay) continue;

      count++;
      if (sensorId[row] === modisIndex) modis++;
      else viirs++;
      const frpValue = frp[row];
      frpSum += frpValue;
      if (frpValue > maxFrp) maxFrp = frpValue;
      if (frpValue >= FLAGGED_FRP) flaggedCount++;
      if (dayValue < firstMatch) firstMatch = dayValue;
      if (dayValue > lastMatch) lastMatch = dayValue;
      byProvince[provinceId[row]]++;
      byMonth[monthIndex - this.monthBase]++;
      byDay[dayIndex]++;
    }

    const byMonthOfYear = new Array(12).fill(0) as number[];
    const byMonthEntries: Count[] = [];
    this.monthKeys.forEach((label, index) => {
      const value = byMonth[index];
      if (value === 0) return;
      byMonthOfYear[Number(label.slice(5, 7)) - 1] += value;
      byMonthEntries.push([label, value] as const);
    });

    let peakMonth: Count | null = null;
    byMonthOfYear.forEach((value, index) => {
      if (value > 0 && (!peakMonth || value > peakMonth[1])) {
        peakMonth = [MONTH_LABELS[index], value];
      }
    });

    const byYearMap = new Map<string, number>();
    byMonthEntries.forEach(([label, value]) => {
      const year = label.slice(0, 4);
      byYearMap.set(year, (byYearMap.get(year) ?? 0) + value);
    });
    const byYear = [...byYearMap].sort((a, b) => a[0].localeCompare(b[0]));
    const peakYear = byYear.reduce<Count | null>(
      (best, entry) => (!best || entry[1] > best[1] ? entry : best),
      null,
    );

    let peakDay: Count | null = null;
    for (let index = 0; index < byDay.length; index++) {
      const value = byDay[index];
      if (value > 0 && (!peakDay || value > peakDay[1])) {
        peakDay = [this.dayLabels[index], value];
      }
    }

    const criticalMonths = criticalMonthLabels(byMonthOfYear);

    const years = [
      ...new Set(
        Array.from({ length: this.monthKeys.length }, (_, index) =>
          Math.floor((this.monthBase + index) / 12),
        ),
      ),
    ];
    const anomalies: MonthAnomaly[] = [];
    byMonthEntries.forEach(([label, value]) => {
      const month = Number(label.slice(5, 7)) - 1;
      const samples = years
        .map((year) => baseline.get(year * 12 + month) ?? 0)
        .sort((a, b) => a - b);
      if (samples.length < 5) return;
      const median = samples[Math.floor((samples.length - 1) / 2)];
      const below = samples.filter((sample) => sample <= value).length;
      const percentile = Math.round((below / samples.length) * 100);
      if (value < 20 || percentile < 95) return;
      const ratio = median > 0 ? value / median : Number.POSITIVE_INFINITY;
      anomalies.push({ label, value, median, ratio, percentile });
    });
    anomalies.sort(
      (a, b) => b.percentile - a.percentile || b.ratio - a.ratio || b.value - a.value,
    );

    return {
      bounds,
      count,
      modis,
      viirs,
      provinces: countEntries(this.provinces, byProvince),
      firstDay: count ? isoFromDay(firstMatch) : "",
      lastDay: count ? isoFromDay(lastMatch) : "",
      maxFrp: Math.round(maxFrp * 10) / 10,
      meanFrp: count ? Number((frpSum / count).toFixed(2)) : 0,
      flaggedCount,
      byMonth: byMonthEntries,
      byMonthOfYear,
      byYear,
      peakDay,
      peakMonth,
      peakYear,
      criticalMonths,
      anomalyMonths: anomalies.slice(0, 5),
    };
  }

  /**
   * Cross-sensor matching. A MODIS (or VIIRS) detection counts as matched when
   * the other sensor has a detection within 1 km and ±24 h. Sensor / satellite
   * filters are deliberately ignored: this view always compares both sensors,
   * scoped only by province and date range.
   */
  crossSensor(filters: Filters): CrossSensorStats {
    const key = `${filters.province}|${filters.start}|${filters.end}`;
    const cached = this.crossCache.get(key);
    if (cached) return cached;

    const stats = this.computeCrossSensor(filters);
    if (this.crossCache.size >= 8) {
      const oldest = this.crossCache.keys().next().value;
      if (oldest !== undefined) this.crossCache.delete(oldest);
    }
    this.crossCache.set(key, stats);
    return stats;
  }

  private ensureDayOrder() {
    if (this.dayOrder) return;
    const counts = new Int32Array(this.dayCount);
    for (let row = 0; row < this.size; row++) counts[this.day[row] - this.minDay]++;
    const offsets = new Int32Array(this.dayCount + 1);
    for (let index = 0; index < this.dayCount; index++) offsets[index + 1] = offsets[index] + counts[index];
    const cursor = offsets.slice(0, this.dayCount);
    const order = new Int32Array(this.size);
    for (let row = 0; row < this.size; row++) {
      order[cursor[this.day[row] - this.minDay]++] = row;
    }
    this.dayOrder = order;
    this.dayOffsets = offsets;
  }

  private computeCrossSensor(filters: Filters): CrossSensorStats {
    const empty: CrossSensorStats = {
      modis: 0,
      viirs: 0,
      matchedModis: 0,
      matchedViirs: 0,
      modisMatchRate: 0,
      viirsMatchRate: 0,
      matchedHotspots: 0,
      modisOnly: 0,
      viirsOnly: 0,
      byMonth: [],
      byYear: [],
      byYearMatch: [],
      frp: { modisMean: 0, viirsMean: 0, modisMatchedMean: 0, viirsMatchedMean: 0 },
      highConfidence: { modis: 0, viirs: 0 },
      overlap: null,
      ratio: null,
      rangeRatio: null,
    };

    this.ensureDayOrder();
    const order = this.dayOrder!;
    const offsets = this.dayOffsets!;
    const provinceIndex =
      filters.province === "All provinces" ? -1 : this.provinces.indexOf(filters.province);
    const startDay = filters.start ? dayFromInput(filters.start) : this.minDay;
    const endDay = filters.end ? dayFromInput(filters.end) : this.maxDay;
    const countFirst = Math.max(0, startDay - this.minDay);
    const countLast = Math.min(this.dayCount - 1, endDay - this.minDay);
    if (countFirst > countLast) return empty;
    // Partners may sit one day outside the applied range; include them while
    // matching so a filtered single day still finds ±24 h partners.
    const firstIdx = Math.max(0, countFirst - 1);
    const lastIdx = Math.min(this.dayCount - 1, countLast + 1);

    const modisIndex = this.sensors.indexOf("MODIS");
    const viirsIndex = this.sensors.indexOf("VIIRS");
    if (modisIndex === -1 || viirsIndex === -1) return empty;

    const matched = new Uint8Array(this.size);
    const emptyIndex: Map<number, number[]> = new Map();

    const buildDayIndex = (dayIndex: number, sensor: number) => {
      const index = new Map<number, number[]>();
      for (let cursor = offsets[dayIndex]; cursor < offsets[dayIndex + 1]; cursor++) {
        const row = order[cursor];
        if (this.sensorId[row] !== sensor) continue;
        if (provinceIndex !== -1 && this.provinceId[row] !== provinceIndex) continue;
        const key = matchCellKey(this.lat[row], this.lng[row]);
        const list = index.get(key);
        if (list) list.push(row);
        else index.set(key, [row]);
      }
      return index;
    };

    const scan = (
      sourceRow: number,
      index: Map<number, number[]>,
      sourceBit: number,
      partnerBit: number,
    ) => {
      if (index.size === 0) return;
      const lat = this.lat[sourceRow];
      const lng = this.lng[sourceRow];
      const binLat = Math.floor(lat / MATCH_CELL_DEG);
      const binLng = Math.floor(lng / MATCH_CELL_DEG);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = index.get((binLat + dy) * 100_000 + (binLng + dx));
          if (!list) continue;
          for (let entry = 0; entry < list.length; entry++) {
            const row = list[entry];
            if (distanceSqKm(lat, lng, this.lat[row], this.lng[row]) <= MATCH_RADIUS_KM ** 2) {
              matched[sourceRow] |= sourceBit;
              matched[row] |= partnerBit;
            }
          }
        }
      }
    };

    let currentViirs = buildDayIndex(firstIdx, viirsIndex);
    for (let dayIndex = firstIdx; dayIndex <= lastIdx; dayIndex++) {
      const nextModis = dayIndex < lastIdx ? buildDayIndex(dayIndex + 1, modisIndex) : emptyIndex;
      const nextViirs = dayIndex < lastIdx ? buildDayIndex(dayIndex + 1, viirsIndex) : emptyIndex;

      // Pairs whose earlier detection is on this day: MODIS(d)↔VIIRS(d),
      // MODIS(d)↔VIIRS(d+1) and VIIRS(d)↔MODIS(d+1).
      for (let cursor = offsets[dayIndex]; cursor < offsets[dayIndex + 1]; cursor++) {
        const row = order[cursor];
        if (provinceIndex !== -1 && this.provinceId[row] !== provinceIndex) continue;
        if (this.sensorId[row] === modisIndex) {
          if (currentViirs.size) scan(row, currentViirs, 1, 2);
          if (nextViirs.size) scan(row, nextViirs, 1, 2);
        } else if (nextModis.size) {
          scan(row, nextModis, 2, 1);
        }
      }

      currentViirs = nextViirs;
    }

    const modisMonths = new Int32Array(this.monthKeys.length);
    const viirsMonths = new Int32Array(this.monthKeys.length);
    const matchedModisMonths = new Int32Array(this.monthKeys.length);
    const matchedViirsMonths = new Int32Array(this.monthKeys.length);
    let modis = 0;
    let viirs = 0;
    let matchedModis = 0;
    let matchedViirs = 0;
    let modisFrpSum = 0;
    let viirsFrpSum = 0;
    let matchedModisFrpSum = 0;
    let matchedViirsFrpSum = 0;
    let modisHigh = 0;
    let viirsHigh = 0;
    let firstBoth = -1;
    let lastBoth = -1;

    for (let dayIndex = countFirst; dayIndex <= countLast; dayIndex++) {
      let dayHasModis = false;
      let dayHasViirs = false;
      for (let cursor = offsets[dayIndex]; cursor < offsets[dayIndex + 1]; cursor++) {
        const row = order[cursor];
        if (provinceIndex !== -1 && this.provinceId[row] !== provinceIndex) continue;
        const month = this.monthOfDay[dayIndex];
        const frp = this.frp[row];
        const high = this.highConfidence[this.confidenceId[row]] === 1;
        if (this.sensorId[row] === modisIndex) {
          modis++;
          dayHasModis = true;
          modisFrpSum += frp;
          if (high) modisHigh++;
          modisMonths[month]++;
          if (matched[row] & 1) {
            matchedModis++;
            matchedModisFrpSum += frp;
            matchedModisMonths[month]++;
          }
        } else if (this.sensorId[row] === viirsIndex) {
          viirs++;
          dayHasViirs = true;
          viirsFrpSum += frp;
          if (high) viirsHigh++;
          viirsMonths[month]++;
          if (matched[row] & 2) {
            matchedViirs++;
            matchedViirsFrpSum += frp;
            matchedViirsMonths[month]++;
          }
        }
      }
      if (dayHasModis && dayHasViirs) {
        if (firstBoth === -1) firstBoth = dayIndex;
        lastBoth = dayIndex;
      }
    }

    const byMonth: SensorCounts[] = [];
    this.monthKeys.forEach((label, index) => {
      const m = modisMonths[index];
      const v = viirsMonths[index];
      if (m || v) byMonth.push({ label, modis: m, viirs: v });
    });

    const yearMap = new Map<string, YearMatch>();
    this.monthKeys.forEach((label, index) => {
      const key = label.slice(0, 4);
      let entry = yearMap.get(key);
      if (!entry) {
        entry = { label: key, modis: 0, viirs: 0, matchedModis: 0, matchedViirs: 0, modisRate: 0, viirsRate: 0 };
        yearMap.set(key, entry);
      }
      entry.modis += modisMonths[index];
      entry.viirs += viirsMonths[index];
      entry.matchedModis += matchedModisMonths[index];
      entry.matchedViirs += matchedViirsMonths[index];
    });
    yearMap.forEach((entry) => {
      entry.modisRate = entry.modis ? round1((entry.matchedModis / entry.modis) * 100) : 0;
      entry.viirsRate = entry.viirs ? round1((entry.matchedViirs / entry.viirs) * 100) : 0;
    });
    const byYearMatch = [...yearMap.values()]
      .filter((entry) => entry.modis || entry.viirs)
      .sort((a, b) => a.label.localeCompare(b.label));

    // Ratio claims only make sense where both sensors exist. Pre-2012 is
    // MODIS-only, so dividing by the full-range MODIS total understates VIIRS.
    const overlapYears = byYearMatch.filter((entry) => Number(entry.label) >= 2012);
    const overlapModis = overlapYears.reduce((sum, entry) => sum + entry.modis, 0);
    const overlapViirs = overlapYears.reduce((sum, entry) => sum + entry.viirs, 0);

    return {
      modis,
      viirs,
      matchedModis,
      matchedViirs,
      modisMatchRate: modis ? round1((matchedModis / modis) * 100) : 0,
      viirsMatchRate: viirs ? round1((matchedViirs / viirs) * 100) : 0,
      matchedHotspots: matchedModis + matchedViirs,
      modisOnly: modis - matchedModis,
      viirsOnly: viirs - matchedViirs,
      byMonth,
      byYear: byYearMatch.map(({ label, modis: m, viirs: v }) => ({ label, modis: m, viirs: v })),
      byYearMatch,
      frp: {
        modisMean: modis ? round2(modisFrpSum / modis) : 0,
        viirsMean: viirs ? round2(viirsFrpSum / viirs) : 0,
        modisMatchedMean: matchedModis ? round2(matchedModisFrpSum / matchedModis) : 0,
        viirsMatchedMean: matchedViirs ? round2(matchedViirsFrpSum / matchedViirs) : 0,
      },
      highConfidence: {
        modis: modis ? round1((modisHigh / modis) * 100) : 0,
        viirs: viirs ? round1((viirsHigh / viirs) * 100) : 0,
      },
      overlap:
        firstBoth === -1
          ? null
          : { first: isoFromDay(this.minDay + firstBoth), last: isoFromDay(this.minDay + lastBoth) },
      ratio: overlapModis ? round2(overlapViirs / overlapModis) : null,
      rangeRatio: modis ? round2(viirs / modis) : null,
    };
  }

  /**
   * CSV for the applied filters. Very large result sets are sampled evenly
   * across the matching rows so the download stays a sensible size.
   */
  exportCsv(filters: Filters, limit = 50_000, bounds?: AreaBounds | null) {
    const result = this.query(filters);
    const total = bounds ? this.areaStats(filters, bounds).count : result.count;
    const stride = Math.max(1, Math.ceil(total / limit));
    const rows: string[] = [
      "Observation date,Time (ICT),Province,Sensor,Satellite,Latitude,Longitude,Source confidence,FRP (MW)",
    ];
    const provinceIndex = filters.province === "All provinces" ? -1 : this.provinces.indexOf(filters.province);
    const sensorIndex = filters.sensor === "All sensors" || filters.sensor === "All Sensor" ? -1 : this.sensors.indexOf(filters.sensor);
    const satelliteIndex = filters.satellite === "All satellites" ? -1 : this.satellites.indexOf(filters.satellite);
    const startDay = filters.start ? dayFromInput(filters.start) : Number.NEGATIVE_INFINITY;
    const endDay = filters.end ? dayFromInput(filters.end) : Number.POSITIVE_INFINITY;
    let matched = 0;
    let written = 0;

    for (let row = 0; row < this.size; row++) {
      const dayValue = this.day[row];
      if (dayValue < startDay || dayValue > endDay) continue;
      if (provinceIndex !== -1 && this.provinceId[row] !== provinceIndex) continue;
      if (sensorIndex !== -1 && this.sensorId[row] !== sensorIndex) continue;
      if (satelliteIndex !== -1 && this.satelliteId[row] !== satelliteIndex) continue;
      if (
        bounds &&
        (this.lat[row] < bounds.south ||
          this.lat[row] > bounds.north ||
          this.lng[row] < bounds.west ||
          this.lng[row] > bounds.east)
      ) {
        continue;
      }
      if (matched++ % stride !== 0 || written >= limit) continue;
      const record = this.hotspot(row);
      rows.push(
        [
          record.date,
          record.time,
          record.province,
          record.sensor,
          record.satellite,
          record.lat.toFixed(4),
          record.lng.toFixed(4),
          record.confidence,
          record.frp,
        ].join(","),
      );
      written++;
    }

    return {
      csv: rows.join("\n"),
      exported: written,
      total,
      sampled: written < total,
    };
  }
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Coarse spatial bucket (~1.1 km) used as the candidate index for matching. */
function matchCellKey(lat: number, lng: number) {
  return Math.floor(lat / MATCH_CELL_DEG) * 100_000 + Math.floor(lng / MATCH_CELL_DEG);
}

/** Squared great-circle-ish distance in km (fast equirectangular approximation). */
function distanceSqKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = (lat2 - lat1) * 110.574;
  const dLng = (lng2 - lng1) * 111.32 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return dLat * dLat + dLng * dLng;
}

/** Months (Jan–Dec) that together cover ~80 % of the area's detections. */
function criticalMonthLabels(byMonthOfYear: number[]): string[] {  const total = byMonthOfYear.reduce((sum, value) => sum + value, 0);
  if (!total) return [];
  const ordered = byMonthOfYear
    .map((value, index) => [index, value] as const)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
  const chosen = new Set<number>();
  let running = 0;
  for (const [index, value] of ordered) {
    if (running / total >= 0.8) break;
    chosen.add(index);
    running += value;
  }
  return MONTH_LABELS.filter((_, index) => chosen.has(index));
}

function countEntries(names: string[], values: Int32Array): Count[] {
  return names
    .map((name, index) => [name, values[index]] as const)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
}

/** Dictionaries are sorted for the UI, so translate ids to the sorted order. */
function remap(ids: Uint8Array, original: string[], sorted: string[]) {
  const order = original.map((name) => sorted.indexOf(name));
  const out = new Uint8Array(ids.length);
  for (let index = 0; index < ids.length; index++) out[index] = order[ids[index]];
  return out;
}

function dayFromInput(value: string) {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : value.split("/").reverse().join("-");
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY);
}

export type LoadProgress = { loaded: number; total: number };

async function fetchWithProgress(url: string, onProgress?: (progress: LoadProgress) => void) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  const total = Number(response.headers.get("content-length") ?? 0);
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength });
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export async function loadDataset(onProgress?: (progress: LoadProgress) => void): Promise<Dataset> {
  const manifestResponse = await fetch(asset("hotspots.json"));
  if (!manifestResponse.ok) {
    throw new Error(
      "Hotspot dataset not found. Run `npm run data` to build public/data from the Parquet export.",
    );
  }
  const manifest = (await manifestResponse.json()) as Manifest;
  // The version tag keeps the 60 MB payload cached across reloads while still
  // invalidating it whenever `npm run data` regenerates the archive.
  const buffer = await fetchWithProgress(
    asset(manifest.binary, `${manifest.generatedAt}-${manifest.rows}`),
    onProgress,
  );
  const expected = Math.max(
    ...Object.values(manifest.layout).map((entry) => entry.offset + entry.bytes),
  );
  if (buffer.byteLength < expected) {
    throw new Error(
      `The hotspot archive arrived incomplete (${buffer.byteLength.toLocaleString()} of ${expected.toLocaleString()} bytes). Reload to retry.`,
    );
  }
  return new Dataset(manifest, buffer);
}
