import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Run the production build first with NEXT_PUBLIC_BASE_PATH=/semester-report.
const release = process.argv[2] || new Date().toISOString().replace(/[-:.]/g, "");
if (!/^[a-zA-Z0-9_-]+$/.test(release)) throw new Error("Invalid release name");
const root = path.resolve("output/releases", release);
if (existsSync(root)) throw new Error("Release already exists; choose a new name");
const standalone = path.resolve(".next/standalone");
if (!existsSync(path.join(standalone, "server.js"))) throw new Error("Build standalone output first");
const engine = "libquery_engine-debian-openssl-3.0.x.so.node";
if (!existsSync(`node_modules/.prisma/client/${engine}`)) throw new Error("Run npm run db:generate first");
mkdirSync(root, { recursive: true });
cpSync(standalone, root, { recursive: true, dereference: true, filter: source => {
  const name = path.basename(source);
  return !name.startsWith(".env") && !name.includes("windows") && !name.includes("win32") && !name.includes(".tmp");
} });
for (const [source, target] of [
  [".next/static", ".next/static"], ["public", "public"],
  ["node_modules/playwright-core", "node_modules/playwright-core"],
  ["prisma/migrations", "prisma/migrations"],
  ["scripts/migrate-sqlite.mjs", "scripts/migrate-sqlite.mjs"],
  [`node_modules/.prisma/client/${engine}`, `node_modules/.prisma/client/${engine}`],
]) cpSync(source, path.join(root, target), { recursive: true });
const sharp = JSON.parse(readFileSync("node_modules/sharp/package.json", "utf8"));
for (const name of ["sharp-linux-x64", "sharp-libvips-linux-x64"]) {
  const version = sharp.optionalDependencies[`@img/${name}`];
  const archive = path.resolve(`tmp/linux-native/img-${name}-${version}.tgz`);
  if (!existsSync(archive)) throw new Error(`Download first: npm pack @img/${name}@${version} --pack-destination tmp/linux-native`);
  const dest = path.join(root, "node_modules/@img", name);
  mkdirSync(dest, { recursive: true });
  // Windows 的 tar 会把 "E:\..." 当成远程主机名，统一传相对路径
  const rel = (value) => (path.relative(process.cwd(), value) || ".").split(path.sep).join("/");
  execFileSync("tar", ["-xzf", rel(archive), "--strip-components=1", "-C", rel(dest)]);
}
function checkSecrets(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".env")) throw new Error(`Environment file in release: ${dir}`);
    if (entry.isDirectory()) checkSecrets(path.join(dir, entry.name));
  }
}
checkSecrets(root);
writeFileSync(path.join(root, "release.json"), JSON.stringify({ release, builtAt: new Date().toISOString(), basePath: "/semester-report" }, null, 2));
const archive = `${root}.tar.gz`;
execFileSync("tar", ["-czf", path.relative(process.cwd(), archive).split(path.sep).join("/"), "-C", path.relative(process.cwd(), root).split(path.sep).join("/"), "."]);
console.log(JSON.stringify({ release, root, archive }));
