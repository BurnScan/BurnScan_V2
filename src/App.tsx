import React, { useCallback, useMemo, useState } from "react";
import MapView, { type Basemap, type MapPoint } from "./MapView";

type Page = "map" | "dashboard" | "calendar" | "comparison" | "anomaly";
type Sensor = "MODIS" | "VIIRS";
type RecordRow = {
  id: number;
  date: string;
  time: string;
  province: string;
  sensor: Sensor;
  satellite: string;
  lat: number;
  lng: number;
  confidence: string;
  frp: number;
  x: number;
  y: number;
};
type Filters = { province: string; sensor: string; satellite: string; start: string; end: string };

const records: RecordRow[] = [
  {
    id: 1,
    date: "2025-03-18",
    time: "13:42",
    province: "Mondulkiri",
    sensor: "VIIRS",
    satellite: "Suomi NPP",
    lat: 12.46,
    lng: 107.19,
    confidence: "Nominal",
    frp: 18.4,
    x: 73,
    y: 55,
  },
  {
    id: 2,
    date: "2025-03-18",
    time: "13:36",
    province: "Ratanakiri",
    sensor: "VIIRS",
    satellite: "NOAA-20",
    lat: 13.65,
    lng: 107.04,
    confidence: "High",
    frp: 32.1,
    x: 72,
    y: 26,
  },
  {
    id: 3,
    date: "2025-03-16",
    time: "10:18",
    province: "Kampong Thom",
    sensor: "MODIS",
    satellite: "Terra",
    lat: 12.74,
    lng: 104.88,
    confidence: "82%",
    frp: 24.7,
    x: 47,
    y: 43,
  },
  {
    id: 4,
    date: "2025-03-12",
    time: "14:06",
    province: "Preah Vihear",
    sensor: "MODIS",
    satellite: "Aqua",
    lat: 13.62,
    lng: 104.98,
    confidence: "91%",
    frp: 41.3,
    x: 48,
    y: 22,
  },
  {
    id: 5,
    date: "2025-02-27",
    time: "13:24",
    province: "Kratie",
    sensor: "VIIRS",
    satellite: "NOAA-21",
    lat: 12.49,
    lng: 106.03,
    confidence: "Nominal",
    frp: 11.8,
    x: 61,
    y: 50,
  },
  {
    id: 6,
    date: "2025-02-20",
    time: "10:30",
    province: "Pursat",
    sensor: "MODIS",
    satellite: "Terra",
    lat: 12.53,
    lng: 103.91,
    confidence: "76%",
    frp: 16.2,
    x: 32,
    y: 54,
  },
  {
    id: 7,
    date: "2025-02-08",
    time: "13:48",
    province: "Stung Treng",
    sensor: "VIIRS",
    satellite: "Suomi NPP",
    lat: 13.54,
    lng: 105.97,
    confidence: "High",
    frp: 46.6,
    x: 61,
    y: 28,
  },
  {
    id: 8,
    date: "2025-01-29",
    time: "14:12",
    province: "Battambang",
    sensor: "MODIS",
    satellite: "Aqua",
    lat: 13.02,
    lng: 103.16,
    confidence: "88%",
    frp: 28.9,
    x: 20,
    y: 39,
  },
  {
    id: 9,
    date: "2025-01-18",
    time: "13:30",
    province: "Koh Kong",
    sensor: "VIIRS",
    satellite: "NOAA-20",
    lat: 11.62,
    lng: 103.01,
    confidence: "Nominal",
    frp: 9.7,
    x: 21,
    y: 72,
  },
  {
    id: 10,
    date: "2024-12-14",
    time: "10:12",
    province: "Kampong Speu",
    sensor: "MODIS",
    satellite: "Terra",
    lat: 11.46,
    lng: 104.52,
    confidence: "69%",
    frp: 13.1,
    x: 42,
    y: 73,
  },
  {
    id: 11,
    date: "2024-05-05",
    time: "13:54",
    province: "Mondulkiri",
    sensor: "VIIRS",
    satellite: "NOAA-21",
    lat: 12.19,
    lng: 107.08,
    confidence: "High",
    frp: 52.4,
    x: 75,
    y: 62,
  },
  {
    id: 12,
    date: "2024-04-21",
    time: "10:42",
    province: "Preah Vihear",
    sensor: "MODIS",
    satellite: "Aqua",
    lat: 13.72,
    lng: 104.69,
    confidence: "94%",
    frp: 61.7,
    x: 45,
    y: 19,
  },
  {
    id: 13,
    date: "2024-03-11",
    time: "13:18",
    province: "Kampong Thom",
    sensor: "VIIRS",
    satellite: "Suomi NPP",
    lat: 12.93,
    lng: 104.73,
    confidence: "Nominal",
    frp: 17.5,
    x: 44,
    y: 39,
  },
  {
    id: 14,
    date: "2024-02-02",
    time: "10:24",
    province: "Pursat",
    sensor: "MODIS",
    satellite: "Terra",
    lat: 12.35,
    lng: 103.64,
    confidence: "80%",
    frp: 21.9,
    x: 29,
    y: 57,
  },
  {
    id: 15,
    date: "2023-04-17",
    time: "13:42",
    province: "Ratanakiri",
    sensor: "VIIRS",
    satellite: "NOAA-20",
    lat: 13.83,
    lng: 106.99,
    confidence: "High",
    frp: 74.2,
    x: 72,
    y: 23,
  },
  {
    id: 16,
    date: "2023-03-24",
    time: "10:06",
    province: "Kratie",
    sensor: "MODIS",
    satellite: "Aqua",
    lat: 12.71,
    lng: 106.15,
    confidence: "86%",
    frp: 37.5,
    x: 63,
    y: 45,
  },
  {
    id: 17,
    date: "2023-02-12",
    time: "13:30",
    province: "Stung Treng",
    sensor: "VIIRS",
    satellite: "Suomi NPP",
    lat: 13.38,
    lng: 105.88,
    confidence: "Nominal",
    frp: 25.3,
    x: 59,
    y: 31,
  },
  {
    id: 18,
    date: "2023-01-08",
    time: "10:48",
    province: "Battambang",
    sensor: "MODIS",
    satellite: "Terra",
    lat: 13.21,
    lng: 103.12,
    confidence: "71%",
    frp: 14.6,
    x: 18,
    y: 35,
  },
];

const provinces = [...new Set(records.map((r) => r.province))].sort();
const satellites: Record<string, string[]> = {
  "All sensors": ["All satellites", "Terra", "Aqua", "Suomi NPP", "NOAA-20", "NOAA-21"],
  MODIS: ["All satellites", "Terra", "Aqua"],
  VIIRS: ["All satellites", "Suomi NPP", "NOAA-20", "NOAA-21"],
};
const defaultFilters: Filters = {
  province: "All provinces",
  sensor: "All sensors",
  satellite: "All satellites",
  start: "",
  end: "",
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    map: (
      <>
        <path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z" />
        <path d="M8 3v15m8-12v15" />
      </>
    ),
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    compare: (
      <>
        <path d="M5 20V10m7 10V4m7 16v-7" />
      </>
    ),
    anomaly: (
      <>
        <path d="M12 3 2.8 19h18.4L12 3Z" />
        <path d="M12 9v4m0 3h.01" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4" />
        <path d="M4 19h16" />
      </>
    ),
    flame: (
      <path d="M12 22c4.4 0 7-3 7-7 0-3-1.5-5.3-4.5-8.5.1 3-1.7 4.3-2.7 5-1-2.7-2.5-5-4.8-7.5.2 4-2 6.2-2 10.5C5 18.7 7.7 22 12 22Z" />
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5m0-8h.01" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

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
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}
function filterRows(rows: RecordRow[], filters: Filters) {
  const start = toISO(filters.start);
  const end = toISO(filters.end);
  return rows.filter(
    (r) =>
      (filters.province === "All provinces" || r.province === filters.province) &&
      (filters.sensor === "All sensors" || r.sensor === filters.sensor) &&
      (filters.satellite === "All satellites" || r.satellite === filters.satellite) &&
      (!start || r.date >= start) &&
      (!end || r.date <= end),
  );
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
  pending,
  setPending,
  apply,
  reset,
  showProvince = false,
  country = false,
  allSensorLabel = "All sensors",
  error,
}: {
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
            options={["All provinces", ...provinces]}
            onChange={(province) => setPending({ ...pending, province })}
          />
        )}
        <FilterField
          label="Sensor"
          value={pending.sensor}
          options={Object.keys(satellites)}
          onChange={sensorChange}
          allSensorLabel={allSensorLabel}
        />
        <FilterField
          label="Satellite"
          value={pending.satellite}
          options={satellites[pending.sensor]}
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

function Badge() {
  return (
    <span className="demo-badge">
      <span /> Demo data
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

function App() {
  const [page, setPage] = useState<Page>("map");
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
    dashboard: "",
    calendar: "",
    comparison: "",
    anomaly: "",
  });
  const [loading, setLoading] = useState<Record<Page, boolean>>({
    map: false,
    dashboard: false,
    calendar: false,
    comparison: false,
    anomaly: false,
  });
  const [selected, setSelected] = useState<RecordRow | null>(null);
  const [notice, setNotice] = useState("");

  const navigateMap = (patch: Partial<Filters>) => {
    const next = { ...defaultFilters, ...patch };
    setMapPending(next);
    setMapApplied(next);
    setSelected(null);
    setPage("map");
  };
  const apply = (key: Page, pending: Filters, setApplied: (f: Filters) => void) => {
    const message = dateError(pending);
    setErrors((e) => ({ ...e, [key]: message }));
    if (!message) {
      setLoading((current) => ({ ...current, [key]: true }));
      window.setTimeout(() => {
        setApplied(pending);
        setSelected(null);
        setLoading((current) => ({ ...current, [key]: false }));
      }, 450);
    }
  };
  const reset = (key: Page, setPending: (f: Filters) => void, setApplied: (f: Filters) => void) => {
    setPending(defaultFilters);
    setApplied(defaultFilters);
    setErrors((e) => ({ ...e, [key]: "" }));
    setSelected(null);
  };
  const exportCsv = (filters: Filters, filename: string) => {
    const rows = filterRows(records, filters);
    const header =
      "Observation date,Time,Province,Sensor,Satellite,Latitude,Longitude,Source confidence,FRP (MW)";
    const body = rows
      .map((r) =>
        [r.date, r.time, r.province, r.sensor, r.satellite, r.lat, r.lng, r.confidence, r.frp].join(
          ",",
        ),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([`${header}\n${body}`], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`${rows.length} filtered hotspot records exported`);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const nav = [
    ["map", "Fire Alerts Interactive Map", "map"],
    ["dashboard", "Dashboard", "dashboard"],
    ["calendar", "Activity Calendar", "calendar"],
    ["comparison", "Sensor Comparison", "compare"],
    ["anomaly", "Anomaly Detection", "anomaly"],
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
          {nav.map(([key, label, icon]) => (
            <button key={key} className={page === key ? "active" : ""} onClick={() => setPage(key)}>
              <Icon name={icon} />
              <span>{label}</span>
              {page === key && <Icon name="chevron" size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="eyebrow">About this prototype</span>
          <p>Hotspots are satellite observations, not unique fires or burned area.</p>
          <span className="source">MODIS + VIIRS archive</span>
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
            pending={mapPending}
            applied={mapApplied}
            setPending={setMapPending}
            error={errors.map}
            selected={selected}
            setSelected={setSelected}
            apply={() => apply("map", mapPending, setMapApplied)}
            reset={() => reset("map", setMapPending, setMapApplied)}
            download={() => exportCsv(mapApplied, "burnscan-map-hotspots.csv")}
          />
        )}
        {page === "dashboard" && (
          <Dashboard
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
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <div className="title-row">
          <h1>{title}</h1>
          <Badge />
        </div>
        <p>{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

function MapPage({
  pending,
  applied,
  setPending,
  apply,
  reset,
  download,
  error,
  selected,
  setSelected,
}: {
  pending: Filters;
  applied: Filters;
  setPending: (f: Filters) => void;
  apply: () => void;
  reset: () => void;
  download: () => void;
  error: string;
  selected: RecordRow | null;
  setSelected: (r: RecordRow | null) => void;
}) {
  const rows = useMemo(() => filterRows(records, applied), [applied]);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showProtected, setShowProtected] = useState(false);
  const points: MapPoint[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        sensor: r.sensor,
        province: r.province,
      })),
    [rows],
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const selectPoint = useCallback(
    (point: MapPoint) => {
      setSelected(records.find((r) => r.id === point.id) ?? null);
    },
    [setSelected],
  );
  return (
    <div className="page map-page">
      <PageHeader
        eyebrow="Explore the archive"
        title="Fire Alerts Interactive Map"
        subtitle="Historical satellite hotspot observations across Cambodia"
        action={<DownloadButton onClick={download} />}
      />
      <section className="map-card">
        <div className="map-canvas">
          <button
            className="map-sheet-toggle"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
          >
            <Icon name="compare" size={15} /> Filters
            <b>{rows.length}</b>
          </button>
          <div className={`map-filters ${filtersOpen ? "open" : ""}`}>
            <h2>
              <Icon name="compare" size={18} /> Explore hotspots
            </h2>
            <div className="country-lock">
              <Icon name="map" size={15} /> Cambodia <span>Locked</span>
            </div>
            <FilterBar
              pending={pending}
              setPending={setPending}
              apply={() => {
                apply();
                setFiltersOpen(false);
              }}
              reset={reset}
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
          {rows.length === 0 && (
            <div className="empty">
              <Icon name="map" size={28} />
              <strong>No hotspots match these filters</strong>
              <span>Reset filters or widen the applied date range.</span>
            </div>
          )}
          <div className="activity-playback">
            <div>
              <strong>Explore activity over time</strong>
              <span>Example playback • Applied period</span>
            </div>
            <div className="playback-row">
              <button aria-label="Play activity timeline">▶</button>
              <div className="timeline-bars">
                {Array.from({ length: 28 }, (_, i) => (
                  <i key={i} style={{ height: `${8 + ((i * 7) % 22)}px` }} />
                ))}
              </div>
            </div>
            <div className="timeline-labels">
              <span>{applied.start || "Start"}</span>
              <span>{appliedRange(applied)}</span>
              <span>{applied.end || "Latest"}</span>
            </div>
          </div>
          <div className="map-source">Illustrative hotspots • CSV follows applied filters</div>
        </div>
        <aside className={`detail-panel ${selected ? "open" : ""}`}>
          {selected ? (
            <>
              <button
                className="close"
                onClick={() => setSelected(null)}
                aria-label="Close details"
              >
                <Icon name="close" />
              </button>
              <span className="eyebrow">Selected hotspot</span>
              <h2>{selected.province}</h2>
              <div className="detail-time">
                {formatDate(selected.date)} <span>at {selected.time} ICT</span>
              </div>
              <dl>
                <div>
                  <dt>Province</dt>
                  <dd>{selected.province}</dd>
                </div>
                <div>
                  <dt>Sensor</dt>
                  <dd>{selected.sensor}</dd>
                </div>
                <div>
                  <dt>Satellite</dt>
                  <dd>{selected.satellite}</dd>
                </div>
                <div>
                  <dt>Coordinates</dt>
                  <dd>
                    {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                  </dd>
                </div>
                <div>
                  <dt>Source confidence</dt>
                  <dd>{selected.confidence}</dd>
                </div>
                <div className="frp">
                  <dt>Fire radiative power</dt>
                  <dd>
                    {selected.frp} <small>MW</small>
                  </dd>
                </div>
              </dl>
              <p className="definition">
                <Icon name="info" size={15} /> FRP is radiant energy at observation time; it is not
                a measure of fire size.
              </p>
            </>
          ) : (
            <div className="detail-placeholder">
              <div className="radar">
                <span />
              </div>
              <h2>Select a hotspot</h2>
              <p>Choose any orange marker to inspect its observation details.</p>
            </div>
          )}
        </aside>
        <aside className="map-summary">
          <h2>
            <Icon name="compare" size={17} /> Map summary
          </h2>
          <div>
            <span>Hotspots in view</span>
            <strong>{rows.length}</strong>
          </div>
          <div>
            <span>Applied area</span>
            <strong>{applied.province === "All provinces" ? "Cambodia" : applied.province}</strong>
          </div>
          <Badge />
        </aside>
      </section>
    </div>
  );
}

function Dashboard({
  pending,
  applied,
  setPending,
  apply,
  reset,
  download,
  error,
  navigateMap,
}: {
  pending: Filters;
  applied: Filters;
  setPending: (f: Filters) => void;
  apply: () => void;
  reset: () => void;
  download: () => void;
  error: string;
  navigateMap: (p: Partial<Filters>) => void;
}) {
  const rows = filterRows(records, { ...applied, province: "All provinces" });
  const counts = Object.entries(
    rows.reduce<Record<string, number>>(
      (a, r) => ({ ...a, [r.province]: (a[r.province] || 0) + 1 }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1]);
  const dayCounts = Object.entries(
    rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.date]: (a[r.date] || 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]));
  return (
    <div className="page">
      <PageHeader
        eyebrow="National overview"
        title="Dashboard"
        subtitle="Historical hotspot activity across Cambodia"
        action={<DownloadButton onClick={download} />}
      />
      <FilterBar
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
        <Stat label="Total hotspots" value={rows.length.toLocaleString()} icon="flame" />
        <Stat
          label="Provinces with hotspots"
          value={new Set(rows.map((r) => r.province)).size.toString()}
          icon="map"
        />
        <Stat
          label="Peak activity day"
          value={dayCounts[0] ? formatDate(dayCounts[0][0]) : "—"}
          note={dayCounts[0] ? `${dayCounts[0][1]} hotspots` : undefined}
          icon="calendar"
        />
        <Stat
          label="Hotspots in protected areas"
          value="Unavailable"
          note="Boundary data missing"
          icon="info"
          muted
        />
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Hotspots over time"
          subtitle="Monthly observations in the applied range"
          className="wide"
        >
          <LineChart rows={rows} />
        </Panel>
        <Panel title="Hotspots by satellite" subtitle="Share of filtered observations">
          <Donut rows={rows} />
        </Panel>
        <Panel
          title="Top 10 provinces"
          subtitle="Select a bar to explore on the map"
          className="wide"
        >
          <Bars counts={counts} onSelect={(province) => navigateMap({ province })} />
        </Panel>
        <Panel title="Top 10 peak activity days" subtitle="Ranked by hotspot observations">
          <PeakTable
            days={dayCounts}
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
            rows={rows}
            onSelect={(year, month) => navigateMap(monthRange(year, month))}
          />
        </Panel>
      </div>
      <p className="footnote">
        Illustrative data. Hotspots are satellite observations, not unique fires or burned area.
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
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="illustrative">Illustrative</span>
      </div>
      {children}
    </section>
  );
}
function LineChart({ rows }: { rows: RecordRow[] }) {
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
  const vals = months.map((_, i) => rows.filter((r) => +r.date.slice(5, 7) === i + 1).length);
  const max = Math.max(...vals, 1);
  const pts = vals.map((v, i) => `${38 + i * 47},${128 - (v / max) * 90}`).join(" ");
  const path = vals.map((v, i) => `${38 + i * 47} ${128 - (v / max) * 90}`).join(" L ");
  return (
    <svg
      className="line-chart"
      viewBox="0 0 580 165"
      preserveAspectRatio="none"
      aria-label="Line chart of hotspots over time"
    >
      {[38, 68, 98, 128].map((y) => (
        <line key={y} x1="38" y1={y} x2="560" y2={y} className="grid-line" />
      ))}
      <path d={`M ${path}`} className="area-line" />
      <polyline points={pts} className="chart-line" />
      {vals.map((v, i) => (
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
function Donut({ rows }: { rows: RecordRow[] }) {
  const groups = ["Terra", "Aqua", "Suomi NPP", "NOAA-20", "NOAA-21"].map(
    (s) => [s, rows.filter((r) => r.satellite === s).length] as const,
  );
  const colors = ["#ef5b21", "#ffad45", "#0c9c91", "#08736e", "#70c9bb"];
  const total = rows.length || 1;
  let acc = 0;
  const gradient = groups
    .map(([_, v], i) => {
      const start = acc;
      acc += (v / total) * 100;
      return `${colors[i]} ${start}% ${acc}%`;
    })
    .join(",");
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${gradient || "#ddd 0 100%"})` }}>
        <div>
          <strong>{rows.length}</strong>
          <span>Hotspots</span>
        </div>
      </div>
      <div className="donut-legend">
        {groups.map(([s, v], i) => (
          <div key={s}>
            <i style={{ background: colors[i] }} />
            <span>{s}</span>
            <strong>{Math.round((v / total) * 100)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
function Bars({ counts, onSelect }: { counts: [string, number][]; onSelect: (p: string) => void }) {
  const shown = counts.slice(0, 10),
    max = Math.max(...shown.map((x) => x[1]), 1);
  return (
    <div className="bars">
      {shown.length ? (
        shown.map(([name, value]) => (
          <button key={name} onClick={() => onSelect(name)} title={`Open ${name} on map`}>
            <span>{name}</span>
            <i>
              <b style={{ width: `${(value / max) * 100}%` }} />
            </i>
            <strong>{value}</strong>
          </button>
        ))
      ) : (
        <EmptyMini />
      )}
    </div>
  );
}
function PeakTable({
  days,
  onSelect,
}: {
  days: [string, number][];
  onSelect: (d: string) => void;
}) {
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
                <strong>{v}</strong>
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
  rows,
  compact = false,
  onSelect,
}: {
  rows: RecordRow[];
  compact?: boolean;
  onSelect: (y: number, m: number) => void;
}) {
  const years = [2021, 2022, 2023, 2024, 2025];
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
              const count = rows.filter(
                (r) => +r.date.slice(0, 4) === y && +r.date.slice(5, 7) === mi + 1,
              ).length;
              const missing = y < 2023 && mi > 7;
              return (
                <button
                  key={mi}
                  className={missing ? "missing" : ""}
                  style={
                    !missing
                      ? {
                          background: `rgba(239,91,33,${count ? Math.min(0.25 + count * 0.22, 0.95) : 0.06})`,
                        }
                      : undefined
                  }
                  title={`${monthNames[mi]} ${y}: ${missing ? "Missing data" : `${count} hotspots • Complete coverage`}`}
                  onClick={() => !missing && onSelect(y, mi + 1)}
                >
                  <span>{count || ""}</span>
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
        <em /> Missing data
      </div>
    </div>
  );
}

function CalendarPage({
  pending,
  applied,
  setPending,
  apply,
  reset,
  error,
  navigateMap,
}: {
  pending: Filters;
  applied: Filters;
  setPending: (f: Filters) => void;
  apply: () => void;
  reset: () => void;
  error: string;
  navigateMap: (p: Partial<Filters>) => void;
}) {
  const rows = filterRows(records, applied);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Seasonality explorer"
        title="Activity Calendar"
        subtitle="Explore monthly hotspot intensity and archive coverage"
      />
      <FilterBar
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
            periods without complete source data; pale cells represent a confirmed zero.
          </p>
        </div>
        <Heatmap rows={rows} onSelect={(y, m) => navigateMap(monthRange(y, m))} />
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
            Missing data is visually distinct from zero hotspots and is excluded from comparisons.
          </p>
        </div>
      </div>
    </div>
  );
}

function Comparison({
  pending,
  applied,
  setPending,
  apply,
  reset,
  error,
  download,
}: {
  pending: Filters;
  applied: Filters;
  setPending: (f: Filters) => void;
  apply: () => void;
  reset: () => void;
  error: string;
  download: () => void;
}) {
  const rows = filterRows(records, applied);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Sensor analysis"
        title="Sensor Comparison"
        subtitle="Compare MODIS and VIIRS with the right context"
        action={<DownloadButton onClick={download} />}
      />
      <FilterBar
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
      <RawComparison rows={rows} />
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
function RawComparison({ rows }: { rows: RecordRow[] }) {
  const m = rows.filter((r) => r.sensor === "MODIS").length,
    v = rows.filter((r) => r.sensor === "VIIRS").length,
    max = Math.max(m, v, 1);
  return (
    <div className="comparison-grid">
      <Panel
        title="Raw hotspot records"
        subtitle="Metric: satellite observations • Unit: records"
        className="wide"
      >
        <div className="sensor-bars">
          <div>
            <span>MODIS</span>
            <i>
              <b style={{ width: `${(m / max) * 100}%` }} />
            </i>
            <strong>{m}</strong>
          </div>
          <div>
            <span>VIIRS</span>
            <i>
              <b style={{ width: `${(v / max) * 100}%` }} />
            </i>
            <strong>{v}</strong>
          </div>
        </div>
        <p className="chart-caption">
          VIIRS has finer spatial resolution and typically detects more hotspots than MODIS. Count
          differences do not necessarily indicate more burning.
        </p>
      </Panel>
      <Panel title="Record definitions" subtitle="What the values represent">
        <div className="definitions">
          <div>
            <strong>MODIS</strong>
            <span>Terra + Aqua</span>
            <p>Nominal 1 km active-fire product.</p>
          </div>
          <div>
            <strong>VIIRS</strong>
            <span>Suomi NPP + NOAA-20/21</span>
            <p>Nominal 375 m active-fire product.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
function AnomalyDetection({
  pending,
  applied,
  setPending,
  apply,
  reset,
  error,
  navigateMap,
}: {
  pending: Filters;
  applied: Filters;
  setPending: (f: Filters) => void;
  apply: () => void;
  reset: () => void;
  error: string;
  navigateMap: (p: Partial<Filters>) => void;
}) {
  const rows = filterRows(records, applied);
  const anomalies = rows
    .filter((row) => row.frp >= 35 || row.confidence === "High")
    .sort((a, b) => b.frp - a.frp);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Pattern review"
        title="Anomaly Detection"
        subtitle="Review unusually intense or high-confidence hotspot observations"
      />
      <FilterBar
        pending={pending}
        setPending={setPending}
        apply={apply}
        reset={reset}
        error={error}
      />
      <div className="helper-row">
        <span>
          <Icon name="info" size={15} /> Prototype rule: FRP ≥ 35 MW or high source confidence.
        </span>
        <strong>Applied date range: {appliedRange(applied)}</strong>
      </div>
      <div className="anomaly-stats">
        <Stat label="Flagged observations" value={anomalies.length.toString()} icon="anomaly" />
        <Stat
          label="Highest observed FRP"
          value={anomalies[0] ? `${anomalies[0].frp} MW` : "—"}
          icon="flame"
        />
        <Stat
          label="Provinces flagged"
          value={new Set(anomalies.map((row) => row.province)).size.toString()}
          icon="map"
        />
      </div>
      <Panel
        title="Flagged hotspot observations"
        subtitle="Select an observation to inspect it on the map"
        className="anomaly-table"
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
            {anomalies.map((row) => (
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
        Demo analysis only. Flags identify unusual observations in this illustrative dataset and are
        not operational emergency alerts.
      </p>
    </div>
  );
}

export default App;
