/**
 * Server-side FIRMS proxy for Vercel Functions.
 *
 * Mirrors the middleware in `vite.config.ts` so the deployed app keeps the same
 * `/api/firms/*` contract while the MAP_KEY stays in server environment
 * variables. This module is Node-only; `src/firmsCore.ts` stays environment-free
 * and is shared with the browser client.
 */
import {
  FIRMS_BASE,
  FIRMS_BBOX,
  FIRMS_MAX_DAYS,
  FIRMS_SOURCES,
  parseAvailabilityCsv,
  parseFirmsCsv,
  sortDetections,
  type LiveDetection,
} from "../firmsCore.js";
import dns from "node:dns";
import net from "node:net";

// Some hosts advertise an unroutable IPv6 route, which makes Node's Happy
// Eyeballs connect stall. NASA FIRMS is reachable over IPv4 everywhere.
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

const HOTSPOTS_TTL_MS = 60_000;
const STATUS_TTL_MS = 30_000;
const AVAILABILITY_TTL_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 20_000;

const HOTSPOTS_CACHE = "public, s-maxage=60, stale-while-revalidate=300";
const STATUS_CACHE = "public, s-maxage=30, stale-while-revalidate=120";
const AVAILABILITY_CACHE = "public, s-maxage=600, stale-while-revalidate=3600";

/** Best-effort in-memory cache; Vercel's CDN cache is the real shared cache. */
const cache = new Map<string, { expires: number; value: unknown }>();

function mapKey() {
  return process.env.FIRMS_MAP_KEY ?? "";
}

function json(payload: unknown, status = 200, cacheControl = "no-store") {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function missingKey() {
  return json(
    {
      error:
        "FIRMS_MAP_KEY is not configured. Add it to the Vercel project environment variables (server-side, no VITE_ prefix).",
    },
    500,
  );
}

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  cache.set(key, { expires: Date.now() + ttlMs, value });
  return value;
}

async function getText(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const text = await response.text();
  if (!response.ok) throw new Error(`FIRMS HTTP ${response.status}: ${text.slice(0, 160)}`);
  return text;
}

function failure(error: unknown) {
  return json(
    { error: error instanceof Error ? error.message : "Upstream FIRMS request failed." },
    502,
  );
}

export async function hotspotsResponse(request: Request) {
  const key = mapKey();
  if (!key) return missingKey();

  const url = new URL(request.url);
  const days = Math.min(
    FIRMS_MAX_DAYS,
    Math.max(1, Number(url.searchParams.get("days") ?? "1") || 1),
  );
  const requested = (url.searchParams.get("sources") ?? FIRMS_SOURCES.join(","))
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
  const sources = requested.filter((source) => FIRMS_SOURCES.includes(source));
  if (!sources.length) {
    return json({ error: "No supported FIRMS sources were requested." }, 400);
  }

  try {
    const payload = await cached(`hotspots:${days}:${sources.join(",")}`, HOTSPOTS_TTL_MS, async () => {
      const settled = await Promise.allSettled(
        sources.map(async (source) => {
          const text = await getText(
            `${FIRMS_BASE}/api/area/csv/${key}/${source}/${FIRMS_BBOX}/${days}`,
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
      sortDetections(detections);
      return {
        fetchedAt: new Date().toISOString(),
        days,
        sources,
        bbox: FIRMS_BBOX.split(",").map(Number),
        detections,
        errors,
      };
    });
    return json(payload, 200, HOTSPOTS_CACHE);
  } catch (error) {
    return failure(error);
  }
}

export async function statusResponse() {
  const key = mapKey();
  if (!key) return missingKey();

  try {
    const payload = await cached("status", STATUS_TTL_MS, async () => {
      const text = await getText(`${FIRMS_BASE}/mapserver/mapkey_status/?MAP_KEY=${key}`);
      return JSON.parse(text) as Record<string, unknown>;
    });
    return json(payload, 200, STATUS_CACHE);
  } catch (error) {
    return failure(error);
  }
}

export async function availabilityResponse() {
  const key = mapKey();
  if (!key) return missingKey();

  try {
    const payload = await cached("availability", AVAILABILITY_TTL_MS, async () => {
      const text = await getText(`${FIRMS_BASE}/api/data_availability/csv/${key}/all`);
      return parseAvailabilityCsv(text);
    });
    return json(payload, 200, AVAILABILITY_CACHE);
  } catch (error) {
    return failure(error);
  }
}
