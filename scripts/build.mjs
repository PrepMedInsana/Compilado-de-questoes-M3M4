import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of [
  "index.html",
  "styles.css",
  "js",
  "assets",
  "data",
  "site.config.json",
  ".nojekyll",
]) {
  await cp(path.join(root, file), path.join(out, file), { recursive: true });
}
console.log("Site estático preparado em dist/.");
