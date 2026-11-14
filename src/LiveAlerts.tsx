import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import MapView, { type Basemap, type MapPoint } from "./MapView";
import {
  DEFAULT_LIVE_SOURCES,
  DIRECT_MODE,
  LIVE_SOURCES,
  fetchAvailability,
  fetchLiveFeed,
  fetchLiveQuota,
  formatLiveDate,
  type LiveDetection,
  type LiveFeed,
  type LiveQuota,
  type SourceAvailability,
} from "./firms";

/** 0.1° aggregation grid, matching the historical archive map. */
const CELL_SIZE = 0.1;
const CELL_LAT_MIN = 9;
const CELL_LNG_MIN = 101;
const CELL_LAT_COUNT = 80;
const CELL_LNG_COUNT = 90;
/** Above this many detections the map switches to aggregated cells. */
const INDIVIDUAL_LIMIT = 700;
const CELL_ID_OFFSET = 100_000;
const REFRESH_MS = 5 * 60_000;

type LiveCell = {
  id: number;
  lat: number;
  lng: number;
  count: number;
  modis: number;
  viirs: number;
  sensor: "MODIS" | "VIIRS";
  maxFrp: number;
  satellites: string[];
  first: string;
  last: string;
  top: LiveDetection;
};

type Selection =
  | { kind: "detection"; detection: LiveDetection }
  | { kind: "cell"; cell: LiveCell }
  | null;

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function shortDate(iso: string) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = months[Number(month) - 1] ?? month;
  const currentYear = String(new Date().getFullYear());
  return `${day} ${label}${year && year !== currentYear ? ` ${year}` : ""}`;
}

function sourceLabel(id: string) {
  return LIVE_SOURCES.find((source) => source.id === id)?.short ?? id;
}

function cellIdFor(detection: LiveDetection) {
  const latCell = Math.floor((detection.lat - CELL_LAT_MIN) / CELL_SIZE);
  const lngCell = Math.floor((detection.lng - CELL_LNG_MIN) / CELL_SIZE);
  if (latCell < 0 || latCell >= CELL_LAT_COUNT || lngCell < 0 || lngCell >= CELL_LNG_COUNT) return null;
  return CELL_ID_OFFSET + latCell * CELL_LNG_COUNT + lngCell;
}

function buildCells(detections: LiveDetection[]): LiveCell[] {
  const size = CELL_LAT_COUNT * CELL_LNG_COUNT;
  const count = new Int32Array(size);
  const modis = new Int32Array(size);
  const top = new Array<LiveDetection | null>(size).fill(null);
  const satellites: string[][] = Array.from({ length: size }, () => [] as string[]);
  const first = new Array<string>(size).fill("");
  const last = new Array<string>(size).fill("");

  for (const detection of detections) {
    const id = cellIdFor(detection);
    if (id === null) continue;
    const cell = id - CELL_ID_OFFSET;
    count[cell] += 1;
    if (detection.sensor === "MODIS") modis[cell] += 1;
    if (satellites[cell].length < 4 && !satellites[cell].includes(detection.satellite)) {
      satellites[cell].push(detection.satellite);
    }
    const stamp = `${detection.date} ${detection.time}`;
    if (!first[cell] || stamp < first[cell]) first[cell] = stamp;
    if (!last[cell] || stamp > last[cell]) last[cell] = stamp;
    if (!top[cell] || detection.frp > top[cell]!.frp) top[cell] = detection;
  }

  const cells: LiveCell[] = [];
  for (let cell = 0; cell < size; cell++) {
    if (count[cell] === 0 || !top[cell]) continue;
    const latCell = Math.floor(cell / CELL_LNG_COUNT);
    const lngCell = cell % CELL_LNG_COUNT;
    cells.push({
      id: CELL_ID_OFFSET + cell,
      lat: CELL_LAT_MIN + (latCell + 0.5) * CELL_SIZE,
      lng: CELL_LNG_MIN + (lngCell + 0.5) * CELL_SIZE,
      count: count[cell],
      modis: modis[cell],
      viirs: count[cell] - modis[cell],
      sensor: modis[cell] * 2 >= count[cell] ? "MODIS" : "VIIRS",
      maxFrp: Math.round(top[cell]!.frp * 10) / 10,
      satellites: satellites[cell],
      first: first[cell],
      last: last[cell],
      top: top[cell]!,
    });
  }
  cells.sort((a, b) => b.count - a.count);
  return cells;
}

export default function LiveAlerts() {
  const [days, setDays] = useState(2);
  const [sources, setSources] = useState<string[]>([...DEFAULT_LIVE_SOURCES]);
  const [feed, setFeed] = useState<LiveFeed | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [quota, setQuota] = useState<LiveQuota | null>(null);
  const [availability, setAvailability] = useState<Record<string, SourceAvailability>>({});
  const [selection, setSelection] = useState<Selection>(null);
  const [auto, setAuto] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [showBoundaries, setShowBoundaries] = useState(true);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const next = await fetchLiveFeed(days, sources);
      if (requestRef.current !== request) return;
      setFeed(next);
      setUpdatedAt(new Date(next.fetchedAt));
      setSelection(null);
      if (next.errors.length > 0) {
        setError(next.errors.map((entry) => `${sourceLabel(entry.source)}: ${entry.message}`).join(" · "));
      }
      fetchLiveQuota()
        .then(setQuota)
        .catch(() => undefined);
    } catch (cause) {
      if (requestRef.current !== request) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }, [days, sources]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [auto, load]);

  useEffect(() => {
    fetchAvailability()
      .then((rows) => setAvailability(Object.fromEntries(rows.map((row) => [row.data_id, row]))))
      .catch(() => undefined);
  }, []);

  const toggleSource = (id: string) => {
    setSources((current) => {
      if (current.includes(id)) return current.length === 1 ? current : current.filter((item) => item !== id);
      return [...current, id];
    });
  };

  const detections = feed?.detections ?? [];
  const aggregated = detections.length > INDIVIDUAL_LIMIT;
  const cells = useMemo(() => (aggregated ? buildCells(detections) : []), [aggregated, detections]);
  const detectionIndex = useMemo(
    () => new Map(detections.map((detection, index) => [detection.id, index])),
    [detections],
  );

  const points = useMemo<MapPoint[]>(() => {
    if (!aggregated) {
      return detections.map((detection, index) => ({
        id: index,
        lat: detection.lat,
        lng: detection.lng,
        sensor: detection.sensor,
        province: detection.satellite,
        label: `${detection.satellite} · ${detection.confidence}`,
      }));
    }
    return cells.map((cell) => ({
      id: cell.id,
      lat: cell.lat,
      lng: cell.lng,
      sensor: cell.sensor,
      province: cell.satellites[0] ?? "Mixed",
      count: cell.count,
      label: `${formatCount(cell.count)} detections · peak ${cell.maxFrp} MW`,
    }));
  }, [aggregated, cells, detections]);

  const selectedId =
    selection === null
      ? null
      : selection.kind === "cell"
        ? selection.cell.id
        : (detectionIndex.get(selection.detection.id) ?? null);

  const selectPoint = useCallback(
    (point: MapPoint) => {
      if (aggregated) {
        const cell = cells.find((entry) => entry.id === point.id);
        if (cell) setSelection({ kind: "cell", cell });
        return;
      }
      const detection = detections[point.id];
      if (detection) setSelection({ kind: "detection", detection });
    },
    [aggregated, cells, detections],
  );

  const focusDetection = (detection: LiveDetection) => {
    if (!aggregated) {
      setSelection({ kind: "detection", detection });
      return;
    }
    const id = cellIdFor(detection);
    const cell = id === null ? undefined : cells.find((entry) => entry.id === id);
    if (cell) setSelection({ kind: "cell", cell });
  };

  const satellites = new Set(detections.map((detection) => detection.satellite)).size;
  const maxFrp = detections.reduce((max, detection) => Math.max(max, detection.frp), 0);
  const latest = detections[0];
  const updatedLabel = updatedAt
    ? updatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";
  const quotaLabel = quota?.transaction_limit
    ? `${quota.current_transactions ?? 0} / ${formatCount(quota.transaction_limit)} calls`
    : "";

  const appliedSources = LIVE_SOURCES.filter((source) => sources.includes(source.id))
    .map((source) => source.short)
    .join(" + ");

  return (
    <div className="page map-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Near real-time · NASA FIRMS</span>
          <div className="title-row">
            <h1>Live Fire Alerts</h1>
            <span className="demo-badge">
              <span /> {aggregated ? `${formatCount(cells.length)} cells` : `${formatCount(detections.length)} detections`}
            </span>
          </div>
          <p>
            {formatCount(detections.length)} detections from {appliedSources || "no sources"} in the last {days}{" "}
            day{days > 1 ? "s" : ""} · updated {updatedLabel}
          </p>
        </div>
        <button className="download" onClick={() => void load()} disabled={loading}>
          <Icon name="flame" size={16} /> {loading ? "Refreshing…" : "Refresh feed"}
        </button>
      </header>

      <section className="map-card">
        <div className="map-canvas">
          <button
            className="map-sheet-toggle"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
          >
            <Icon name="flame" size={15} /> Feed <b>{formatCount(detections.length)}</b>
          </button>

          <div className={`map-filters ${filtersOpen ? "open" : ""}`}>
            <h2>
              <Icon name="satellite" size={18} /> Live feed
            </h2>
            <div className="country-lock">
              <Icon name="map" size={15} /> Cambodia <span>Locked</span>
            </div>

            <div className="live-sources">
              <strong>Satellites</strong>
              {LIVE_SOURCES.map((option) => {
                const info = availability[option.id];
                const checked = sources.includes(option.id);
                return (
                  <label key={option.id} className={`live-source ${checked ? "on" : ""}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSource(option.id)} />
                    <span>{option.label}</span>
                    <em>{info ? `to ${shortDate(info.max_date)}` : ""}</em>
                  </label>
                );
              })}
            </div>

            <label className="field">
              <span>Period</span>
              <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    Last {value} day{value > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="filter-actions">
              <button className="primary" onClick={() => void load()} disabled={loading}>
                {loading ? "Refreshing…" : "Refresh"}
              </button>
              <button className="text-button" onClick={() => setAuto((value) => !value)}>
                {auto ? "Auto on" : "Auto off"}
              </button>
            </div>

            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}

            <p className="live-meta">
              {quotaLabel ? <b>{quotaLabel}</b> : null}
              {quotaLabel ? " · " : null}
              {auto ? "auto-refresh every 5 min" : "manual refresh"}
              {DIRECT_MODE ? " · direct NASA API" : ""}
            </p>
            <p className="live-meta">
              NRT data covers the last {5} days. Times are shown in Cambodia time (ICT).
            </p>
          </div>

          <div className="sensor-key">
            <span>
              <i className="modis-dot" /> MODIS
            </span>
            <span>
              <i className="viirs-dot" /> VIIRS
            </span>
          </div>

          <div className="basemap-toggle">
            <button className={basemap === "terrain" ? "active" : ""} onClick={() => setBasemap("terrain")}>
              Terrain
            </button>
            <button className={basemap === "satellite" ? "active" : ""} onClick={() => setBasemap("satellite")}>
              Satellite
            </button>
          </div>

          <MapView
            points={points}
            selectedId={selectedId}
            onSelect={selectPoint}
            basemap={basemap}
            showBoundaries={showBoundaries}
            showProtected={false}
          />

          {!loading && detections.length === 0 && (
            <div className="empty">
              <Icon name="satellite" size={28} />
              <strong>No live detections in this window</strong>
              <span>Try widening the period, enabling another satellite, or refreshing.</span>
            </div>
          )}

          <div className="map-source">
            Source: NASA FIRMS NRT · {appliedSources || "no sources"} · times in ICT
          </div>
        </div>

        <aside className={`detail-panel ${selection ? "open" : ""}`}>
          {selection?.kind === "detection" && (
            <>
              <button className="close" onClick={() => setSelection(null)} aria-label="Close details">
                <Icon name="close" />
              </button>
              <span className="eyebrow">Live detection</span>
              <h2>{selection.detection.satellite}</h2>
              <div className="detail-time">
                {formatLiveDate(selection.detection.date)} at {selection.detection.time} ICT
              </div>
              <dl>
                <div>
                  <dt>Sensor</dt>
                  <dd>{selection.detection.sensor}</dd>
                </div>
                <div>
                  <dt>Source confidence</dt>
                  <dd>{selection.detection.confidence}</dd>
                </div>
                <div>
                  <dt>Coordinates</dt>
                  <dd>
                    {selection.detection.lat.toFixed(4)}, {selection.detection.lng.toFixed(4)}
                  </dd>
                </div>
                <div>
                  <dt>Brightness</dt>
                  <dd>{selection.detection.brightness.toFixed(1)} K</dd>
                </div>
                <div>
                  <dt>Day / night</dt>
                  <dd>{selection.detection.daynight || "—"}</dd>
                </div>
                <div>
                  <dt>Dataset</dt>
                  <dd>{selection.detection.source}</dd>
                </div>
                <div className="frp">
                  <dt>Fire radiative power</dt>
                  <dd>
                    {selection.detection.frp.toFixed(1)} <small>MW</small>
                  </dd>
                </div>
              </dl>
              <p className="definition">
                <Icon name="info" size={15} /> Near real-time detection from NASA FIRMS. FRP is radiant
                energy at observation time, not a measure of fire size.
              </p>
            </>
          )}

          {selection?.kind === "cell" && (
            <>
              <button className="close" onClick={() => setSelection(null)} aria-label="Close details">
                <Icon name="close" />
              </button>
              <span className="eyebrow">Live cluster</span>
              <h2>{formatCount(selection.cell.count)} detections</h2>
              <div className="detail-time">
                {selection.cell.first.slice(0, 10) === selection.cell.last.slice(0, 10)
                  ? formatLiveDate(selection.cell.first.slice(0, 10))
                  : `${formatLiveDate(selection.cell.first.slice(0, 10))} – ${formatLiveDate(
                      selection.cell.last.slice(0, 10),
                    )}`}
              </div>
              <dl>
                <div>
                  <dt>Sensor mix</dt>
                  <dd>
                    {formatCount(selection.cell.modis)} MODIS · {formatCount(selection.cell.viirs)} VIIRS
                  </dd>
                </div>
                <div>
                  <dt>Satellites</dt>
                  <dd>{selection.cell.satellites.join(", ")}</dd>
                </div>
                <div>
                  <dt>Cell centre</dt>
                  <dd>
                    {selection.cell.lat.toFixed(3)}, {selection.cell.lng.toFixed(3)}
                  </dd>
                </div>
                <div>
                  <dt>Peak FRP</dt>
                  <dd>
                    {selection.cell.maxFrp} <small>MW</small>
                  </dd>
                </div>
                <div>
                  <dt>Strongest detection</dt>
                  <dd>
                    {formatLiveDate(selection.cell.top.date)} at {selection.cell.top.time}
                  </dd>
                </div>
                <div className="frp">
                  <dt>Fire radiative power</dt>
                  <dd>
                    {selection.cell.top.frp.toFixed(1)} <small>MW</small>
                  </dd>
                </div>
              </dl>
              <p className="definition">
                <Icon name="info" size={15} /> Collapsed into 0.1° cells because this window has more than{" "}
                {formatCount(INDIVIDUAL_LIMIT)} individual detections.
              </p>
            </>
          )}

          {!selection && (
            <div className="detail-placeholder">
              <div className="radar">
                <span />
              </div>
              <h2>Select a detection</h2>
              <p>Choose any marker to inspect the live observation details.</p>
            </div>
          )}
        </aside>

        <aside className="map-summary">
          <h2>
            <Icon name="flame" size={17} /> Live summary
          </h2>
          <div>
            <span>Detections</span>
            <strong>{formatCount(detections.length)}</strong>
          </div>
          <div>
            <span>Satellites</span>
            <strong>{satellites}</strong>
          </div>
          <div>
            <span>Peak FRP</span>
            <strong>{maxFrp ? `${maxFrp.toFixed(1)} MW` : "—"}</strong>
          </div>
          <div>
            <span>Latest pass</span>
            <strong>{latest ? `${formatLiveDate(latest.date)} ${latest.time}` : "—"}</strong>
          </div>
          <span className="demo-badge">
            <span /> NASA FIRMS NRT
          </span>
        </aside>
      </section>

      <div className="live-table">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Latest detections</h2>
              <p>Most recent acquisitions in the applied window</p>
            </div>
            <span className="illustrative">Live</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time (ICT)</th>
                  <th>Date</th>
                  <th>Satellite</th>
                  <th>Sensor</th>
                  <th>Confidence</th>
                  <th>FRP</th>
                  <th>Coordinates</th>
                </tr>
              </thead>
              <tbody>
                {detections.slice(0, 25).map((detection) => (
                  <tr key={detection.id} onClick={() => focusDetection(detection)}>
                    <td>{detection.time}</td>
                    <td>{formatLiveDate(detection.date)}</td>
                    <td>{detection.satellite}</td>
                    <td>{detection.sensor}</td>
                    <td>{detection.confidence}</td>
                    <td>
                      <strong>{detection.frp.toFixed(1)} MW</strong>
                    </td>
                    <td>
                      {detection.lat.toFixed(3)}, {detection.lng.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!detections.length && <div className="empty-mini">No detections to list.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
