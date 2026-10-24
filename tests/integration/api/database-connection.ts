import { pool } from "../../../apps/api/src/db/pool.js";

async function main() {
  try {
    const result = await pool.query<{ connected: number }>(
      "SELECT 1 AS connected",
    );
    if (result.rows[0]?.connected !== 1) {
      throw new Error(
        "PostgreSQL connectivity check returned an unexpected result.",
      );
    }
    console.log("PostgreSQL connection succeeded.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("PostgreSQL integration check failed:", error);
  process.exitCode = 1;
});
