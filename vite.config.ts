import { defineConfig } from "vite";
import { copyFileSync, mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

export default defineConfig({
  base: "./",
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "public/index.html"
    }
  },
  server: { port: 5173 },
  plugins: [
    {
      name: "copy-cep-files",
      writeBundle() {
        const distRoot = "dist";

        const ensureDir = (path: string) => {
          if (!existsSync(path)) {
            mkdirSync(path, { recursive: true });
          }
        };

        // Copy CSXS manifest (uppercase and lowercase for CEP compatibility)
        const upperCsxsDir = join(distRoot, "CSXS");
        const lowerCsxsDir = join(distRoot, "csxs");
        ensureDir(upperCsxsDir);
        ensureDir(lowerCsxsDir);
        copyFileSync("CSXS/manifest.xml", join(upperCsxsDir, "manifest.xml"));
        copyFileSync("CSXS/manifest.xml", join(lowerCsxsDir, "manifest.xml"));

        // Copy JSX files
        const distJsxDir = join(distRoot, "jsx");
        ensureDir(distJsxDir);
        copyFileSync("jsx/bridge.jsx", join(distJsxDir, "bridge.jsx"));
        copyFileSync("jsx/commands.jsx", join(distJsxDir, "commands.jsx"));
        copyFileSync("jsx/snapshot.jsx", join(distJsxDir, "snapshot.jsx"));

        // Ensure built HTML is available at the root for CEP
        const builtHtmlPath = join(distRoot, "public", "index.html");
        const distHtmlPath = join(distRoot, "index.html");
        if (existsSync(builtHtmlPath)) {
          copyFileSync(builtHtmlPath, distHtmlPath);
          if (existsSync(distHtmlPath)) {
            const html = readFileSync(distHtmlPath, "utf8").replace(/"\.\.\/assets\//g, "\"./assets/");
            writeFileSync(distHtmlPath, html, "utf8");
          }
        }

        // Write .debug file for unsigned CEP development builds
        const debugPath = join(distRoot, ".debug");
        const debugContent = `<?xml version="1.0" encoding="UTF-8"?>\n<ExtensionList>\n    <Extension Id="com.lightskiddo.ppro.panel">\n        <HostList>\n            <Host Name="PPRO" Port="8090"/>\n        </HostList>\n    </Extension>\n</ExtensionList>\n`;
        writeFileSync(debugPath, debugContent, "utf8");
      }
    }
  ]
});

