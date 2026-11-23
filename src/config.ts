import { TTC_BAR_MAX_S } from "./fcw";

export type CameraPreset = { pitch_deg: number; distance_m: number; lookahead_m: number };

export type Config = {
  endpoints: Record<string, string>;
  camera_url: string;
  units: "mph" | "km/h";
  theme: "dark" | "light";
  camera: { chase: CameraPreset; high: CameraPreset };
  fcw_ttc_s?: number; // the page warns below this time to collision
};

const SCALAR_KEYS = ["camera_url", "units", "theme"] as const;

// The values a scalar key accepts. camera_url is a free string, so it is absent here.
const SCALAR_VALUES: Record<string, readonly string[]> = {
  units: ["mph", "km/h"],
  theme: ["dark", "light"],
};

// A camera preset value, for example camera.chase.pitch_deg=30, so the presets
// can be tuned on the booth monitor without editing config.json.
const PRESET_KEY = /^camera\.(chase|high)\.(pitch_deg|distance_m|lookahead_m)$/;

// A finite query number, or undefined when the text is blank or not finite.
// Both the FCW threshold and the camera presets use this check.
function finiteQueryNumber(value: string): number | undefined {
  const n = Number(value);
  if (value.trim() === "" || !Number.isFinite(n)) return undefined;
  return n;
}

// Query parameters override config.json key by key (design section 7). A ws://
// or wss:// value names an endpoint; endpoint names are free.
export function loadConfig(query: URLSearchParams, fileConfig: Config): Config {
  const c: Config = structuredClone(fileConfig);
  for (const [k, v] of query) {
    const preset = PRESET_KEY.exec(k);
    if (v.startsWith("ws://") || v.startsWith("wss://")) {
      c.endpoints[k] = v;
    } else if ((SCALAR_KEYS as readonly string[]).includes(k)) {
      // Drop a value the type does not allow, so ?units=furlongs cannot lie to Config.
      if (SCALAR_VALUES[k] && !SCALAR_VALUES[k].includes(v)) continue;
      (c as unknown as Record<string, string>)[k] = v;
    } else if (k === "fcw_ttc_s") {
      const n = finiteQueryNumber(v);
      // Above the TTC bar the amber zone fills the scale and every closing lead warns.
      if (n === undefined || n <= 0 || n > TTC_BAR_MAX_S) continue;
      c.fcw_ttc_s = n;
    } else if (preset) {
      const n = finiteQueryNumber(v);
      if (n === undefined) continue;
      c.camera[preset[1] as keyof Config["camera"]][preset[2] as keyof CameraPreset] = n;
    }
  }
  return c;
}

export async function fetchConfig(): Promise<Config> {
  const res = await fetch("config.json");
  const file = (await res.json()) as Config;
  return loadConfig(new URLSearchParams(location.search), file);
}
