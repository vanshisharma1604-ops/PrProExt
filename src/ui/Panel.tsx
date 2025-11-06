import React from "react";
import { connectWS, execJSX, openLogin, pollAuthStatus, snapshot, postJSON, API } from "../ext";
import type { Command } from "../protocol";

export default function Panel(){
  const [status,setStatus]=React.useState("Disconnected");
  const [apiKey,setApiKey]=React.useState(localStorage.getItem("light_apikey")||"");
  const [connecting,setConnecting]=React.useState(false);
  const wsRef = React.useRef<WebSocket|null>(null);

  function onMsg(m:any){
    if(m?.type==="auth_ok" && m?.token){ localStorage.setItem("light_token", m.token); }
    if(m?.id && m?.type){ // treat as command
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

  function login(){
    openLogin();
    // also poll status as a fallback path
    pollAuthStatus(() => setStatus("Token received"));
  }

  function checkpoint(){
    snapshot(async (snap) => {
      await postJSON(`${API}/api/v1/log/snapshot`, snap, !!apiKey);
      alert("Checkpoint sent.");
    });
  }

  return (
    <div style={{padding:12, display:"grid", gap:8}}>
      <h3 style={{margin:0}}>Light Copilot</h3>
      <div>Status: <b>{status}</b>{connecting && " (connecting…)"}</div>

      <div style={{display:"grid", gap:6}}>
        <button onClick={connect}>Connect</button>
        <button onClick={login}>Login in Browser</button>
        <input placeholder="API Key (optional)" value={apiKey}
               onChange={e=>{setApiKey(e.target.value); localStorage.setItem("light_apikey", e.target.value);}} />
        <button onClick={checkpoint}>Create Checkpoint</button>
      </div>
    </div>
  );
}

