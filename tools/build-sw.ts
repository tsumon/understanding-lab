import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const allowedExtensions = new Set([".html", ".js", ".css", ".json", ".svg", ".png", ".webp", ".ico"]);

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => entry.isDirectory()
    ? filesUnder(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  return paths.flat();
}

const files = (await filesUnder(dist)).filter((file) => file !== path.join(dist, "sw.js") && allowedExtensions.has(path.extname(file))).sort();
if (!files.some((file) => file === path.join(dist, "index.html")) || !files.some((file) => file.endsWith("overfitting.v1.json"))) {
  throw new Error("Required public offline files are missing");
}
const hash = createHash("sha256");
for (const file of files) { hash.update(path.relative(dist, file)); hash.update(await readFile(file)); }
const cacheName = `understanding-lab-public-${hash.digest("hex").slice(0, 16)}`;
const allowlist = files.map((file) => `/${path.relative(dist, file).split(path.sep).join("/")}`);
allowlist.push("/");
const template = await readFile(path.join(root, "public/sw.js"), "utf8");
const output = template.replace('"__CACHE_NAME__"', JSON.stringify(cacheName)).replace("__PRECACHE__", JSON.stringify(allowlist));
await writeFile(path.join(dist, "sw.js"), output);
console.log(`Offline cache ${cacheName}: ${allowlist.length} public routes`);
