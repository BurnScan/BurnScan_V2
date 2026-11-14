import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView, { type Basemap, type MapPoint } from "./MapView";
import Icon from "./Icon";
import LiveAlerts from "./LiveAlerts";
import {
  loadDataset,
  type Count,
  type Dataset,
  type Filters,
  type FilterResult,
  type LoadProgress,
  type MapCell,
} from "./dataset";

type Page = "map" | "live" | "dashboard" | "calendar" | "comparison" | "anomaly";

const defaultFilters: Filters = {
  province: "All provinces",
  sensor: "All sensors",
  satellite: "All satellites",
  start: "",
  end: "",
};

function toISO(value: string) {
  if (!value) return "";
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo}-${d}`;
  const parsed = new Date(`${iso}T00:00:00`);
  return parsed.getFullYear() === +y && parsed.getMonth() + 1 === +mo && parsed.getDate() === +d
    ? iso
    : null;
}
function toDisplay(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function formatDate(iso: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}
function formatCount(value: number) {
  return value.toLocaleString("en-US");
}
function formatCompact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
function dateError(filters: Filters) {
  const start = toISO(filters.start);
  const end = toISO(filters.end);
  if ((filters.start && !start) || (filters.end && !end))
    return "Enter dates in DD/MM/YYYY format.";
  if (start && end && end < start) return "End date cannot be earlier than start date.";
  return "";
}
function appliedRange(filters: Filters) {
  return filters.start || filters.end
    ? `${filters.start || "Earliest"} – ${filters.end || "Latest"}`
    : "All available dates";
}

function FilterField({
  label,
  value,
  onChange,
  options,
  locked,
  allSensorLabel = "All sensors",
  min,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  options?: string[];
  locked?: boolean;
  allSensorLabel?: string;
  min?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {options ? (
        <select value={value} onChange={(e) => onChange?.(e.target.value)} disabled={locked}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o === "All sensors" ? allSensorLabel : o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="date"
          value={toISO(value) || ""}
          onChange={(e) => onChange?.(toDisplay(e.target.value))}
          aria-label={`${label}, DD/MM/YYYY`}
          min={min}
          disabled={locked}
        />
      )}
    </label>
  );
}

function FilterBar({
  dataset,
  pending,
  setPending,
  apply,
  reset,
  showProvince = false,
  country = false,
  allSensorLabel = "All sensors",
  error,
}: {
  dataset: Dataset;
  pending: Filters;
  setPending: (f: Filters) => void;
  apply: () => void;
  reset: () => void;
  showProvince?: boolean;
  country?: boolean;
  allSensorLabel?: string;
  error: string;
}) {
  const sensorChange = (sensor: string) =>
    setPending({ ...pending, sensor, satellite: "All satellites" });
  return (
    <div className="filter-wrap">
      <div className="filter-grid">
        {country && <FilterField label="Country" value="Cambodia" options={["Cambodia"]} locked />}
        {showProvince && (
          <FilterField
            label="Province"
            value={pending.province}
            options={["All provinces", ...dataset.provinces]}
            onChange={(province) => setPending({ ...pending, province })}
          />
        )}
        <FilterField
          label="Sensor"
          value={pending.sensor}
          options={["All sensors", ...dataset.sensors]}
          onChange={sensorChange}
          allSensorLabel={allSensorLabel}
        />
        <FilterField
          label="Satellite"
          value={pending.satellite}
          options={dataset.satellitesFor(pending.sensor)}
          onChange={(satellite) => setPending({ ...pending, satellite })}
        />
        <FilterField
          label="Start date"
          value={pending.start}
          onChange={(start) => setPending({ ...pending, start })}
        />
        <FilterField
          label="End date"
          value={pending.end}
          onChange={(end) => setPending({ ...pending, end })}
          min={toISO(pending.start) || undefined}
        />
        <div className="filter-actions">
          <button className="primary" onClick={apply}>
            Apply filters
          </button>
          <button className="text-button" onClick={reset}>
            Reset
          </button>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function Badge({ label = "Full archive" }: { label?: string }) {
  return (
    <span className="demo-badge">
      <span /> {label}
    </span>
  );
}
function DownloadButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="download" onClick={onClick}>
      <Icon name="download" size={16} /> Download CSV
    </button>
  );
}

function Splash({ progress, error }: { progress: LoadProgress | null; error: string }) {
  const percent =
    progress && progress.total
      ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
      : null;
  return (
    <div className="splash">
      <div className="splash-card">
        <div className="brand-mark">
          <Icon name="flame" size={28} />
        </div>
        <strong>BurnScan</strong>
        <small>Cambodia hotspot archive</small>
        {error ? (
          <p className="splash-error">{error}</p>
        ) : (
          <>
            <p>
              {percent === null
                ? "Loading the satellite hotspot archive…"
                : `Loading ${formatCount(Math.round(progress!.loaded / 1_048_576))} of ${formatCount(
                    Math.round(progress!.total / 1_048_576),
                  )} MB of observations · ${percent}%`}
            </p>
            <div className="splash-bar">
              <i style={{ width: `${percent ?? 10}%` }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState<Page>("map");
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [loadError, setLoadError] = useState("");
  const lastPercent = useRef(-1);

  const [mapPending, setMapPending] = useState(defaultFilters);
  const [mapApplied, setMapApplied] = useState(defaultFilters);
  const [dashPending, setDashPending] = useState(defaultFilters);
  const [dashApplied, setDashApplied] = useState(defaultFilters);
  const [calPending, setCalPending] = useState(defaultFilters);
  const [calApplied, setCalApplied] = useState(defaultFilters);
  const [comparisonPending, setComparisonPending] = useState(defaultFilters);
  const [comparisonApplied, setComparisonApplied] = useState(defaultFilters);
  const [anomalyPending, setAnomalyPending] = useState(defaultFilters);
  const [anomalyApplied, setAnomalyApplied] = useState(defaultFilters);
  const [errors, setErrors] = useState<Record<Page, string>>({
    map: "",
    live: "",
    dashboard: "",
    calendar: "",
    comparison: "",
    anomaly: "",
  });
  const [loading, setLoading] = useState<Record<Page, boolean>>({
    map: false,
    live: false,
    dashboard: false,
    calendar: false,
    comparison: false,
    anomaly: false,
  });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadDataset((next) => {
      if (cancelled) return;
      const percent = next.total ? Math.round((next.loaded / next.total) * 100) : -1;
      if (percent === lastPercent.current) return;
      lastPercent.current = percent;
      setProgress(next);
    })
      .then((loaded) => {
        if (cancelled) return;
        setDataset(loaded);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const navigateMap = (patch: Partial<Filters>) => {
    const next = { ...defaultFilters, ...patch };
    setMapPending(next);
    setMapApplied(next);
    setPage("map");
  };
  const apply = (key: Page, pending: Filters, setApplied: (f: Filters) => void) => {
    const message = dateError(pending);
    setErrors((e) => ({ ...e, [key]: message }));
    if (!message) {
      setLoading((current) => ({ ...current, [key]: true }));
      window.setTimeout(() => {
        setApplied(pending);
        setLoading((current) => ({ ...current, [key]: false }));
      }, 320);
    }
  };
  const reset = (key: Page, setPending: (f: Filters) => void, setApplied: (f: Filters) => void) => {
    setPending(defaultFilters);
    setApplied(defaultFilters);
    setErrors((e) => ({ ...e, [key]: "" }));
  };
  const exportCsv = (filters: Filters, filename: string) => {
    if (!dataset) return;
    const { csv, exported, total, sampled } = dataset.exportCsv(filters);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(
      sampled
        ? `${formatCount(exported)} of ${formatCount(total)} matching records exported (evenly sampled)`
        : `${formatCount(exported)} hotspot records exported`,
    );
    window.setTimeout(() => setNotice(""), 3200);
  };

  if (!dataset) {
    return (
      <Splash
        progress={progress}
        error={
          loadError
            ? `${loadError}`
            : ""
        }
      />
    );
  }

  const nav = [
    ["map", "Fire Alerts Interactive Map", "map", "Map"],
    ["live", "Live Fire Alerts", "satellite", "Live"],
    ["dashboard", "Dashboard", "dashboard", "Overview"],
    ["calendar", "Activity Calendar", "calendar", "Calendar"],
    ["comparison", "Sensor Comparison", "compare", "Compare"],
    ["anomaly", "Anomaly Detection", "anomaly", "Anomaly"],
  ] as const;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="flame" size={25} />
          </div>
          <div>
            <strong>BurnScan</strong>
            <small>Cambodia hotspot archive</small>
          </div>
        </div>
        <nav aria-label="Primary navigation">
          {nav.map(([key, label, icon, short]) => (
            <button key={key} className={page === key ? "active" : ""} onClick={() => setPage(key)}>
              <Icon name={icon} />
              <span className="nav-long">{label}</span>
              <span className="nav-short">{short}</span>
              {page === key && <Icon name="chevron" size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="eyebrow">About this dataset</span>
          <p>Hotspots are satellite observations, not unique fires or burned area.</p>
          <span className="source">
            {formatCount(dataset.size)} detections · {dataset.manifest.coverage.start.slice(0, 4)}–
            {dataset.manifest.coverage.end.slice(0, 4)}
          </span>
        </div>
      </aside>
      <main>
        {loading[page] && (
          <div className="loading-bar" role="status">
            <span /> Updating filtered results…
          </div>
        )}
        {page === "map" && (
          <MapPage
            dataset={dataset}
            pending={mapPending}
            applied={mapApplied}
            setPending={setMapPending}
            error={errors.map}
            apply={() => apply("map", mapPending, setMapApplied)}
            reset={() => reset("map", setMapPending, setMapApplied)}
            download={() => exportCsv(mapApplied, "burnscan-map-hotspots.csv")}
          />
        )}
        {page === "live" && <LiveAlerts />}
        {page === "dashboard" && (
          <Dashboard
            dataset={dataset}
            pending={dashPending}
            applied={dashApplied}
            setPending={setDashPending}
            error={errors.dashboard}
            apply={() => apply("dashboard", dashPending, setDashApplied)}
            reset={() => reset("dashboard", setDashPending, setDashApplied)}
            download={() => exportCsv(dashApplied, "burnscan-dashboard-hotspots.csv")}
            navigateMap={navigateMap}
          />
        )}
        {page === "calendar" && (
          <CalendarPage
            dataset={dataset}
            pending={calPending}
            applied={calApplied}
            setPending={setCalPending}
            error={errors.calendar}
            apply={() => apply("calendar", calPending, setCalApplied)}
            reset={() => reset("calendar", setCalPending, setCalApplied)}
            navigateMap={navigateMap}
          />
        )}
        {page === "comparison" && (
          <Comparison
            dataset={dataset}
            pending={comparisonPending}
            applied={comparisonApplied}
            setPending={setComparisonPending}
            error={errors.comparison}
            apply={() => apply("comparison", comparisonPending, setComparisonApplied)}
            reset={() => reset("comparison", setComparisonPending, setComparisonApplied)}
            download={() => exportCsv(comparisonApplied, "burnscan-sensor-comparison.csv")}
          />
        )}
        {page === "anomaly" && (
          <AnomalyDetection
            dataset={dataset}
            pending={anomalyPending}
            applied={anomalyApplied}
            setPending={setAnomalyPending}
            error={errors.anomaly}
            apply={() => apply("anomaly", anomalyPending, setAnomalyApplied)}
            reset={() => reset("anomaly", setAnomalyPending, setAnomalyApplied)}
            navigateMap={navigateMap}
          />
        )}
      </main>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  badge,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  badge?: string;
}) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <div className="title-row">
          <h1>{title}</h1>
          <Badge label={badge} />
        </div>
        <p>{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

function MapPage({
  dataset,
  pending,
  applied,
  setPending,
  apply,
  reset,
  download,
  error,
}: {
  dataset: Dataset;
  pending: Filters;
  applied: Filters;
  setPending: (f: Filters) => void;
  apply: () => void;
  reset: () => void;
  download: () => void;
  error: string;
}) {
  const result = useMemo(() => dataset.query(applied), [dataset, applied]);
  const points: MapPoint[] = useMemo(() => dataset.mapPoints(result), [dataset, result]);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showProtected, setShowProtected] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<MapCell | null>(null);

  const selectPoint = useCallback(
    (point: MapPoint) => {
      setSelected(result.cells.find((cell) => cell.id === point.id) ?? null);
    },
    [result],
  );

  const months = result.byMonth.slice(-48);
  const monthMax = Math.max(...months.map(([, value]) => value), 1);

  return (
    <div className="page map-page">
      <PageHeader
        eyebrow="Explore the archive"
        title="Fire Alerts Interactive Map"
        subtitle={`${formatCount(result.count)} satellite hotspot observations across ${
          applied.province === "All provinces" ? "Cambodia" : applied.province
        }`}
        action={<DownloadButton onClick={download} />}
        badge={`${formatCount(result.cells.length)} cells`}
      />
      <section className="map-card">
        <div className="map-canvas">
          <button
            className="map-sheet-toggle"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
          >
            <Icon name="compare" size={15} /> Filters
            <b>{formatCount(result.cells.length)}</b>
          </button>
          <div className={`map-filters ${filtersOpen ? "open" : ""}`}>
            <h2>
              <Icon name="compare" size={18} /> Explore hotspots
            </h2>
            <div className="country-lock">
              <Icon name="map" size={15} /> Cambodia <span>Locked</span>
            </div>
            <FilterBar
              dataset={dataset}
              pending={pending}
              setPending={setPending}
              apply={() => {
                apply();
                setFiltersOpen(false);
              }}
              reset={() => {
                reset();
                setSelected(null);
              }}
              showProvince
              error={error}
            />
            <div className="map-layers">
              <strong>Map layers</strong>
              <label>
                Province boundaries{" "}
                <input
                  type="checkbox"
                  checked={showBoundaries}
                  onChange={(e) => setShowBoundaries(e.target.checked)}
                />
              </label>
              <label>
                Protected areas{" "}
                <input
                  type="checkbox"
                  checked={showProtected}
                  onChange={(e) => setShowProtected(e.target.checked)}
                />
              </label>
            </div>
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
            <button
              className={basemap === "terrain" ? "active" : ""}
              onClick={() => setBasemap("terrain")}
            >
              Terrain
            </button>
            <button
              className={basemap === "satellite" ? "active" : ""}
              onClick={() => setBasemap("satellite")}
            >
              Satellite
            </button>
          </div>
          <MapView
            points={points}
            selectedId={selected?.id ?? null}
            onSelect={selectPoint}
            basemap={basemap}
            showBoundaries={showBoundaries}
            showProtected={showProtected}
          />
          {result.count === 0 && (
            <div className="empty">
              <Icon name="map" size={28} />
              <strong>No hotspots match these filters</strong>
              <span>Reset filters or widen the applied date range.</span>
            </div>
          )}
          <div className="activity-playback">
            <div>
              <strong>Explore activity over time</strong>
              <span>Observations per month · Applied period</span>
            </div>
            <div className="playback-row">
              <span className="playback-total" title="Hotspots in the applied period">
                {formatCompact(result.count)}
              </span>
              <div className="timeline-bars">
                {months.map(([label, value]) => (
                  <i
                    key={label}
                    title={`${label}: ${formatCount(value)} hotspots`}
                    style={{ height: `${8 + (value / monthMax) * 26}px` }}
                  />
                ))}
              </div>
            </div>
            <div className="timeline-labels">
              <span>{result.firstDay || applied.start || "Start"}</span>
              <span>{appliedRange(applied)}</span>
              <span>{result.lastDay || applied.end || "Latest"}</span>
            </div>
          </div>
          <div className="map-source">
            Hotspot detections aggregated to ~11 km cells • CSV follows applied filters
          </div>
        </div>
        <aside className={`detail-panel ${selected ? "open" : ""}`}>
          {selected ? (
            <>
              <button className="close" onClick={() => setSelected(null)} aria-label="Close details">
                <Icon name="close" />
              </button>
              <span className="eyebrow">Selected cluster</span>
              <h2>{selected.province}</h2>
              <div className="detail-time">
                {formatDate(selected.firstDate)}
                {selected.firstDate !== selected.lastDate && ` – ${formatDate(selected.lastDate)}`}
              </div>
              <dl>
                <div>
                  <dt>Observations</dt>
                  <dd>{formatCount(selected.count)}</dd>
                </div>
                <div>
                  <dt>Sensor mix</dt>
                  <dd>
                    {formatCount(selected.modis)} MODIS · {formatCount(selected.viirs)} VIIRS
                  </dd>
                </div>
                <div>
                  <dt>Cell centre</dt>
                  <dd>
                    {selected.lat.toFixed(3)}, {selected.lng.toFixed(3)}
                  </dd>
                </div>
                <div>
                  <dt>Peak FRP in cell</dt>
                  <dd>
                    {selected.maxFrp} <small>MW</small>
                  </dd>
                </div>
                <div>
                  <dt>Strongest detection</dt>
                  <dd>
                    {formatDate(selected.top.date)} at {selected.top.time} ICT
                  </dd>
                </div>
                <div>
                  <dt>Source confidence</dt>
                  <dd>{selected.top.confidence}</dd>
                </div>
                <div className="frp">
                  <dt>Fire radiative power</dt>
                  <dd>
                    {selected.top.frp} <small>MW</small>
                  </dd>
                </div>
              </dl>
              <p className="definition">
                <Icon name="info" size={15} /> Each marker summarises every detection that falls in
                the same 0.1° cell. FRP is radiant energy at observation time; it is not a measure
                of fire size.
              </p>
            </>
          ) : (
            <div className="detail-placeholder">
              <div className="radar">
                <span />
              </div>
              <h2>Select a cluster</h2>
              <p>Choose any orange or teal marker to inspect its hotspot summary.</p>
            </div>
          )}
        </aside>
        <aside className="map-summary">
          <h2>
            <Icon name="compare" size={17} /> Map summary
          </h2>
          <div>
            <span>Hotspots in view</span>
            <strong>{formatCount(result.count)}</strong>
          </div>
          <div>
            <span>Map cells</span>
            <strong>{formatCount(result.cells.length)}</strong>
          </div>
          <div>
            <span>Applied area</span>
            <strong>{applied.province === "All provinces" ? "Cambodia" : applied.province}</strong>
          </div>
          <Badge label="Real detections" />
        </aside>
      </section>
    </div>
  );
}

function Dashboard({
  dataset,
  pending,
  applied,
  setPending,
  apply,
  reset,
  download,
  error,
  navigateMap,
}: {
  dataset: Dataset;
  pending: Filters;
  applied: Filters;
  setPending: (f: Filters) => void;
  apply: () => void;
  reset: () => void;
  download: () => void;
  error: string;
  navigateMap: (p: Partial<Filters>) => void;
}) {
  const result = useMemo(
    () => dataset.query({ ...applied, province: "All provinces" }),
    [dataset, applied],
  );
  const monthCounts = useMemo(() => new Map(result.byMonth), [result]);
  const peak = result.byDay[0];
  return (
    <div className="page">
      <PageHeader
        eyebrow="National overview"
        title="Dashboard"
        subtitle="Historical hotspot activity across Cambodia"
        action={<DownloadButton onClick={download} />}
        badge={`${formatCount(result.count)} hotspots`}
      />
      <FilterBar
        dataset={dataset}
        pending={pending}
        setPending={setPending}
        apply={apply}
        reset={reset}
        country
        allSensorLabel="All Sensor"
        error={error}
      />
      <div className="helper-row">
        <span>
          <Icon name="info" size={15} /> CSV export follows applied dates and filters.
        </span>
        <strong>Applied date range: {appliedRange(applied)}</strong>
      </div>
      <div className="stats">
        <Stat label="Total hotspots" value={formatCount(result.count)} icon="flame" />
        <Stat
          label="Provinces with hotspots"
          value={`${result.provinceCount} / ${dataset.provinces.length}`}
          icon="map"
        />
        <Stat
          label="Peak activity day"
          value={peak ? formatDate(peak[0]) : "—"}
          note={peak ? `${formatCount(peak[1])} hotspots` : undefined}
          icon="calendar"
        />
        <Stat
          label="Highest FRP"
          value={`${result.maxFrp} MW`}
          note={`Mean ${result.meanFrp} MW`}
          icon="anomaly"
        />
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Seasonal hotspot profile"
          subtitle="Observations by month of year in the applied range"
          className="wide"
        >
          <LineChart values={result.byMonthOfYear} />
        </Panel>
        <Panel title="Hotspots by satellite" subtitle="Share of filtered observations">
          <Donut groups={result.bySatellite} total={result.count} />
        </Panel>
        <Panel title="Top 10 provinces" subtitle="Select a bar to explore on the map" className="wide">
          <Bars counts={result.byProvince} onSelect={(province) => navigateMap({ province })} />
        </Panel>
        <Panel title="Top 10 peak activity days" subtitle="Ranked by hotspot observations">
          <PeakTable
            days={result.byDay}
            onSelect={(date) => navigateMap({ start: toDisplay(date), end: toDisplay(date) })}
          />
        </Panel>
        <Panel
          title="Burning activity calendar"
          subtitle="Monthly activity pattern • select a cell to open the map"
          className="full"
        >
          <Heatmap
            compact
            counts={monthCounts}
            start={dataset.manifest.coverage.start}
            end={dataset.manifest.coverage.end}
            onSelect={(year, month) => navigateMap(monthRange(year, month))}
          />
        </Panel>
      </div>
      <p className="footnote">
        Source: {dataset.source} · {formatCount(dataset.size)} detections. Hotspots are satellite
        observations, not unique fires or burned area.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  icon,
  muted,
}: {
  label: string;
  value: string;
  note?: string;
  icon: string;
  muted?: boolean;
}) {
  return (
    <section className={`stat ${muted ? "muted" : ""}`}>
      <div className="stat-icon">
        <Icon name={icon} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </div>
    </section>
  );
}
function Panel({
  title,
  subtitle,
  children,
  className = "",
  badge = "Filtered",
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
  badge?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="illustrative">{badge}</span>
      </div>
      {children}
    </section>
  );
}

function LineChart({ values }: { values: number[] }) {
  const months = [
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
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${38 + i * 47},${128 - (v / max) * 90}`).join(" ");
  const path = values.map((v, i) => `${38 + i * 47} ${128 - (v / max) * 90}`).join(" L ");
  return (
    <svg
      className="line-chart"
      viewBox="0 0 580 165"
      preserveAspectRatio="none"
      aria-label="Line chart of hotspots by month of year"
    >
      {[38, 68, 98, 128].map((y) => (
        <line key={y} x1="38" y1={y} x2="560" y2={y} className="grid-line" />
      ))}
      <path d={`M ${path}`} className="area-line" />
      <polyline points={pts} className="chart-line" />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={38 + i * 47} cy={128 - (v / max) * 90} r="3" />
          <text x={38 + i * 47} y="151">
            {months[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Donut({ groups, total }: { groups: Count[]; total: number }) {
  const colors = ["#ef5b21", "#ffad45", "#0c9c91", "#08736e", "#70c9bb"];
  const sum = groups.reduce((acc, [, value]) => acc + value, 0) || 1;
  let acc = 0;
  const gradient = groups
    .map(([, value], i) => {
      const start = acc;
      acc += (value / sum) * 100;
      return `${colors[i % colors.length]} ${start}% ${acc}%`;
    })
    .join(",");
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${gradient || "#ddd 0 100%"})` }}>
        <div>
          <strong>{formatCompact(total)}</strong>
          <span>Hotspots</span>
        </div>
      </div>
      <div className="donut-legend">
        {groups.map(([name, value], i) => (
          <div key={name}>
            <i style={{ background: colors[i % colors.length] }} />
            <span>{name}</span>
            <strong>{Math.round((value / sum) * 100)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bars({ counts, onSelect }: { counts: Count[]; onSelect: (p: string) => void }) {
  const shown = counts.slice(0, 10),
    max = Math.max(...shown.map((x) => x[1]), 1);
  return (
    <div className="bars">
      {shown.length ? (
        shown.map(([name, value]) => (
          <button
            key={name}
            onClick={() => onSelect(name)}
            title={`Open ${name} on map · ${formatCount(value)} hotspots`}
          >
            <span>{name}</span>
            <i>
              <b style={{ width: `${(value / max) * 100}%` }} />
            </i>
            <strong>{formatCompact(value)}</strong>
          </button>
        ))
      ) : (
        <EmptyMini />
      )}
    </div>
  );
}

function PeakTable({ days, onSelect }: { days: Count[]; onSelect: (d: string) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Date</th>
            <th>Hotspots</th>
          </tr>
        </thead>
        <tbody>
          {days.slice(0, 10).map(([d, v], i) => (
            <tr key={d} onClick={() => onSelect(d)}>
              <td>{String(i + 1).padStart(2, "0")}</td>
              <td>{formatDate(d)}</td>
              <td>
                <strong>{formatCount(v)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!days.length && <EmptyMini />}
    </div>
  );
}
function EmptyMini() {
  return <div className="empty-mini">No observations in the applied range.</div>;
}

const monthNames = [
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
function monthRange(year: number, month: number) {
  const end = new Date(year, month, 0).getDate();
  return {
    start: `01/${String(month).padStart(2, "0")}/${year}`,
    end: `${end}/${String(month).padStart(2, "0")}/${year}`,
  };
}

function Heatmap({
  counts,
  start,
  end,
  compact = false,
  onSelect,
}: {
  counts: Map<string, number>;
  start: string;
  end: string;
  compact?: boolean;
  onSelect: (y: number, m: number) => void;
}) {
  const firstKey = start.slice(0, 7);
  const lastKey = end.slice(0, 7);
  const years: number[] = [];
  for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year++) {
    years.push(year);
  }
  const max = Math.max(...counts.values(), 1);
  return (
    <div className={`heatmap ${compact ? "compact" : ""}`}>
      <div className="heat-grid">
        <span />
        {monthNames.map((m) => (
          <strong key={m}>{m}</strong>
        ))}
        {years.map((y) => (
          <React.Fragment key={y}>
            <b>{y}</b>
            {monthNames.map((_, mi) => {
              const key = `${y}-${String(mi + 1).padStart(2, "0")}`;
              const missing = key < firstKey || key > lastKey;
              const count = counts.get(key) ?? 0;
              const intensity = count
                ? Math.min(0.92, 0.16 + (Math.log10(count + 1) / Math.log10(max + 1)) * 0.76)
                : 0.05;
              return (
                <button
                  key={mi}
                  className={missing ? "missing" : ""}
                  style={!missing ? { background: `rgba(239,91,33,${intensity})` } : undefined}
                  title={`${monthNames[mi]} ${y}: ${missing ? "No source coverage" : `${formatCount(count)} hotspots`}`}
                  onClick={() => !missing && onSelect(y, mi + 1)}
                >
                  <span>{count ? formatCompact(count) : ""}</span>
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="heat-legend">
        <span>0</span>
        <i />
        <i />
        <i />
        <i />
        <span>Higher</span>
        <em /> No coverage
      </div>
    </div>
  );
}

function CalendarPage({
  dataset,
  pending,
  applied,
  setPending,
  apply,
  reset,
  error,
  navigateMap,
}: {
  dataset: Dataset;
  pending: Filters;
  applied: Filters;
  setPending: (f: Filters) => void;
  apply: () => void;
  reset: () => void;
  error: string;
  navigateMap: (p: Partial<Filters>) => void;
}) {
  const result = useMemo(() => dataset.query(applied), [dataset, applied]);
  const counts = useMemo(() => new Map(result.byMonth), [result]);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Seasonality explorer"
        title="Activity Calendar"
        subtitle="Explore monthly hotspot intensity and archive coverage"
        badge={`${formatCount(result.count)} hotspots`}
      />
      <FilterBar
        dataset={dataset}
        pending={pending}
        setPending={setPending}
        apply={apply}
        reset={reset}
        error={error}
      />
      <div className="helper-row">
        <span>
          <Icon name="info" size={15} /> Hover for period, hotspot count, and coverage.
        </span>
        <strong>Applied date range: {appliedRange(applied)}</strong>
      </div>
      <section className="calendar-hero">
        <div className="calendar-intro">
          <span className="eyebrow">Detailed heatmap</span>
          <h2>When burning activity appears</h2>
          <p>
            Darker cells indicate more satellite hotspot observations. Hatched cells identify
            periods without source coverage; pale cells represent a confirmed zero.
          </p>
        </div>
        <Heatmap
          counts={counts}
          start={dataset.manifest.coverage.start}
          end={dataset.manifest.coverage.end}
          onSelect={(y, m) => navigateMap(monthRange(y, m))}
        />
      </section>
      <div className="calendar-notes">
        <div>
          <strong>How to read this view</strong>
          <p>
            Counts follow the applied sensor and satellite filters. Select any available month to
            see its observations on the map.
          </p>
        </div>
        <div>
          <strong>Data coverage</strong>
          <p>
            Archive coverage runs {dataset.manifest.coverage.start} to{" "}
            {dataset.manifest.coverage.end}. Missing data is visually distinct from zero hotspots and
            is excluded from comparisons.
          </p>
        </div>
      </div>
    </div>
  );
}

function Comparison({
  dataset,
  pending,
  applied,
  setPending,
  apply,
  reset,
  error,
  download,
}: {
  dataset: Dataset;
  pending: Filters;
  applied: Filters;
  setPending: (f: Filters) => void;
  apply: () => void;
  reset: () => void;
  error: string;
  download: () => void;
}) {
  const result = useMemo(() => dataset.query(applied), [dataset, applied]);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Sensor analysis"
        title="Sensor Comparison"
        subtitle="Compare MODIS and VIIRS with the right context"
        action={<DownloadButton onClick={download} />}
        badge={`${formatCount(result.count)} records`}
      />
      <FilterBar
        dataset={dataset}
        pending={pending}
        setPending={setPending}
        apply={apply}
        reset={reset}
        error={error}
      />
      <div className="helper-row">
        <span>
          <Icon name="info" size={15} /> Raw hotspot counts from different sensors are not directly
          comparable.
        </span>
        <strong>Applied date range: {appliedRange(applied)}</strong>
      </div>
      <RawComparison result={result} />
      <section className="method-note comparison-caution">
        <div className="method-number">01</div>
        <div>
          <h2>Compare raw records with care</h2>
          <p>
            MODIS and VIIRS differ in spatial resolution, overpass timing, and detection
            sensitivity. Their raw hotspot totals should be read as separate observation streams.
          </p>
        </div>
        <div>
          <h3>Metric definition</h3>
          <p>
            Values are satellite hotspot records in the applied date range, not unique fires or
            burned area.
          </p>
        </div>
      </section>
    </div>
  );
}

function RawComparison({ result }: { result: FilterResult }) {
  const total = Math.max(result.count, 1);
  const max = Math.max(...result.bySensor.map(([, value]) => value), 1);
  return (
    <div className="comparison-grid">
      <Panel
        title="Raw hotspot records"
        subtitle="Metric: satellite observations • Unit: records"
        className="wide"
      >
        <div className="sensor-bars">
          {result.bySensor.map(([name, value]) => (
            <div key={name} title={`${formatCount(value)} ${name} records`}>
              <span>{name}</span>
              <i>
                <b style={{ width: `${(value / max) * 100}%` }} />
              </i>
              <strong>
                {formatCompact(value)} · {Math.round((value / total) * 100)}%
              </strong>
            </div>
          ))}
        </div>
        <p className="chart-caption">
          VIIRS has finer spatial resolution and typically detects more hotspots than MODIS. Count
          differences do not necessarily indicate more burning.
        </p>
      </Panel>
      <Panel title="Satellite breakdown" subtitle="What the values represent">
        <div className="definitions">
          {result.bySatellite.map(([name, value]) => (
            <div key={name}>
              <strong>{name}</strong>
              <span>{Math.round((value / total) * 100)}% of records</span>
              <p>
                {formatCount(value)} detections ·{" "}
                {name === "Terra" || name === "Aqua" ? "MODIS, nominal 1 km" : "VIIRS, nominal 375 m"}
              </p>
            </div>
          ))}
          {!result.bySatellite.length && <EmptyMini />}
        </div>
      </Panel>
    </div>
  );
}

function AnomalyDetection({
  dataset,
  pending,
  applied,
  setPending,
  apply,
  reset,
  error,
  navigateMap,
}: {
  dataset: Dataset;
  pending: Filters;
  applied: Filters;
  setPending: (f: Filters) => void;
  apply: () => void;
  reset: () => void;
  error: string;
  navigateMap: (p: Partial<Filters>) => void;
}) {
  const result = useMemo(() => dataset.query(applied), [dataset, applied]);
  const flaggedProvinces = new Set(result.flagged.map((row) => row.province)).size;
  return (
    <div className="page">
      <PageHeader
        eyebrow="Pattern review"
        title="Anomaly Detection"
        subtitle="Review unusually intense or high-confidence hotspot observations"
        badge={`${formatCount(result.flaggedCount)} flagged`}
      />
      <FilterBar
        dataset={dataset}
        pending={pending}
        setPending={setPending}
        apply={apply}
        reset={reset}
        error={error}
      />
      <div className="helper-row">
        <span>
          <Icon name="info" size={15} /> Prototype rule: FRP ≥ 100 MW (roughly the top 1% of
          detections).
        </span>
        <strong>Applied date range: {appliedRange(applied)}</strong>
      </div>
      <div className="anomaly-stats">
        <Stat
          label="Flagged observations"
          value={formatCount(result.flaggedCount)}
          icon="anomaly"
        />
        <Stat label="Highest observed FRP" value={`${result.maxFrp} MW`} icon="flame" />
        <Stat
          label="Provinces in top 100"
          value={`${flaggedProvinces} / ${dataset.provinces.length}`}
          icon="map"
        />
      </div>
      <Panel
        title="Top 100 flagged observations by FRP"
        subtitle="Select an observation to inspect its day on the map"
        className="anomaly-table"
        badge={`Top ${result.flagged.length}`}
      >
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Province</th>
              <th>Sensor</th>
              <th>Satellite</th>
              <th>Confidence</th>
              <th>FRP</th>
            </tr>
          </thead>
          <tbody>
            {result.flagged.map((row) => (
              <tr
                key={row.id}
                onClick={() =>
                  navigateMap({
                    province: row.province,
                    start: toDisplay(row.date),
                    end: toDisplay(row.date),
                  })
                }
              >
                <td>{formatDate(row.date)}</td>
                <td>{row.province}</td>
                <td>{row.sensor}</td>
                <td>{row.satellite}</td>
                <td>{row.confidence}</td>
                <td>
                  <strong>{row.frp} MW</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <p className="footnote">
        Flags identify unusually intense observations (FRP ≥ 100 MW) and are not operational
        emergency alerts. MODIS reports higher FRP values than VIIRS, so raw FRP rankings are
        dominated by MODIS — compare sensors with care.
      </p>
    </div>
  );
}

export default App;
