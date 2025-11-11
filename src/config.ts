type MaybeRecord = Record<string, unknown> | undefined;

function readRaw(key: string): unknown {
  const viteKey = `VITE_${key}`;
  const env = (import.meta as any).env ?? {};
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    return env[key];
  }
  if (env && Object.prototype.hasOwnProperty.call(env, viteKey)) {
    return env[viteKey];
  }

  const globalConfig: MaybeRecord = (window as any).__LIGHT_DEMO_CONFIG;
  if (globalConfig && Object.prototype.hasOwnProperty.call(globalConfig, key)) {
    return globalConfig[key];
  }

  return undefined;
}

function readString(key: string, fallback: string): string {
  const raw = readRaw(key);
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  return fallback;
}

function readBoolean(key: string, fallback: boolean): boolean {
  const raw = readRaw(key);
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
      return false;
    }
  }
  return fallback;
}

export const DEMO_MODE = readBoolean("DEMO_MODE", false);
export const LIGHT_BASE_URL = readString("LIGHT_BASE_URL", "http://localhost:3000");
export const SCENE_ID = readString("SCENE_ID", "S012-A");

function readOptionalPath(key: string): string | null {
  const raw = readString(key, "").trim();
  return raw ? raw : null;
}

export const ASSET_WATCH_DIR = readOptionalPath("ASSET_WATCH_DIR");
export const AI_PREVIS_PATH = readOptionalPath("AI_PREVIS_PATH");

export const DEMO_DEFAULT_PREVIS_DURATION_SEC = 8;

