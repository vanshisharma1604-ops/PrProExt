# Light Copilot (Premiere CEP) — lightskiddo.com

## Dev quick start
1) Put **Adobe CSInterface.js** into `public/libs/CSInterface.js`.
2) Enable dev panels (mac):

```bash
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
```

3) Build:

```bash
npm i
npm run build
```

4) Install:
- Copy `dist/` → `~/Library/Application Support/Adobe/CEP/extensions/com.lightskiddo.ppro.panel/`
- Premiere → Window → Extensions → **Light Copilot**

## Usage
- **Login in Browser**: opens `https://api.lightskiddo.com/auth/start?rid=...`
- The panel polls `/auth/status?rid=...` and also accepts a WS `{type:"auth_ok", token}`
- **Connect**: opens `wss://api.lightskiddo.com/ws?rid=...&token=...` (or `&apikey=...` if API key is set)
- **Create Checkpoint**: calls `__light_snapshot()` and POSTs to `/api/v1/log/snapshot`

## Packaging (.zxp)
- Requires `ZXPSignCmd` binary and `cert.p12`

```bash
npm run package
```

## Notes
- CEP runs in CEF; avoid heavy loops in ExtendScript (sync).
- Allow CORS `Origin: null` on the API.

