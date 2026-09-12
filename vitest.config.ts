import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    environmentMatchGlobs: [["src/ui/**", "jsdom"]],
    setupFiles: ["src/ui/test-setup.ts"]
  }
});
