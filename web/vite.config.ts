// Vite builds the website; Vitest runs its tests (step 5.3a). Data files are served from web/public/ (e.g. /data/...).
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Only the real site (index.html) is built; the design prototypes in prototypes/ are not.
    rollupOptions: { input: "index.html" },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
