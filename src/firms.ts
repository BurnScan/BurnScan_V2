/**
 * NASA FIRMS live feed client.
 *
 * Two transports, same payload:
 *
 * 1. Proxy (default, recommended) — same-origin `/api/firms/*`, served by the
 *    Vite dev/preview middleware in `vite.config.ts`. The MAP_KEY stays on the
 *    server and never reaches the browser.
 *
 * 2. Direct (static hosting only) — enabled when `VITE_FIRMS_MAP_KEY` is set at
 *    build time. The browser then calls FIRMS itself (their API sends
 *    `Access-Control-Allow-Origin: *`). The key is visible in the bundle, so
 *    use a dedicated, rotatable key for this mode.
 */
import {
  FIRMS_BASE,
  FIRMS_BBOX,
  FIRMS_MAX_DAYS,
  type LiveDetection,
  type LiveFeed,
  type LiveQuota,
  type SourceAvailability,
  parseAvailabilityCsv,
  parseFirmsCsv,
  sortDetections,
} from "./firmsCore";

export type { LiveDetection, LiveFeed, LiveQuota, SourceAvailability };

/** Datasets exposed in the UI. All are NRT (near real-time). */
export const LIVE_SOURCES = [
  { id: "VIIRS_NOAA20_NRT", label: "VIIRS NOAA-20", short: "NOAA-20" },
  { id: "VIIRS_NOAA21_NRT", label: "VIIRS NOAA-21", short: "NOAA-21" },
  { id: "VIIRS_SNPP_NRT", label: "VIIRS Suomi NPP", short: "Suomi NPP" },
  { id: "MODIS_NRT", label: "MODIS Terra / Aqua", short: "MODIS" },
] as const;

export const DEFAULT_LIVE_SOURCES = ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"];

/** Optional static-hosting fallback. Unset by default. */
const DIRECT_KEY = import.meta.env.VITE_FIRMS_MAP_KEY;
/** `true` when the page talks to FIRMS without the server proxy. */
export const DIRECT_MODE = Boolean(DIRECT_KEY);

class ProxyUnavailable extends Error {}

async function requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { signal });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ProxyUnavailable("Could not reach the live feed API.");
  }
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new ProxyUnavailable(
      response.status === 404
        ? "The live feed API is not available in this build."
        : `Unexpected response from the live feed API (HTTP ${response.status}).`,
    );
  }
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Live feed API error (HTTP ${response.status}).`;
    // A proxy that is present but has no key configured can still fall back.
    if (message.includes("FIRMS_MAP_KEY")) throw new ProxyUnavailable(message);
    throw new Error(message);
  }
  return payload as T;
}

function missingProxyMessage(error: unknown) {
  return (
    (error instanceof ProxyUnavailable
      ? `${error.message} Run \`npm run dev\` or \`npm run preview\` so the FIRMS proxy is active, or set VITE_FIRMS_MAP_KEY to query FIRMS directly from the browser.`
      : "") || (error instanceof Error ? error.message : String(error))
  );
}

async function directGet(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  const text = await response.text();
  if (!response.ok) throw new Error(`FIRMS HTTP ${response.status}: ${text.slice(0, 160)}`);
  return text;
}

async function directFeed(days: number, sources: string[], signal?: AbortSignal): Promise<LiveFeed> {
  if (!DIRECT_KEY) throw new Error(missingProxyMessage(new ProxyUnavailable("Live feed unavailable.")));
  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const text = await directGet(
        `${FIRMS_BASE}/api/area/csv/${DIRECT_KEY}/${source}/${FIRMS_BBOX}/${days}`,
        signal,
      );
      return parseFirmsCsv(text, source);
    }),
  );
  const detections: LiveDetection[] = [];
  const errors: { source: string; message: string }[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") detections.push(...result.value);
    else errors.push({ source: sources[index], message: String(result.reason).slice(0, 300) });
  });
  return {
    fetchedAt: new Date().toISOString(),
    days,
    sources,
    bbox: FIRMS_BBOX.split(",").map(Number),
    detections: sortDetections(detections),
    errors,
  };
}

export async function fetchLiveFeed(days: number, sources: string[], signal?: AbortSignal) {
  const bounded = Math.min(FIRMS_MAX_DAYS, Math.max(1, Math.round(days) || 1));
  // Static deployments configure a public key, so talk to FIRMS directly and
  // skip the guaranteed 404 against /api/firms.
  if (DIRECT_KEY) return directFeed(bounded, sources, signal);
  const query = new URLSearchParams({ days: String(bounded), sources: sources.join(",") });
  try {
    return await requestJson<LiveFeed>(`/api/firms/hotspots?${query.toString()}`, signal);
  } catch (error) {
    throw new Error(missingProxyMessage(error));
  }
}

export async function fetchLiveQuota(signal?: AbortSignal): Promise<LiveQuota> {
  if (DIRECT_KEY) {
    const text = await directGet(
      `${FIRMS_BASE}/mapserver/mapkey_status/?MAP_KEY=${DIRECT_KEY}`,
      signal,
    );
    return JSON.parse(text) as LiveQuota;
  }
  try {
    return await requestJson<LiveQuota>("/api/firms/status", signal);
  } catch (error) {
    throw new Error(missingProxyMessage(error));
  }
}

export async function fetchAvailability(signal?: AbortSignal): Promise<SourceAvailability[]> {
  if (DIRECT_KEY) {
    const text = await directGet(`${FIRMS_BASE}/api/data_availability/csv/${DIRECT_KEY}/all`, signal);
    return parseAvailabilityCsv(text);
  }
  try {
    return await requestJson<SourceAvailability[]>("/api/firms/availability", signal);
  } catch (error) {
    throw new Error(missingProxyMessage(error));
  }
}

export function formatLiveDate(date: string) {
  if (!date) return "—";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
