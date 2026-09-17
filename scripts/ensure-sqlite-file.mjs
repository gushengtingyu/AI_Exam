import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL || "file:../data/app.db";
if (!databaseUrl.startsWith("file:")) process.exit(0);

const rawPath = databaseUrl.slice("file:".length).split("?")[0];
const absolutePath = path.isAbsolute(rawPath)
  ? rawPath
  : path.resolve(process.cwd(), "prisma", rawPath);

mkdirSync(path.dirname(absolutePath), { recursive: true });
if (!existsSync(absolutePath)) closeSync(openSync(absolutePath, "a"));
