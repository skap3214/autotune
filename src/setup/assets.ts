import path from "node:path";
import { fileURLToPath } from "node:url";

export function getPackageRoot(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(thisDir, "..", "..");
}

export function getAssetPath(...parts: string[]): string {
  return path.join(getPackageRoot(), "assets", ...parts);
}
