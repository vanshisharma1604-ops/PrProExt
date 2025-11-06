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

export async function openLogin(){
  // system-browser OAuth handoff
  // Call POST /auth/premiere/start to get the authorizeUrl
  const currentRid = rid();
  try {
    const response = await fetch(`${API}/auth/premiere/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rid: currentRid }),
      credentials: "omit"
    });
    
    if (response.ok) {
      const data = await response.json();
      // Open the authorizeUrl from the server response (not the API endpoint)
      if (data?.authorizeUrl) {
        cs.openURLInDefaultBrowser(data.authorizeUrl);
      } else {
        console.error("No authorizeUrl in response:", data);
      }
    } else {
      console.error("Failed to start auth:", response.status, await response.text());
    }
  } catch (error) {
    console.error("Error starting auth:", error);
  }
}

export function pollAuthStatus(onToken:(t:string)=>void){
  // Poll GET /auth/premiere/status/:rid for the token
  const currentRid = rid();
  const url = `${API}/auth/premiere/status/${encodeURIComponent(currentRid)}`;
  const stop = { active: true };
  const tick = async () => {
    if(!stop.active) return;
    try{
      const r = await fetch(url, { 
        method: "GET",
        credentials: "omit",
        headers: {
          "Accept": "application/json"
        }
      });
      if (r.ok) {
        const j = await r.json();
        if (j?.ok && j?.token) { 
          localStorage.setItem("light_token", j.token); 
          onToken(j.token); 
          stop.active = false; 
          return; 
        }
      }
    } catch (error) {
      console.error("Poll error:", error);
    }
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
  const headers: Record<string,string> = { 
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  const token = localStorage.getItem("light_token") || "";
  const apikey = localStorage.getItem("light_apikey") || "";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (useApiKey && apikey) headers["X-Api-Key"] = apikey;
  return fetch(url, { 
    method:"POST", 
    headers, 
    body: JSON.stringify(body),
    credentials: "omit"
  });
}

