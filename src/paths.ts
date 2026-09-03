import path from "node:path";

export function moduleStem(filePath: string): string {
  return path.basename(filePath).replace(/\.[jt]sx?$/, "");
}
