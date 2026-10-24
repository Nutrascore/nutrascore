import cors from "@fastify/cors";
import Fastify from "fastify";
import type { ShowcaseCatalog } from "./showcase-data.js";
import { registerShowcaseRoutes } from "./showcase-routes.js";

export async function createShowcaseApp(catalog: ShowcaseCatalog) {
  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: ["http://localhost:5174", "http://127.0.0.1:5174"],
    credentials: true,
    methods: ["GET", "HEAD", "OPTIONS"],
  });
  registerShowcaseRoutes(app, catalog);
  return app;
}
