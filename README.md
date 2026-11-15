# BurnScan — Cambodia Fire Activity Explorer

React + Vite + Tailwind app that explores **2,737,475 historical MODIS / VIIRS
hotspot detections** across Cambodia (2000-11-04 → 2025-12-31) from
`fires_final.parquet`, plus a **live near-real-time feed from NASA FIRMS**.

## Hosting it locally

```bash
npm install
npm run dev        # http://localhost:8443
```

The dev server is already running on `PORT` (default **8443**) and hot-reloads
on save.

For a production build:

```bash
npm run build      # emits dist/ (including dist/data/)
npm run preview    # serves dist/ on port 8443
```

## Live fire alerts (NASA FIRMS)

The **Live Fire Alerts** page queries the [NASA FIRMS area API](https://firms.modaps.eosdis.nasa.gov/api/)
for the last 1–5 days of near-real-time detections inside Cambodia's bounding
box (`102.3,10.4,107.7,14.7`).

Add your key to `.env.local` and restart the server:

```bash
FIRMS_MAP_KEY=your_32_char_map_key      # no VITE_ prefix on purpose
```

The key is read **server-side only**. Browsers never see it: `vite.config.ts`
mounts `/api/firms/*` middleware that injects the key and calls FIRMS for you.

| Route | Returns |
|---|---|
| `GET /api/firms/hotspots?days=1..5&sources=VIIRS_NOAA20_NRT,...` | Normalised detections from one or more datasets (60 s cache) |
| `GET /api/firms/status` | `mapkey_status`: calls used in the current 10-minute window |
| `GET /api/firms/availability` | Per-dataset min/max dates (shown next to each satellite toggle) |

Notes:

- FIRMS limits the area API to **5 days** per request and **5,000 transactions
  per 10 minutes** per key; the UI respects both and shows the live quota.
- Times are converted from GMT to Cambodia time (ICT, UTC+7) so they line up
  with the historical archive.
- Datasets are `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `VIIRS_SNPP_NRT` and
  `MODIS_NRT`; the toggle row shows each dataset's last available date, which
  explains an empty result (e.g. Suomi NPP NRT ended 2026-11-02).
- Above 700 detections the map aggregates to 0.1° cells, matching the archive.

### Deployment modes

| Mode | When | Key location | How it runs |
|---|---|---|---|
| **Proxy** (default) | `npm run dev`, `npm run preview`, Vercel, any Node host | Server env `FIRMS_MAP_KEY` | Vite middleware in dev/preview; `api/firms/*` Vercel Functions in production |
| **Static** | GitHub Pages / S3 / Figma Make publish | `VITE_FIRMS_MAP_KEY` in the bundle | Browser calls FIRMS directly (their API sends `Access-Control-Allow-Origin: *`) |

Static mode is opt-in at build time. If `VITE_FIRMS_MAP_KEY` is present it is
used and the proxy is skipped; otherwise the app uses `/api/firms/*`.

```bash
VITE_FIRMS_MAP_KEY=your_key npm run build     # or put it in .env.local
```

Because `VITE_` variables are embedded in the shipped JavaScript, the key is
public in this mode — use a dedicated key you can rotate, and keep `.env*` out
of git.

If neither is configured, the Live page shows a clear message instead of
breaking. The parsing helpers live in `src/firmsCore.ts` and are shared by both
modes.

### Deploy to Vercel

`vercel.json`, `.vercelignore` and `api/firms/*` are included. The functions keep
`FIRMS_MAP_KEY` server-side, so no `VITE_` key is needed:

```bash
npx vercel@latest login
npx vercel@latest link            # accept the Vite preset: npm run build → dist
npx vercel@latest env add FIRMS_MAP_KEY production
npx vercel@latest deploy --prod
```

The CLI uploads the local tree, so `public/data/hotspots.*` is included even
though it is git-ignored. A Git-based deploy needs those two files committed
(or generated during the build). For a no-account demo use
`npx vercel@latest deploy --temporary --env FIRMS_MAP_KEY=your_key`.

## Where the data comes from

`fires_final.parquet` (66.7 MB, pyarrow / pandas 3.1) is the source of truth.
Browsers cannot read `file://` paths and cannot decode Parquet cheaply, so the
archive is converted once into two static assets:

| File | Size | Contents |
|---|---|---|
| `public/data/hotspots.bin` | 57 MB | column-oriented typed arrays (one row per detection) |
| `public/data/hotspots.json` | 3 KB | dictionaries, byte offsets, coverage, totals |

Regenerate them whenever the Parquet export changes:

```bash
npm run data -- "C:/path/to/fires_final.parquet" public/data
```

The script (`scripts/prepare-data.mjs`) reads the Parquet with `hyparquet`,
normalises the export's compressed labels (`N` → `SNPP`, `n`/`h` → `nominal`/
`high`), and prints coverage and per-year counts.

Both generated files are git-ignored: run `npm run data` after cloning.

### Fields kept per detection

`sensor`, `satellite`, `date`, `timestamp_utc` (shown as ICT, UTC+7),
`latitude`, `longitude`, `frp_mw`, `confidence`, `province`.

### How the UI handles 2.7M rows

`src/dataset.ts` rebuilds `Int32Array` / `Float32Array` / `Uint8Array` views
directly from the downloaded bytes — no parsing — then answers a filter in a
single ~100 ms pass that produces:

- exact totals, sensor/satellite/province/day/month counts, FRP statistics,
  and the top 100 detections by FRP;
- **map cells**: detections binned into 0.1° (~11 km) cells, so the map draws
  ~1.6k weighted bubbles instead of 2.7M markers;
- CSV export, evenly sampled to 50,000 rows when the filtered set is larger.

Filter results are memoised per filter set, so switching pages or re-rendering
never re-scans the archive.

## App pages

- **Fire Alerts Interactive Map** - weighted hotspot cells, province + sensor +
  satellite + date filters, cluster detail panel, live monthly activity bars.
- **Live Fire Alerts** - NASA FIRMS NRT (last 1–5 days), satellite toggles with
  per-dataset availability, 5-minute auto-refresh, quota meter, detection table.
- **Dashboard** - totals, provinces, peak day, FRP extremes, seasonal profile,
  satellite share, top provinces/days, full 2000-2025 calendar.
- **Activity Calendar** — monthly intensity heatmap with explicit "no coverage"
  hatching instead of fake zeros.
- **Sensor Comparison** — MODIS vs VIIRS record counts and satellite breakdown.
- **Anomaly Detection** — detections with FRP ≥ 100 MW (≈1% of the archive),
  top 100 ranked, each row drills into its day on the map.

## Notes and caveats

- Hotspots are satellite observations, not unique fires or burned area.
- The export stores VIIRS satellites as `N` and VIIRS confidence as `n`/`h`;
  these are expanded for display.
- MODIS reports systematically higher FRP than VIIRS, so raw FRP rankings are
  MODIS-heavy.
- Basemap tiles use keyless Esri imagery; add `VITE_MAPTILER_KEY`,
  `VITE_MAPBOX_TOKEN`, or `VITE_MAP_TILES_KEY` to `.env.local` to switch
  providers (see `.env.example`).
