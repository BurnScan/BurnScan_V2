/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** MapTiler key — https://cloud.maptiler.com/account/keys/ . Takes priority over Mapbox. */
  readonly VITE_MAPTILER_KEY?: string;
  /** Mapbox public token — https://account.mapbox.com/access-tokens/ */
  readonly VITE_MAPBOX_TOKEN?: string;
  /** Key passed as ?token= to ArcGIS Online tile services. */
  readonly VITE_MAP_TILES_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
