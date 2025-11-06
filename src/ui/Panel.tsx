import React from "react";
import { connectWS, execJSX, openLogin, pollAuthStatus, snapshot, postJSON, API } from "../ext";
import type { Command } from "../protocol";

export default function Panel(){
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

  async function login(){
    pollStopRef.current?.();
    setStatus("Waiting for browser login…");
    // open Google OAuth in the system browser (required; Google blocks embedded auth)
    await openLogin();
    // poll the backend until the OAuth flow completes
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

