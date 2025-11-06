import { defineConfig } from "vite";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export default defineConfig({
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
        // Copy CSXS manifest
        if (!existsSync("dist/CSXS")) mkdirSync("dist/CSXS", { recursive: true });
        copyFileSync("CSXS/manifest.xml", "dist/CSXS/manifest.xml");
        
        // Copy JSX files
        if (!existsSync("dist/jsx")) mkdirSync("dist/jsx", { recursive: true });
        copyFileSync("jsx/bridge.jsx", "dist/jsx/bridge.jsx");
        copyFileSync("jsx/commands.jsx", "dist/jsx/commands.jsx");
        copyFileSync("jsx/snapshot.jsx", "dist/jsx/snapshot.jsx");
      }
    }
  ]
});

