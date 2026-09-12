import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["chart.js/auto"],
          statistics: ["jstat", "ml-levenberg-marquardt", "simple-statistics"],
        },
      },
    },
  },
});
