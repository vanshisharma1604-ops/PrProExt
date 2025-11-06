// Minimal wrapper; requires ZXPSignCmd on PATH and cert.p12 in repo root
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
if (!existsSync("dist")) throw new Error("Build first: npm run build");
mkdirSync(".out", { recursive: true });
const cmd = `ZXPSignCmd -sign dist .out/light-copilot.zxp cert.p12 mypassword`;
console.log("Signing:", cmd);
try { execSync(cmd, { stdio: "inherit" }); } catch (e) { process.exit(1); }

