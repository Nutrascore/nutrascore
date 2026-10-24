import { fileURLToPath } from "node:url";
import { createShowcaseApp } from "./showcase-app.js";
import { loadShowcaseCatalog } from "./showcase-data.js";

const csvPath = fileURLToPath(
  new URL(
    "../../../data/processed/packaged_foods_india_cleaned.csv",
    import.meta.url,
  ),
);

const imageManifestPath = fileURLToPath(
  new URL(
    "../../../data/processed/showcase-image-manifest.json",
    import.meta.url,
  ),
);

try {
  const catalog = await loadShowcaseCatalog(csvPath, imageManifestPath);
  const app = await createShowcaseApp(catalog);
  const port = 3001;
  await app.listen({ port, host: "127.0.0.1" });
  console.info(
    `CSV Showcase API listening at http://127.0.0.1:${port}; loaded ${catalog.products.length} products.`,
  );
} catch (error) {
  console.error("CSV Showcase Mode could not start:", error);
  process.exitCode = 1;
}
