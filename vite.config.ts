import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // Static HTML templates under public/templates/* import 3D libs from CDNs
    // (three/addons, stats-gl, etc.) directly in the browser. Vite's dep
    // scanner tries to resolve them from node_modules and warns on every boot.
    // They are not part of the app bundle — exclude them from scanning.
    entries: ["index.html", "src/**/*.{ts,tsx}"],
    exclude: ["msw", "@mswjs/interceptors", "@tanstack/react-start", "@tanstack/start-server-core"],
  },

  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    // Disable modulepreload of every async chunk — Vite's default preloads
    // hundreds of icon/page chunks on the landing page, causing the slow
    // first paint users reported. Each route fetches its own chunks on demand.
    modulePreload: { polyfill: false },
    rollupOptions: {
      external: [/^npm:/, /^https?:\/\//, /^jsr:/, /^node:/],
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("lucide-react")) return "lucide";
          if (id.includes("react-router")) return "router";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils")) return "motion";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "react-vendor";
        },
      },
    },

  },
});
