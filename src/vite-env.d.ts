/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** MapTiler key — https://cloud.maptiler.com/account/keys/ . Takes priority over Mapbox. */
  readonly VITE_MAPTILER_KEY?: string;
  /** Mapbox public token — https://account.mapbox.com/access-tokens/ */
  readonly VITE_MAPBOX_TOKEN?: string;
  /** Key passed as ?token= to ArcGIS Online tile services. */
  readonly VITE_MAP_TILES_KEY?: string;
  /**
   * Optional FIRMS key for static deployments without a server proxy.
   * This value IS shipped in the browser bundle — use a dedicated key.
   * Leave unset to keep the key server-side (the default).
   */
  readonly VITE_FIRMS_MAP_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
