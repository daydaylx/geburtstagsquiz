import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tools/question-studio/**/*.test.mjs"],
  },
});
