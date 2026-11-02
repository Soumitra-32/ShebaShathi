import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // "node" is a safe default for the pure-module tests; DOM-rendering tests
    // opt into jsdom per file with the `@vitest-environment jsdom` pragma.
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  esbuild: {
    // Match Next.js/SWC behaviour: JSX compiles to the automatic runtime, so
    // components and tests do not need a React import.
    jsx: "automatic",
  },
});
