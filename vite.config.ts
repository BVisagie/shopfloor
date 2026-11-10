import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths, so the build works under any GitHub Pages folder.
  base: "./",
  plugins: [react()],
  test: { include: ["tests/**/*.test.ts"] },
});
