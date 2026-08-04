import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone static build for GitHub Pages (gh-pages branch of this repo).
export default defineConfig({
  root: "web",
  base: "/tata/",
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
  },
});
