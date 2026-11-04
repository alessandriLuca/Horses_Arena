import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // i test del mondo simulano giorni interi di corse: sui runner lenti servono più di 5 secondi
    testTimeout: 120_000,
    include: ["test/**/*.test.ts"],
  },
});
