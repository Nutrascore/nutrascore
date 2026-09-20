import { db } from "./index.js";

async function main() {
  const result = await db.execute("SELECT NOW()");
  console.log("Database connected:", result.rows[0]);
}

main();