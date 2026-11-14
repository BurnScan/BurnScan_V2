/**
 * Converts a hotspot Parquet export into compact, browser-friendly assets.
 *
 *   node scripts/prepare-data.mjs [source.parquet] [outDir]
 *
 * Defaults:
 *   source  C:/Users/ROG/Downloads/Telegram Desktop/fires_final.parquet
 *   outDir  public/data
 *
 * Outputs:
 *   hotspots.bin   column-oriented typed arrays (see hotspots.json for the layout)
 *   hotspots.json  dictionaries, byte offsets, totals, coverage metadata
 *
 * The browser loads these in a single fetch each and rebuilds typed arrays with
 * zero parsing cost, which is what makes 2.7M rows usable on the client.
 */
import fs from "node:fs";
import path from "node:path";
import { asyncBufferFromFile, parquetMetadataAsync, parquetRead } from "hyparquet";

const DEFAULT_SOURCE = "C:/Users/ROG/Downloads/Telegram Desktop/fires_final.parquet";
const source = process.argv[2] ?? DEFAULT_SOURCE;
const outDir = path.resolve(process.argv[3] ?? "public/data");

if (!fs.existsSync(source)) {
  console.error(`Parquet file not found: ${source}`);
  process.exit(1);
}

const file = await asyncBufferFromFile(source);
const metadata = await parquetMetadataAsync(file);
const rows = Number(metadata.num_rows);
console.log(`Reading ${rows.toLocaleString()} rows from ${source}`);

const days = new Int32Array(rows);
const minutes = new Uint16Array(rows);
const lat = new Float32Array(rows);
const lng = new Float32Array(rows);
const frp = new Float32Array(rows);
const sensorIds = new Uint8Array(rows);
const satelliteIds = new Uint8Array(rows);
const provinceIds = new Uint8Array(rows);
const confidenceIds = new Uint8Array(rows);

const dictionaries = { sensors: [], satellites: [], provinces: [], confidences: [] };
const dictionaryIndex = {
  sensors: new Map(),
  satellites: new Map(),
  provinces: new Map(),
  confidences: new Map(),
};
function intern(kind, value) {
  const key = value ?? "Unknown";
  let id = dictionaryIndex[kind].get(key);
  if (id === undefined) {
    id = dictionaries[kind].length;
    dictionaries[kind].push(key);
    dictionaryIndex[kind].set(key, id);
  }
  return id;
}

const MS_PER_DAY = 86_400_000;

/**
 * The export stores VIIRS satellites and confidences in a compressed form
 * ("N", "n", "h"). Expand them to the vocabulary the specification uses so the
 * UI can show readable labels.
 */
function labelSatellite(value) {
  const key = value == null ? "Unknown" : String(value);
  if (key === "N") return "SNPP";
  return key;
}
function labelConfidence(value) {
  const key = value == null ? "unknown" : String(value).toLowerCase();
  if (key === "l" || key === "low") return "low";
  if (key === "n" || key === "nominal") return "nominal";
  if (key === "h" || key === "high") return "high";
  return key;
}

let copied = 0;
const chunkErrors = [];

await parquetRead({
  file,
  metadata,
  columns: [
    "sensor",
    "satellite",
    "date",
    "timestamp_utc",
    "latitude",
    "longitude",
    "frp_mw",
    "confidence",
    "province",
  ],
  rowFormat: "array",
  onChunk: (chunk) => {
    try {
      handleChunk(chunk);
    } catch (error) {
      chunkErrors.push(error);
      console.error("chunk failed", chunk.columnName, error);
    }
  },
});

if (chunkErrors.length) throw chunkErrors[0];

function handleChunk(chunk) {
  {
    const data = chunk.columnData;
    const start = Math.max(0, chunk.rowStart);
    const length = Math.min(data.length, rows - start);
    if (length <= 0) return;

    switch (chunk.columnName) {
      case "sensor":
        for (let i = 0; i < length; i++) sensorIds[start + i] = intern("sensors", data[i]);
        copied++;
        break;
      case "satellite":
        for (let i = 0; i < length; i++) satelliteIds[start + i] = intern("satellites", labelSatellite(data[i]));
        break;
      case "province":
        for (let i = 0; i < length; i++) provinceIds[start + i] = intern("provinces", data[i]);
        break;
      case "confidence":
        for (let i = 0; i < length; i++) confidenceIds[start + i] = intern("confidences", labelConfidence(data[i]));
        break;
      case "date":
        for (let i = 0; i < length; i++) {
          const value = data[i];
          days[start + i] =
            value instanceof Date ? Math.round(value.getTime() / MS_PER_DAY) : Math.round(Number(value));
        }
        break;
      case "timestamp_utc":
        for (let i = 0; i < length; i++) {
          const value = data[i];
          const date = value instanceof Date ? value : new Date(Number(value) / 1000);
          minutes[start + i] = date.getUTCHours() * 60 + date.getUTCMinutes();
        }
        break;
      case "latitude":
        for (let i = 0; i < length; i++) lat[start + i] = data[i] ?? Number.NaN;
        break;
      case "longitude":
        for (let i = 0; i < length; i++) lng[start + i] = data[i] ?? Number.NaN;
        break;
      case "frp_mw":
        for (let i = 0; i < length; i++) frp[start + i] = data[i] ?? 0;
        break;
      default:
        break;
    }
  }
}

if (copied === 0) throw new Error("sensor column was not read");

// --- packing -------------------------------------------------------------
const blocks = [
  ["day", days],
  ["minute", minutes],
  ["lat", lat],
  ["lng", lng],
  ["frp", frp],
  ["sensor", sensorIds],
  ["satellite", satelliteIds],
  ["province", provinceIds],
  ["confidence", confidenceIds],
];

const parts = [];
const layout = {};
let offset = 0;
for (const [name, array] of blocks) {
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  layout[name] = { offset, length: array.length, bytes: array.byteLength };
  parts.push(bytes);
  offset += array.byteLength;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) {
    parts.push(Buffer.alloc(pad));
    offset += pad;
  }
}

// --- coverage / totals ---------------------------------------------------
const byYear = new Map();
const byDay = new Map();
let minDay = Number.POSITIVE_INFINITY;
let maxDay = Number.NEGATIVE_INFINITY;
let maxFrp = 0;
let frpSum = 0;
for (let i = 0; i < rows; i++) {
  const day = days[i];
  if (day < minDay) minDay = day;
  if (day > maxDay) maxDay = day;
  const year = new Date(day * MS_PER_DAY).getUTCFullYear();
  byYear.set(year, (byYear.get(year) ?? 0) + 1);
  byDay.set(day, (byDay.get(day) ?? 0) + 1);
  const value = frp[i];
  frpSum += value;
  if (value > maxFrp) maxFrp = value;
}

const iso = (day) => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
const manifest = {
  source: path.basename(source),
  sourceBytes: fs.statSync(source).size,
  generatedAt: new Date().toISOString(),
  rows,
  binary: "hotspots.bin",
  layout,
  dictionaries,
  coverage: {
    start: iso(minDay),
    end: iso(maxDay),
    days: byDay.size,
    startDay: minDay,
    endDay: maxDay,
  },
  frp: { max: Number(maxFrp.toFixed(1)), mean: Number((frpSum / rows).toFixed(2)) },
  byYear: Object.fromEntries([...byYear].sort((a, b) => a[0] - b[0])),
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "hotspots.bin"), Buffer.concat(parts, offset));
fs.writeFileSync(path.join(outDir, "hotspots.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log("dictionaries:", dictionaries);
console.log("coverage:", manifest.coverage);
console.log("byYear:", manifest.byYear);
console.log("frp:", manifest.frp);
console.log(
  `wrote ${path.join(outDir, "hotspots.bin")} (${(offset / 1024 / 1024).toFixed(1)} MB)`,
);
