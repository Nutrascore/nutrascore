import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
    include: ["tests/integration/api/**/*.test.ts"],
  },
});
