import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const directory = path.dirname(filePath);
  await ensureDir(directory);

  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );

  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function ensureJsonFile<T>(
  filePath: string,
  createDefault: () => T,
): Promise<T> {
  if (!(await pathExists(filePath))) {
    const value = createDefault();
    await writeJsonAtomic(filePath, value);
    return value;
  }

  return readJsonFile<T>(filePath);
}

export async function appendJsonl(filePath: string, lines: unknown[]): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const content = `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
  await fs.appendFile(filePath, content, "utf8");
}
