import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { SQL } from "drizzle-orm";
import dotenv from "dotenv";
import * as schema from "./schema.js";

dotenv.config({ path: "../../.env" });
dotenv.config();

const defaultPath = fileURLToPath(
  new URL("../../../../data/nutrascore.sqlite", import.meta.url),
);
export const databasePath = resolve(process.env.NUTRASCORE_DB_PATH ?? defaultPath);

mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("foreign_keys = ON");
sqlite.function("lower", (value: string | null) => (value ?? "").toLowerCase());
sqlite.function("normalize_product_match", (value: string | null) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLowerCase(),
);

export const database = drizzle(sqlite, { schema });

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

function prepareQuery(statement: string, values: readonly unknown[]): SQL {
  const parts: SQL[] = [];
  const parameter = /\$(\d+)/g;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = parameter.exec(statement))) {
    parts.push(sql.raw(statement.slice(start, match.index)));
    const value = values[Number(match[1]) - 1];
    const parameter = value instanceof Date
      ? value.toISOString()
      : typeof value === "boolean"
        ? Number(value)
        : value ?? null;
    parts.push(sql`${parameter}`);
    start = match.index + match[0].length;
  }

  parts.push(sql.raw(statement.slice(start)));
  return sql.join(parts, sql.empty());
}

function runQuery<T>(statement: string, values: readonly unknown[] = []): QueryResult<T> {
  const command = statement.trim().toUpperCase();
  if (["BEGIN", "BEGIN IMMEDIATE", "COMMIT", "ROLLBACK"].includes(command)) {
    sqlite.exec(command);
    return { rows: [], rowCount: 0 };
  }

  const query = prepareQuery(statement, values);
  if (/^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(statement) || /\bRETURNING\b/i.test(statement)) {
    const rows = database.all(query) as T[];
    return { rows, rowCount: rows.length };
  }

  const result = database.run(query);
  return { rows: [], rowCount: result.changes };
}

export async function query<T = Record<string, unknown>>(
  statement: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  return runQuery<T>(statement, values);
}

export function transaction<T>(callback: (run: typeof runQuery) => T): T {
  return sqlite.transaction(() => callback(runQuery)).immediate();
}
