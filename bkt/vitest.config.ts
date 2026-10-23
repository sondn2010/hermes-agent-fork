import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@hermes\/shared\/(.*)$/, replacement: here("../apps/shared/src/") + "$1" },
      { find: /^@bkt\/shared\/(.*)$/, replacement: here("./shared/") + "$1" },
    ],
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["shared/**/*.test.ts", "shared/**/*.test.tsx", "packages/*/src/**/*.test.ts", "packages/*/src/**/*.test.tsx", "scripts/*.test.ts"],
    server: { deps: { inline: [/@hermes\/shared/] } },
  },
});
