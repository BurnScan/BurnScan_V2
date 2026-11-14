import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type Basemap = "terrain" | "satellite";

export type MapPoint = {
  id: number;
  lat: number;
  lng: number;
  sensor: "MODIS" | "VIIRS";
  province: string;
};

type BasemapSource = {
  id: string;
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom?: number;
  tileSize?: number;
  zoomOffset?: number;
};

const PROVIDER = (
  import.meta.env.VITE_MAPTILER_KEY
    ? "maptiler"
    : import.meta.env.VITE_MAPBOX_TOKEN
      ? "mapbox"
      : import.meta.env.VITE_MAP_TILES_KEY
        ? "arcgis-keyed"
        : "arcgis"
) as "maptiler" | "mapbox" | "arcgis-keyed" | "arcgis";

const cambodiaBounds = L.latLngBounds([10.2, 102.2], [14.9, 107.8]);
const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`;

/** Tile endpoints. Esri works with no key; MapTiler / Mapbox turn on when a key is set. */
function basemapSources(): Record<Basemap, BasemapSource> {
  if (PROVIDER === "maptiler") {
    const key = import.meta.env.VITE_MAPTILER_KEY;
    return {
      satellite: {
        id: "maptiler-satellite",
        url: `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${key}`,
        attribution: "&copy; MapTiler &copy; OpenStreetMap contributors",
        maxZoom: 20,
      },
      terrain: {
        id: "maptiler-outdoor",
        url: `https://api.maptiler.com/maps/outdoor-v2/{z}/{x}/{y}.png?key=${key}`,
        attribution: "&copy; MapTiler &copy; OpenStreetMap contributors",
        maxZoom: 20,
      },
    };
  }
  if (PROVIDER === "mapbox") {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    return {
      satellite: {
        id: "mapbox-satellite",
        url: `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`,
        attribution: "&copy; Mapbox &copy; OpenStreetMap contributors",
        maxZoom: 20,
        maxNativeZoom: 17,
        tileSize: 512,
        zoomOffset: -1,
      },
      terrain: {
        id: "mapbox-outdoors",
        url: `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`,
        attribution: "&copy; Mapbox &copy; OpenStreetMap contributors",
        maxZoom: 20,
        maxNativeZoom: 17,
        tileSize: 512,
        zoomOffset: -1,
      },
    };
  }
  const keyParam =
    PROVIDER === "arcgis-keyed" ? `?token=${import.meta.env.VITE_MAP_TILES_KEY}` : "";
  return {
    satellite: {
      id: "esri-imagery",
      url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}${keyParam}`,
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics, GIS User Community",
      maxZoom: 19,
    },
    terrain: {
      id: "esri-topo",
      url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}${keyParam}`,
      attribution: "Topography &copy; Esri, HERE, Garmin, OpenStreetMap contributors",
      maxZoom: 19,
    },
  };
}

const sourceFor = basemapSources();

/** Layer panes so vector overlays can never paint over (or steal clicks from) hotspots. */
const PANE = { boundaries: "boundaries", protected: "protected", hotspots: "hotspots" };

function markerStyle(sensor: MapPoint["sensor"]) {
  return sensor === "VIIRS"
    ? { fill: "#0aaca0", glow: "rgba(10, 172, 160, 0.34)" }
    : { fill: "#ef5b21", glow: "rgba(239, 91, 33, 0.34)" };
}

function tileOptions(source: BasemapSource) {
  return {
    maxZoom: source.maxZoom,
    maxNativeZoom: source.maxNativeZoom ?? source.maxZoom,
    tileSize: source.tileSize ?? 256,
    zoomOffset: source.zoomOffset ?? 0,
    attribution: source.attribution,
  };
}

export default function MapView({
  points,
  selectedId,
  onSelect,
  basemap,
  showBoundaries,
  showProtected,
}: {
  points: MapPoint[];
  selectedId: number | null;
  onSelect: (point: MapPoint) => void;
  basemap: Basemap;
  showBoundaries: boolean;
  showProtected: boolean;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const pointsRef = useRef<L.LayerGroup | null>(null);
  const provincesRef = useRef<L.GeoJSON | null>(null);
  const protectedRef = useRef<L.GeoJSON | null>(null);
  const outlineRef = useRef<L.GeoJSON | null>(null);
  const pannedRef = useRef<number | null>(null);
  const tileErrors = useRef(0);
  const [tilesFailed, setTilesFailed] = useState(false);

  // Create the map once. Tile layers are left to the basemap effect below.
  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    const map = L.map(holder.current, {
      center: [12.72, 104.95],
      zoom: 7,
      minZoom: 6,
      maxZoom: 15,
      zoomControl: false,
      attributionControl: false,
      maxBounds: cambodiaBounds.pad(0.45),
      maxBoundsViscosity: 0.85,
      worldCopyJump: false,
      zoomSnap: 0.25,
    });
    mapRef.current = map;

    map.createPane(PANE.boundaries).style.zIndex = "410";
    map.createPane(PANE.protected).style.zIndex = "420";
    map.createPane(PANE.hotspots).style.zIndex = "430";

    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
    map.attributionControl?.addAttribution(
      'Boundaries &copy; <a href="https://www.geoboundaries.org/">geoBoundaries</a> (OSM)' +
        " · Protected areas &copy; OpenStreetMap contributors",
    );

    map.fitBounds(cambodiaBounds, { padding: [12, 12] });
    pointsRef.current = L.layerGroup().addTo(map);
    if (import.meta.env.DEV) {
      (window as unknown as { __burnscanMap?: L.Map }).__burnscanMap = map;
    }

    const resize = () => map.invalidateSize();
    window.addEventListener("resize", resize);
    const observer = new ResizeObserver(resize);
    observer.observe(holder.current);

    return () => {
      window.removeEventListener("resize", resize);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      pointsRef.current = null;
      provincesRef.current = null;
      protectedRef.current = null;
      outlineRef.current = null;
      pannedRef.current = null;
      if (import.meta.env.DEV) {
        delete (window as unknown as { __burnscanMap?: L.Map }).__burnscanMap;
      }
    };
  }, []);

  // Swap basemap tiles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = sourceFor[basemap];
    if (tileRef.current) map.removeLayer(tileRef.current);
    const layer = L.tileLayer(source.url, tileOptions(source));
    tileErrors.current = 0;
    layer.on("loading", () => {
      tileErrors.current = 0;
    });
    layer.on("tileerror", () => {
      tileErrors.current += 1;
    });
    layer.on("load", () => setTilesFailed(tileErrors.current > 0));
    layer.addTo(map);
    tileRef.current = layer;
    return () => {
      if (mapRef.current === map && map.hasLayer(layer)) map.removeLayer(layer);
    };
  }, [basemap]);

  // Hotspot markers, positioned from real latitude / longitude.
  useEffect(() => {
    const group = pointsRef.current;
    if (!group) return;
    group.clearLayers();
    points.forEach((point) => {
      const style = markerStyle(point.sensor);
      L.circleMarker([point.lat, point.lng], {
        pane: PANE.hotspots,
        radius: point.id === selectedId ? 13 : 9,
        color: style.glow,
        weight: 0,
        fillColor: style.fill,
        fillOpacity: 0.22,
        interactive: false,
      }).addTo(group);
      const marker = L.circleMarker([point.lat, point.lng], {
        pane: PANE.hotspots,
        radius: point.id === selectedId ? 6.5 : 4.8,
        color: "#ffffff",
        weight: 1.8,
        fillColor: style.fill,
        fillOpacity: 1,
        className: "hotspot-marker",
      });
      marker.on("click", () => onSelect(point));
      marker.bindTooltip(`${point.province} · ${point.sensor}`, {
        direction: "top",
        offset: [0, -8],
        className: "hotspot-tip",
      });
      marker.addTo(group);
    });
  }, [points, selectedId, onSelect]);

  // Pan to the selected hotspot (only when the selection actually changes).
  useEffect(() => {
    if (selectedId == null) {
      pannedRef.current = null;
      return;
    }
    if (!mapRef.current || pannedRef.current === selectedId) return;
    const point = points.find((p) => p.id === selectedId);
    if (!point) return;
    pannedRef.current = selectedId;
    mapRef.current.panTo([point.lat, point.lng], { animate: true, duration: 0.4 });
  }, [selectedId, points]);

  // Country outline (geoBoundaries ADM0) — the crisp border the reference shows.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || (outlineRef.current && map.hasLayer(outlineRef.current))) return;
    let cancelled = false;
    loadGeoJson("cambodia-outline.geojson")
      .then((data) => {
        if (cancelled || !mapRef.current) return;
        outlineRef.current = L.geoJSON(data, {
          pane: PANE.boundaries,
          interactive: false,
          style: {
            color: "rgba(255,255,255,0.95)",
            weight: 2,
            fill: false,
          },
        }).addTo(mapRef.current);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Province boundaries (real GeoJSON from geoBoundaries, ADM1).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!showBoundaries) {
      if (provincesRef.current) map.removeLayer(provincesRef.current);
      provincesRef.current = null;
      return;
    }
    if (provincesRef.current && map.hasLayer(provincesRef.current)) return;
    let cancelled = false;
    loadGeoJson("cambodia-provinces.geojson")
      .then((data) => {
        if (cancelled || !mapRef.current) return;
        provincesRef.current = L.geoJSON(data, {
          pane: PANE.boundaries,
          interactive: false,
          style: {
            color: "rgba(255,255,255,0.85)",
            weight: 1,
            fillColor: "#ffffff",
            fillOpacity: 0.015,
          },
        }).addTo(mapRef.current);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [showBoundaries]);

  // Protected areas (OSM protected_area polygons inside Cambodia).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!showProtected) {
      if (protectedRef.current) map.removeLayer(protectedRef.current);
      protectedRef.current = null;
      return;
    }
    if (protectedRef.current && map.hasLayer(protectedRef.current)) return;
    let cancelled = false;
    loadGeoJson("cambodia-protected-areas.geojson")
      .then((data) => {
        if (cancelled || !mapRef.current) return;
        protectedRef.current = L.geoJSON(data, {
          pane: PANE.protected,
          interactive: true,
          style: {
            color: "#f2c14e",
            weight: 1.2,
            dashArray: "5 4",
            fillColor: "#f2c14e",
            fillOpacity: 0.1,
          },
          onEachFeature: (feature, layer) => {
            const name = (feature.properties as { name?: string } | null)?.name;
            if (name) layer.bindTooltip(name, { sticky: true, className: "hotspot-tip" });
          },
        }).addTo(mapRef.current);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [showProtected]);

  const zoom = (delta: number) => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 7) + delta);

  const toggleFullscreen = () => {
    const card = holder.current?.closest(".map-card") as HTMLElement | null;
    if (!card) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void card.requestFullscreen();
  };

  return (
    <>
      <div className="leaflet-map" ref={holder} aria-label="Map of Cambodia with hotspot markers" />
      <div className="zoom">
        <button onClick={() => zoom(1)} aria-label="Zoom in">
          +
        </button>
        <button onClick={() => zoom(-1)} aria-label="Zoom out">
          −
        </button>
        <button onClick={toggleFullscreen} aria-label="Toggle fullscreen" className="zoom-fs">
          ⛶
        </button>
      </div>
      {tilesFailed && (
        <div className="map-tiles-warning">
          Basemap tiles could not load. Add a tile API key in <code>.env.local</code>.
        </div>
      )}
    </>
  );
}

/** Fetch a GeoJSON asset from the app's base path and fail loudly if it is not there. */
async function loadGeoJson(name: string): Promise<GeoJSON.GeoJsonObject> {
  const response = await fetch(asset(name));
  if (!response.ok) throw new Error(`GeoJSON ${name} → HTTP ${response.status}`);
  return (await response.json()) as GeoJSON.GeoJsonObject;
}
