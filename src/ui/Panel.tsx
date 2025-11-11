import React from "react";
import { connectWS, execJSX, openLogin, pollAuthStatus, snapshot, postJSON, API } from "../ext";
import type { Command } from "../protocol";
import { DEMO_MODE, LIGHT_BASE_URL, SCENE_ID, ASSET_WATCH_DIR, AI_PREVIS_PATH, DEMO_DEFAULT_PREVIS_DURATION_SEC } from "../config";

const FPS_TARGET = 23.98;

type DemoCoverage = { WS: boolean; MS: boolean; CU: boolean };
type ContinuityState = "PASS" | "FAIL" | null;

type DemoCommandType =
  | "demo.ensureBins"
  | "demo.importAndPlaceInBins"
  | "demo.addClipMarkersForScene"
  | "demo.insertAiPrevis"
  | "demo.replaceAiPrevisWithReal"
  | "demo.computeRoundTrip";

interface JsxResponse {
  ok?: boolean;
  error?: string;
  [key: string]: any;
}

interface DemoRoundTripResponse extends JsxResponse {
  coverage?: any;
  markers?: number;
  fps?: number | string;
  aiPrevis?: boolean;
}

const DEFAULT_COVERAGE: DemoCoverage = { WS: false, MS: false, CU: false };

type RoundTripSnapshot = {
  coverage: DemoCoverage;
  markers: number;
  fps: number | null;
  aiPrevis: boolean;
  ok: boolean;
  error?: string;
  heuristicContinuity: boolean;
  heuristicAesthetic: boolean;
};

const SCENE_PROGRESS_STRIP = [
  { id: "010", display: "010 ✓", title: "Round-trip 0" },
  { id: "011", display: "011 ✓", title: "Round-trip 0" },
  { id: "012", display: "012 (Active)", title: "Active scene" }
];

export default function Panel() {
  return DEMO_MODE ? <DemoPanel /> : <LivePanel />;
}

function LivePanel(){
  const [status,setStatus]=React.useState("Disconnected");
  const [apiKey,setApiKey]=React.useState(localStorage.getItem("light_apikey")||"");
  const [connecting,setConnecting]=React.useState(false);
  const wsRef = React.useRef<WebSocket|null>(null);
  const pollStopRef = React.useRef<null | (()=>void)>(null);

  React.useEffect(() => {
    const token = localStorage.getItem("light_token");
    if (token) {
      setStatus("Authenticated");
    }
    return () => {
      pollStopRef.current?.();
      pollStopRef.current = null;
    };
  }, []);

  function onMsg(m:any){
    if(m?.type==="auth_ok" && m?.token){ localStorage.setItem("light_token", m.token); }
    if(m?.id && m?.type){
      const cmd = m as Command;
      execJSX(cmd, (result) => {
        wsRef.current?.send(JSON.stringify({ id: cmd.id, ok: true, result }));
      });
    }
  }

  function connect(){
    setConnecting(true);
    wsRef.current = connectWS(onMsg, (s)=>{ setStatus(s); setConnecting(false); });
  }

  async function login(){
    pollStopRef.current?.();
    setStatus("Waiting for browser login…");
    await openLogin();
    pollStopRef.current = pollAuthStatus(() => {
      setStatus("Authenticated");
      pollStopRef.current?.();
      pollStopRef.current = null;
    });
  }

  function checkpoint(){
    snapshot(async (snap) => {
      await postJSON(`${API}/api/v1/log/snapshot`, snap, !!apiKey);
      alert("Checkpoint sent.");
    });
  }

  return (
    <div style={{padding:12, display:"grid", gap:12}}>
      <h3 style={{margin:0}}>Light Copilot</h3>
      <div>Status: <b>{status}</b>{connecting && " (connecting…)"}</div>
      <p style={{margin:0, lineHeight:1.4, color:"#ccc"}}>
        Sign in using your default browser. Google OAuth cannot run inside Premiere,
        so we’ll launch a browser window and securely hand the token back here.
      </p>

      <div style={{display:"grid", gap:8}}>
        <button onClick={login}>Sign in with Google</button>
        <button onClick={connect}>Connect to Copilot</button>
        <input
          placeholder="API Key (optional)"
          value={apiKey}
          onChange={e=>{const v = e.target.value; setApiKey(v); localStorage.setItem("light_apikey", v);}}
        />
        <button onClick={checkpoint}>Create Checkpoint</button>
      </div>
    </div>
  );
}

function DemoPanel() {
  const [coverage, setCoverage] = React.useState<DemoCoverage>({ ...DEFAULT_COVERAGE });
  const [markersCount, setMarkersCount] = React.useState(0);
  const [fps, setFps] = React.useState<number | null>(null);
  const [aiPrevis, setAiPrevis] = React.useState(false);
  const [lastSync, setLastSync] = React.useState<string | null>(null);
  const [roundTripDeltas, setRoundTripDeltas] = React.useState(3);
  const [eventLog, setEventLog] = React.useState<string[]>([]);
  const [continuityStatus, setContinuityStatus] = React.useState<ContinuityState>(null);
  const [continuitySource, setContinuitySource] = React.useState<"telemetry" | "heuristic" | null>(null);
  const [aestheticStatus, setAestheticStatus] = React.useState<boolean | null>(null);
  const [aestheticSource, setAestheticSource] = React.useState<"telemetry" | "heuristic" | null>(null);
  const [statusMessage, setStatusMessage] = React.useState("Ready.");
  const [syncing, setSyncing] = React.useState(false);
  const [filling, setFilling] = React.useState(false);
  const [replacing, setReplacing] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  const appendLog = React.useCallback((line: string) => {
    setEventLog((prev) => [line, ...prev].slice(0, 50));
  }, []);

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 10px",
    borderRadius: 14,
    border: `1px solid ${active ? "#27ae60" : "#e74c3c"}`,
    color: active ? "#27ae60" : "#e74c3c",
    fontSize: 12,
    fontWeight: 600
  });
  const chipLabel = (abbr: "WS" | "MS" | "CU", active: boolean) => `${abbr} ${active ? "✓" : "—"}`;

  async function refreshFromRoundTrip(): Promise<RoundTripSnapshot> {
    const response = await runDemoJsx<DemoRoundTripResponse>("demo.computeRoundTrip", { sceneId: SCENE_ID, fpsTarget: FPS_TARGET });
    if (!response) {
      return {
        coverage,
        markers: markersCount,
        fps,
        aiPrevis,
        ok: false,
        error: "No response",
        heuristicContinuity: coverage.WS && coverage.MS && coverage.CU,
        heuristicAesthetic: !aiPrevis
      };
    }
    const mappedCoverage = mapCoverage(response.coverage);
    const fpsValue = parseFps(response.fps);
    const markersValue =
      typeof response.markers === "number" && !isNaN(response.markers) ? response.markers : markersCount;
    const aiFlag = typeof response.aiPrevis === "boolean" ? response.aiPrevis : aiPrevis;

    setCoverage(mappedCoverage);
    setFps(fpsValue);
    setMarkersCount(markersValue);
    setAiPrevis(aiFlag);

    return {
      coverage: mappedCoverage,
      markers: markersValue,
      fps: fpsValue,
      aiPrevis: aiFlag,
      ok: response.ok !== false,
      error: response.ok === false ? response.error : undefined,
      heuristicContinuity: mappedCoverage.WS && mappedCoverage.MS && mappedCoverage.CU,
      heuristicAesthetic: !aiFlag
    };
  }

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setStatusMessage("Syncing from Light…");
    let telemetry: any = null;
    try {
      telemetry = await fetchTelemetry();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Sync failed: ${msg}`);
      appendLog("premiere.sync -> FAIL");
      setSyncing(false);
      return;
    }

    const telemetryContinuity = extractContinuityStatus(telemetry);
    const telemetryAesthetic = extractAestheticStatus(telemetry);

    const telemetryCoverage = extractCoverage(telemetry?.coverage ?? telemetry?.binCoverage);
    const telemetryMarkers = extractMarkers(telemetry);
    const telemetryFps = parseFps(
      telemetry?.fps ?? telemetry?.sequence?.fps ?? telemetry?.video?.fps ?? telemetry?.timeline?.fps
    );
    let markersValue = typeof telemetryMarkers === "number" ? telemetryMarkers : markersCount;
    let coverageFinal: DemoCoverage = telemetryCoverage;
    let fpsFinal: number | null = telemetryFps;
    let aiPrevisFinal = aiPrevis;
    const errorNotes: string[] = [];

    const ensureRes = await runDemoJsx("demo.ensureBins", { sceneId: SCENE_ID });
    if (ensureRes?.ok === false) {
      errorNotes.push(ensureRes.error || "ensureBins failed");
    }

    if (ASSET_WATCH_DIR) {
      const importRes = await runDemoJsx("demo.importAndPlaceInBins", {
        sceneId: SCENE_ID,
        watchDir: ASSET_WATCH_DIR
      });
      if (importRes?.ok === false) {
        errorNotes.push(importRes.error || "import failed");
      }
    }

    const markerRes = await runDemoJsx("demo.addClipMarkersForScene", { sceneId: SCENE_ID });
    if (markerRes && typeof markerRes.markers === "number" && !isNaN(markerRes.markers)) {
      markersValue = markerRes.markers;
    }
    if (markerRes?.ok === false) {
      errorNotes.push(markerRes.error || "markers failed");
    }

    const roundState = await refreshFromRoundTrip();
    if (roundState.ok === false) {
      errorNotes.push(roundState.error || "roundtrip failed");
    }
    coverageFinal = roundState.coverage;
    markersValue = roundState.markers;
    fpsFinal = roundState.fps;
    aiPrevisFinal = roundState.aiPrevis;

    if (telemetryContinuity !== null) {
      setContinuityStatus(telemetryContinuity);
      setContinuitySource("telemetry");
    } else if (continuitySource !== "telemetry") {
      setContinuityStatus(roundState.heuristicContinuity ? "PASS" : "FAIL");
      setContinuitySource("heuristic");
    }

    if (telemetryAesthetic !== null) {
      setAestheticStatus(telemetryAesthetic);
      setAestheticSource("telemetry");
    } else if (aestheticSource !== "telemetry") {
      setAestheticStatus(roundState.heuristicAesthetic);
      setAestheticSource("heuristic");
    }

    setCoverage(coverageFinal);
    setMarkersCount(markersValue);
    setFps(fpsFinal);
    setAiPrevis(aiPrevisFinal);

    const coverageGood = isCoverageGood(coverageFinal);
    const fpsGood = isFpsGood(fpsFinal);
    const continuityGood = telemetryContinuity !== null
      ? telemetryContinuity === "PASS"
      : roundState.heuristicContinuity;
    const aestheticGood = telemetryAesthetic !== null ? telemetryAesthetic : roundState.heuristicAesthetic;

    const failureReasons: string[] = [...errorNotes];
    if (!coverageGood) failureReasons.push("coverage_missing");
    if (!fpsGood) failureReasons.push("fps_mismatch");
    if (!continuityGood) failureReasons.push("continuity_fail");
    if (!aestheticGood) failureReasons.push("aesthetic_fail");

    const success = failureReasons.length === 0;
    setRoundTripDeltas(3);

    if (success) {
      appendLog("premiere.sync -> PASS");
      setStatusMessage("Sync complete.");
    } else {
      const reason = failureReasons[0] || "unknown";
      appendLog("premiere.sync -> FAIL");
      setStatusMessage(`Sync complete with demo issues — ${reason}`);
    }
    setLastSync(formatTime(new Date()));
    setSyncing(false);
  }

  async function handleGenerate() {
    if (filling || aiPrevis || coverage.CU) return;
    setFilling(true);
    setStatusMessage("Generating AI PREVIS placeholder…");
    const args: Record<string, unknown> = { sceneId: SCENE_ID, durationSec: DEMO_DEFAULT_PREVIS_DURATION_SEC };
    if (AI_PREVIS_PATH) {
      args.path = AI_PREVIS_PATH;
    }
    const result = await runDemoJsx("demo.insertAiPrevis", args);
    if (result?.ok === false) {
      setStatusMessage(`AI fill failed: ${result.error || "insertAiPrevis failed"}`);
      setFilling(false);
      return;
    }
    setAiPrevis(true);
    setRoundTripDeltas(3);
    const roundState = await refreshFromRoundTrip();
    if (roundState.ok === false) {
      setStatusMessage(`AI PREVIS inserted with warnings: ${roundState.error || "roundtrip update failed"}`);
    } else {
      setStatusMessage("AI PREVIS inserted.");
    }
    appendLog("ai.fill -> inserted");
    setFilling(false);
  }

  async function handleReplace() {
    if (replacing || !aiPrevis || !coverage.CU) return;
    setReplacing(true);
    setStatusMessage("Replacing AI PREVIS with real coverage…");
    const result = await runDemoJsx("demo.replaceAiPrevisWithReal", { sceneId: SCENE_ID });
    if (result?.ok === false) {
      setStatusMessage(`Replace failed: ${result.error || "replaceAiPrevisWithReal failed"}`);
      setReplacing(false);
      return;
    }
    setAiPrevis(false);
    const roundState = await refreshFromRoundTrip();
    if (roundState.ok === false) {
      setStatusMessage(`Replace completed with warnings: ${roundState.error || "roundtrip update failed"}`);
    } else {
      setStatusMessage("Replaced AI PREVIS with real coverage.");
    }
    appendLog("ai.replace -> real");
    setReplacing(false);
  }

  async function handleSendBack() {
    if (sending) return;
    setSending(true);
    setStatusMessage("Comparing round-trip state…");
    const roundState = await refreshFromRoundTrip();
    const coverageGood = isCoverageGood(roundState.coverage);
    const fpsGood = isFpsGood(roundState.fps);
    const continuityGood =
      continuityStatus === "PASS"
        ? true
        : continuityStatus === "FAIL"
          ? false
          : roundState.heuristicContinuity;
    const aestheticGood =
      aestheticStatus === true ? true : aestheticStatus === false ? false : roundState.heuristicAesthetic;
    const deltas = coverageGood && fpsGood && continuityGood && aestheticGood && roundState.ok !== false ? 0 : 3;
    setRoundTripDeltas(deltas);
    appendLog(`roundtrip.compare -> deltas:${deltas}`);
    if (deltas === 0) {
      await postRoundtrip({
        sceneId: SCENE_ID,
        coverage: roundState.coverage,
        fps: roundState.fps,
        aiPrevis: roundState.aiPrevis,
        continuityOk: continuityGood,
        aestheticOk: aestheticGood,
        deltas
      });
      setStatusMessage("Round-trip check complete.");
    } else {
      setStatusMessage("Round-trip discrepancies remain.");
    }
    setSending(false);
  }

  const coverageSubtext = coverage.CU
    ? "Bins populated by shot_id."
    : "Missing CU; panel can insert AI PREVIS.";
  const continuityLabel = continuityStatus
    ? `${continuityStatus}${continuitySource === "heuristic" ? " (est.)" : ""}`
    : "—";
  const continuityChipStyles = continuityBadgeStyle(continuityStatus);
  const aestheticLabel =
    aestheticStatus === null
      ? "—"
      : `${aestheticStatus ? "PASS" : "FAIL"}${aestheticSource === "heuristic" ? " (est.)" : ""}`;
  const aestheticChipStyles = aestheticBadgeStyle(aestheticStatus);
  const timelineMessage = aiPrevis
    ? "AI PREVIS inserted on V2 (watermarked)."
    : coverage.CU
      ? "Real CU detected — AI PREVIS replaced."
      : "CU coverage missing — cue fill recommendation.";
  const roundTripText =
    roundTripDeltas === 0 ? "0 deltas" : `${roundTripDeltas} deltas vs. Light`;
  const roundTripCaption = typeof roundTripDeltas === "number" ? `Round-trip ${roundTripDeltas}` : "";
  const lastSyncDisplay = lastSync ?? "—";

  const canGenerate =
    !syncing && !filling && !replacing && !sending && !coverage.CU && !aiPrevis;
  const canReplace =
    !syncing && !filling && !replacing && !sending && aiPrevis && coverage.CU;
  const canSendBack = !sending && !syncing && !filling && !replacing;

  return (
    <div style={{padding:12, display:"grid", gap:16}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12}}>
        <h3 style={{margin:0}}>Light — Premiere Bridge (Demo)</h3>
        <div style={{display:"grid", gap:2, textAlign:"right"}}>
          <div style={{display:"flex", alignItems:"center", gap:6, justifyContent:"flex-end", flexWrap:"wrap", fontSize:12, color:"#bbb"}}>
            {SCENE_PROGRESS_STRIP.map((item, idx) => (
              <React.Fragment key={item.id}>
                {idx > 0 && <span>•</span>}
                <span title={item.title}>{item.display}</span>
              </React.Fragment>
            ))}
          </div>
          {roundTripCaption && <div style={{fontSize:10, color:"#888"}}>{roundTripCaption}</div>}
        </div>
      </div>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <button onClick={handleSync} disabled={syncing || filling || replacing || sending}>Sync from Light</button>
        <button onClick={handleGenerate} disabled={!canGenerate}>Generate AI Fill (panel)</button>
        <button onClick={handleReplace} disabled={!canReplace}>Replace AI with Real</button>
        <button onClick={handleSendBack} disabled={!canSendBack}>Send back to Light</button>
      </div>
      <div style={{fontSize:12, color:"#bbb"}}>{statusMessage}</div>

      <div style={{display:"grid", gap:12}}>
        <div style={{border:"1px solid #333", borderRadius:8, padding:12, display:"grid", gap:8}}>
          <div style={{fontWeight:600}}>Bin Coverage — {SCENE_ID}</div>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <span style={chipStyle(coverage.WS)}>{chipLabel("WS", coverage.WS)}</span>
            <span>·</span>
            <span style={chipStyle(coverage.MS)}>{chipLabel("MS", coverage.MS)}</span>
            <span>·</span>
            <span style={chipStyle(coverage.CU)}>{chipLabel("CU", coverage.CU)}</span>
          </div>
          <div style={{fontSize:12, color:"#bbb"}}>{coverageSubtext}</div>
          <div style={{display:"flex", alignItems:"center", gap:6, fontSize:12}}>
            <span style={{color:"#999"}}>Continuity:</span>
            <span style={continuityChipStyles}>{continuityLabel}</span>
          </div>
          <div style={{display:"flex", alignItems:"center", gap:6, fontSize:12}}>
            <span style={{color:"#999"}}>Aesthetic:</span>
            <span style={aestheticChipStyles}>{aestheticLabel}</span>
          </div>
        </div>

        <div style={{border:"1px solid #333", borderRadius:8, padding:12, display:"grid", gap:8}}>
          <div style={{fontWeight:600}}>Timeline Status</div>
          <div>Markers: {markersCount}</div>
          <div>{timelineMessage}</div>
          <div style={{textAlign:"right", fontSize:12}}>Last sync: {lastSyncDisplay}</div>
        </div>

        <div style={{border:"1px solid #333", borderRadius:8, padding:12, display:"grid", gap:8}}>
          <div style={{fontWeight:600}}>Round-trip Health</div>
          <div>{roundTripText}</div>
        </div>
      </div>
      <div style={{borderTop:"1px solid #333", paddingTop:12, fontFamily:"monospace", fontSize:12, display:"grid", gap:6}}>
        <div style={{fontWeight:600}}>Event Log</div>
        {eventLog.length === 0 ? (
          <div style={{color:"#666"}}>—</div>
        ) : (
          eventLog.map((line, idx) => (
            <div key={`${idx}-${line}`}>{line}</div>
          ))
        )}
      </div>
    </div>
  );
}

function runDemoJsx<T extends JsxResponse = JsxResponse>(type: DemoCommandType, args?: Record<string, unknown>): Promise<T> {
  return new Promise((resolve) => {
    try {
      execJSX({ type, args }, (res) => {
        resolve(((res ?? {}) as T));
      });
    } catch (error) {
      resolve(({ ok: false, error: error instanceof Error ? error.message : String(error) } as unknown) as T);
    }
  });
}

async function fetchTelemetry(): Promise<any> {
  const endpoints = ["/api/demo/telemetry", "/api/demo/state"];
  let lastError: unknown = null;
  for (const path of endpoints) {
    try {
      const response = await fetch(buildLightUrl(path), { method: "GET", credentials: "omit" });
      if (response.ok) {
        return await response.json();
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Telemetry unavailable");
}

function buildLightUrl(path: string): string {
  const trimmedBase = LIGHT_BASE_URL.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
}

function extractCoverage(value: any): DemoCoverage {
  if (Array.isArray(value)) {
    const items = value.map((entry) => (typeof entry === "string" ? entry.toUpperCase() : ""));
    return {
      WS: items.includes("WS") || items.includes("WIDE"),
      MS: items.includes("MS") || items.includes("MEDIUM"),
      CU: items.includes("CU") || items.includes("CLOSE")
    };
  }
  if (value && typeof value === "object") {
    return mapCoverage(value);
  }
  return { ...DEFAULT_COVERAGE };
}

function mapCoverage(input: any): DemoCoverage {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_COVERAGE };
  }
  const pick = (keys: string[]) => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        return (input as Record<string, unknown>)[key];
      }
    }
    return undefined;
  };
  return {
    WS: boolFrom(pick(["WS", "ws", "Wide", "wide"])),
    MS: boolFrom(pick(["MS", "ms", "Medium", "medium"])),
    CU: boolFrom(pick(["CU", "cu", "Close", "close"]))
  };
}

function boolFrom(value: unknown): boolean {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["good", "true", "yes", "present", "1", "ok"].includes(normalized)) {
      return true;
    }
    if (["bad", "false", "no", "absent", "0"].includes(normalized)) {
      return false;
    }
  }
  return false;
}

function parseFps(value: unknown): number | null {
  if (typeof value === "number" && isFinite(value)) {
    return Math.round(value * 1000) / 1000;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return Math.round(parsed * 1000) / 1000;
    }
  }
  return null;
}

function extractMarkers(source: any): number | null {
  if (!source || typeof source !== "object") return null;
  const candidates = [
    (source as any).markers,
    (source as any).markerCount,
    (source as any).markersCount,
    (source as any).timeline?.markers,
    (source as any).timeline?.markerCount
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && !isNaN(candidate)) {
      return candidate;
    }
  }
  return null;
}

function extractContinuityStatus(source: any): ContinuityState {
  if (!source || typeof source !== "object") return null;
  const candidates = [
    (source as any).continuity,
    (source as any).continuityStatus,
    (source as any).assist ? (source as any).assist.continuity : undefined,
    (source as any).status ? (source as any).status.continuity : undefined,
    (source as any).scene ? (source as any).scene.continuity : undefined
  ];
  for (let i = 0; i < candidates.length; i++) {
    const parsed = parseContinuityStatus(candidates[i]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseContinuityStatus(value: unknown): ContinuityState {
  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "pass")) {
      const pass = (value as any).pass;
      if (typeof pass === "boolean") {
        return pass ? "PASS" : "FAIL";
      }
    }
  }
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (["PASS", "GOOD", "OK", "TRUE", "YES"].includes(normalized)) return "PASS";
    if (["FAIL", "BAD", "NO", "FALSE"].includes(normalized)) return "FAIL";
  }
  if (typeof value === "boolean") {
    return value ? "PASS" : "FAIL";
  }
  if (typeof value === "number") {
    if (value > 0) return "PASS";
    if (value === 0) return "FAIL";
  }
  return null;
}

function extractAestheticStatus(source: any): boolean | null {
  if (!source || typeof source !== "object") return null;
  const candidates = [
    (source as any).aesthetic,
    (source as any).style,
    (source as any).assist ? (source as any).assist.aesthetic : undefined
  ];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;
    if (typeof candidate === "boolean") return candidate;
    if (typeof candidate === "object" && Object.prototype.hasOwnProperty.call(candidate, "pass")) {
      const pass = (candidate as any).pass;
      if (typeof pass === "boolean") return pass;
    }
  }
  return null;
}

function continuityBadgeStyle(status: ContinuityState): React.CSSProperties {
  const color = status === "PASS" ? "#27ae60" : status === "FAIL" ? "#e74c3c" : "#777";
  return {
    padding: "2px 8px",
    borderRadius: 12,
    border: `1px solid ${color}`,
    color,
    fontSize: 12,
    fontWeight: 600
  };
}

function aestheticBadgeStyle(status: boolean | null): React.CSSProperties {
  const color = status === true ? "#27ae60" : status === false ? "#e74c3c" : "#777";
  return {
    padding: "2px 8px",
    borderRadius: 12,
    border: `1px solid ${color}`,
    color,
    fontSize: 12,
    fontWeight: 600
  };
}

function isFpsGood(fpsValue: number | null): boolean {
  if (fpsValue === null) return false;
  return Math.abs(fpsValue - FPS_TARGET) <= 0.05;
}

function isCoverageGood(current: DemoCoverage): boolean {
  return !!(current.WS && current.MS && current.CU);
}

function formatTime(date: Date): string {
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

async function postRoundtrip(payload: { sceneId: string; coverage: DemoCoverage; fps: number | null; aiPrevis: boolean; continuityOk: boolean; aestheticOk: boolean; deltas: number }): Promise<void> {
  try {
    await fetch(buildLightUrl("/api/demo/panel/roundtrip"), {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    // best effort
  }
}
