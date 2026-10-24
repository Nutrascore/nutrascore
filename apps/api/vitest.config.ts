import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);

export default defineConfig({
  root: repositoryRoot,
  resolve: {
    alias: {
      fastify: require.resolve("fastify"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/api/**/*.test.ts"],
  },
});
