import { defineConfig } from "vite";

// In CI we override the base to "/git-galaxy/" so the app loads correctly
// under GitHub Pages' subpath. Locally the relative base "./" is fine.
const base = process.env.VITE_BASE ?? "./";

export default defineConfig({
  base,
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
