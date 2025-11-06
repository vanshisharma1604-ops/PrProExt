/* CEP host bridge for lightskiddo.com */
declare const CSInterface: any;
type OnState = (s: string) => void;
type OnMsg = (m: any) => void;

const cs = new (window as any).CSInterface();

function env(k: string, d?: string){ return (import.meta as any).env[k] ?? d ?? ""; }
export const API = env("VITE_API_URL", "https://api.lightskiddo.com");
export const WS  = env("VITE_WS_URL",  "wss://api.lightskiddo.com");

const RID_KEY = "light_rid";
export function rid(){ let v = localStorage.getItem(RID_KEY); if(!v){ v = crypto.randomUUID(); localStorage.setItem(RID_KEY,v); } return v; }

export function openLogin(){
  // system-browser OAuth handoff
  cs.openURLInDefaultBrowser(`${API}/auth/start?rid=${encodeURIComponent(rid())}`);
}

export function pollAuthStatus(onToken:(t:string)=>void){
  // optional short-poll fallback if WS doesn't deliver token
  const url = `${API}/auth/status?rid=${encodeURIComponent(rid())}`;
  const stop = { active: true };
  const tick = async () => {
    if(!stop.active) return;
    try{
      const r = await fetch(url, { credentials: "omit" });
      if (r.ok) {
        const j = await r.json();
        if (j?.ok && j?.token) { localStorage.setItem("light_token", j.token); onToken(j.token); stop.active = false; return; }
      }
    } catch {}
    setTimeout(tick, 2000);
  };
  tick();
  return () => { stop.active = false; };
}

export function connectWS(onMsg:OnMsg, onState:OnState){
  const token = localStorage.getItem("light_token") || "";
  const apiKey = localStorage.getItem("light_apikey") || "";
  const q = new URLSearchParams({
    rid: rid(),
    ...(token ? { token } : {}),
    ...(apiKey ? { apikey: apiKey } : {})
  });
  const w = new WebSocket(`${WS}/ws?${q.toString()}`);

  let heartbeat: number | undefined;
  const ping = () => { try{ w.send(JSON.stringify({ type:"ping", ts: Date.now() })); }catch{} };

  w.onopen = () => {
    onState("Connected");
    heartbeat = window.setInterval(ping, 25_000); // 25s heartbeat (server idle 30m)
  };
  w.onclose = () => { onState("Disconnected"); if(heartbeat) clearInterval(heartbeat); };
  w.onerror = () => { onState("Error"); if(heartbeat) clearInterval(heartbeat); };
  w.onmessage = (e) => onMsg(JSON.parse(e.data));
  return w;
}

export function execJSX(cmd: any, cb:(res:any)=>void){
  const payload = JSON.stringify(cmd).replace(/'/g,"\\'");
  cs.evalScript(`__light_exec('${payload}')`, (res: string) => {
    try{ cb(JSON.parse(res||"{}")); } catch { cb({}); }
  });
}

export function snapshot(cb:(snap:any)=>void){
  cs.evalScript(`__light_snapshot()`, (res: string) => {
    try{ cb(JSON.parse(res||"{}")); }catch{ cb({ok:false}); }
  });
}

export async function postJSON(url:string, body:any, useApiKey:boolean){
  const headers: Record<string,string> = { "Content-Type": "application/json" };
  const token = localStorage.getItem("light_token") || "";
  const apikey = localStorage.getItem("light_apikey") || "";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (useApiKey && apikey) headers["X-Api-Key"] = apikey;
  return fetch(url, { method:"POST", headers, body: JSON.stringify(body) });
}

