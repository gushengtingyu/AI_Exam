import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_ROOT || "./storage");

export function storageRoot() {
  return root;
}

export function resolveStorageKey(key: string) {
  const resolved = path.resolve(root, key);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("非法存储路径");
  }
  return resolved;
}

export async function savePrivateFile(analysisId: string, originalName: string, data: Buffer) {
  const safeExtension = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8) || ".bin";
  const key = path.join(/* turbopackIgnore: true */ analysisId, `${randomUUID()}${safeExtension}`).replaceAll("\\", "/");
  const fullPath = resolveStorageKey(key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, data, { flag: "wx" });
  return key;
}

export async function readPrivateFile(key: string) {
  return readFile(/* turbopackIgnore: true */ resolveStorageKey(key));
}

export async function writeProcessedFile(key: string, data: Buffer) {
  const fullPath = resolveStorageKey(key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, data);
}

export async function deletePrivateFile(key: string) {
  try {
    await unlink(resolveStorageKey(key));
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || (error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
