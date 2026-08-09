import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function readJson<T>(path: string, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (fallback !== undefined && (error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

export async function listJson<T>(directory: string): Promise<T[]> {
  await ensureDir(directory);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  const values: T[] = [];
  for (const name of files) {
    try { values.push(await readJson<T>(join(directory, name))); }
    catch { /* Ignore a partially written or incompatible record. */ }
  }
  return values;
}
