import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const databaseUrl = process.env.DATABASE_URL || "file:../data/app.db";
if (!databaseUrl.startsWith("file:")) throw new Error("当前迁移器仅支持 SQLite file: DATABASE_URL");

const rawPath = databaseUrl.slice("file:".length).split("?")[0];
const databasePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), "prisma", rawPath);
mkdirSync(path.dirname(databasePath), { recursive: true });
if (!existsSync(databasePath)) closeSync(openSync(databasePath, "a"));

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA foreign_keys = ON");
database.exec("CREATE TABLE IF NOT EXISTS _app_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
const applied = database.prepare("SELECT 1 FROM _app_migrations WHERE name = ?");
const record = database.prepare("INSERT INTO _app_migrations (name, applied_at) VALUES (?, ?)");
const migrationsRoot = path.resolve(process.cwd(), "prisma", "migrations");

for (const name of readdirSync(migrationsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
  if (applied.get(name)) continue;
  const sql = readFileSync(path.join(migrationsRoot, name, "migration.sql"), "utf8");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(sql);
    record.run(name, new Date().toISOString());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

database.exec("PRAGMA optimize");
database.close();
