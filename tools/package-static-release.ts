import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, cp, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Distribute only a freshly built, public static app: never node_modules, .env or SQLite.
const root = process.cwd();
async function realParents(file: string) {
  const rel = path.relative(root, path.resolve(file));
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Path outside build root");
  let directory = root;
  for (const part of rel.split(path.sep).slice(0, -1)) {
    directory = path.join(directory, part);
    if (!(await lstat(directory)).isDirectory()) throw new Error(`Expected real directory: ${directory}`);
  }
}
async function regular(file: string) { await realParents(file); if (!(await lstat(file)).isFile()) throw new Error(`Expected regular file: ${file}`); }
async function safeCopy(from: string, to: string) { await regular(from); await cp(from, to); }
await regular(path.join(root, "package.json"));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(pkg.version)) throw new Error("Invalid release version");
const name = `understanding-lab-${pkg.version}-static`;
const output = path.join(root, "tmp/releases");
const stage = path.join(output, name);
for (const directory of [path.join(root, "tmp"), output]) {
  await mkdir(directory, { recursive: true });
  if (!(await lstat(directory)).isDirectory()) throw new Error(`Expected real directory: ${directory}`);
}
await rm(stage, { recursive: true, force: true });
await mkdir(path.join(stage, "site"), { recursive: true });
const extensions = new Set([".html", ".js", ".css", ".json", ".svg", ".png", ".webp", ".ico", ".webmanifest", ".txt"]);
async function copyPublic(dir: string, relative = "") {
  if (!(await lstat(dir)).isDirectory()) throw new Error(`Expected real directory: ${dir}`);
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const rel = path.join(relative, item.name);
    if (item.isSymbolicLink() || item.name.startsWith(".")) throw new Error(`Refusing hidden path or symlink: ${rel}`);
    if (item.isDirectory()) await copyPublic(path.join(dir, item.name), rel);
    else {
      if (!extensions.has(path.extname(item.name)) || item.name.startsWith(".")) throw new Error(`Unexpected public file: ${rel}`);
      await mkdir(path.dirname(path.join(stage, "site", rel)), { recursive: true });
      await safeCopy(path.join(dir, item.name), path.join(stage, "site", rel));
    }
  }
}
await copyPublic(path.join(root, "dist"));
const sw = await readFile(path.join(stage, "site/sw.js"), "utf8");
if (sw.includes("__PRECACHE__") || sw.includes("__CACHE_NAME__")) throw new Error("Run build:offline first");
await readFile(path.join(stage, "site/index.html"));
await readFile(path.join(stage, "site/THIRD_PARTY_LICENSES.txt"));
await safeCopy("LICENSE", path.join(stage, "LICENSE"));
await safeCopy("THIRD_PARTY_NOTICES.md", path.join(stage, "THIRD_PARTY_NOTICES.md"));
await mkdir(path.join(stage, "licenses"));
for (const dep of ["react", "react-dom", "scheduler"]) {
  if (!(await lstat(path.join(root, "node_modules", dep))).isDirectory()) throw new Error(`Expected real dependency directory: ${dep}`);
  await safeCopy(path.join(root, "node_modules", dep, "LICENSE"), path.join(stage, "licenses", `${dep}-LICENSE.txt`));
}
await safeCopy("docs/static-release-readme.md", path.join(stage, "README.md"));
await safeCopy("tools/serve-static.py", path.join(stage, "serve.py"));
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = Boolean(execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8" }).trim());
await writeFile(path.join(stage, "BUILD.json"), JSON.stringify({ name: pkg.name, version: pkg.version, sourceCommit, dirty, node: process.version, scope: "static local-first course; optional backend services excluded" }, null, 2) + "\n");
const files: string[] = [];
async function collect(dir: string, prefix = "") {
  if (!(await lstat(dir)).isDirectory()) throw new Error(`Expected real directory: ${dir}`);
  await chmod(dir, 0o755);
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const rel = path.join(prefix, item.name);
    if (item.isDirectory()) await collect(path.join(dir, item.name), rel); else { await regular(path.join(dir, item.name)); await chmod(path.join(dir, item.name), 0o644); files.push(rel); }
  }
}
await collect(stage);
const checksums: string[] = [];
for (const file of files.sort()) checksums.push(`${createHash("sha256").update(await readFile(path.join(stage, file))).digest("hex")}  ${file}`);
await writeFile(path.join(stage, "SHA256SUMS"), checksums.join("\n") + "\n");
await chmod(path.join(stage, "SHA256SUMS"), 0o644);
// GNU tar normalizes metadata; gzip -n omits timestamp/name for reproducible archives.
const tar = execFileSync("tar", ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-cf", "-", "-C", output, name], { maxBuffer: 32 * 1024 * 1024 });
const archive = execFileSync("gzip", ["-n", "-9"], { input: tar, maxBuffer: 32 * 1024 * 1024 });
const filename = `${name}.tar.gz`;
for (const target of [path.join(output, filename), path.join(output, `${filename}.sha256`)]) {
  try { await regular(target); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
await writeFile(path.join(output, filename), archive);
const hash = createHash("sha256").update(archive).digest("hex");
await writeFile(path.join(output, `${filename}.sha256`), `${hash}  ${filename}\n`);
console.log(JSON.stringify({ archive: path.join(output, filename), sha256: hash, files: files.length, sourceCommit, dirty }));
