import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const defaultStatePath = path.join(projectRoot, ".wrangler/state");
export const settingsPath = path.join(projectRoot, ".sites-runtime/local-data-location.json");

export function readLocalDataDir() {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    if (typeof settings?.path !== "string" || !path.isAbsolute(settings.path)) {
      throw new Error("本地数据位置配置必须是绝对路径");
    }
    return path.resolve(settings.path);
  } catch (error) {
    if (error?.code === "ENOENT") return defaultStatePath;
    throw error;
  }
}
