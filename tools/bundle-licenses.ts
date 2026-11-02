import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** Inventory only modules actually bundled, retaining upstream license/notice text. */
export function bundleLicenses(): Plugin {
  return {
    name: "bundle-third-party-licenses",
    generateBundle(_options, bundle) {
      // Vite injects modulepreload runtime helpers via virtual modules (no node_modules ID).
      const packages = new Set<string>([path.join(process.cwd(), "node_modules/vite")]);
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const id of Object.keys(output.modules)) {
          const normalized = id.replaceAll("\\", "/");
          const index = normalized.lastIndexOf("/node_modules/");
          if (index === -1) continue;
          const suffix = normalized.slice(index + 14).split("/");
          const segments = suffix[0].startsWith("@") ? 2 : 1;
          packages.add(normalized.slice(0, index + 14) + suffix.slice(0, segments).join("/"));
        }
      }
      const notices: string[] = ["Third-party modules included in this static JavaScript build. Original upstream texts follow.\n"];
      for (const directory of [...packages].sort()) {
        const pkg = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
        const files = readdirSync(directory).filter(name => /^(licen[cs]e|copying|notice)(?:[.-]|$)/i.test(name)).sort();
        if (!files.length) throw new Error(`Bundled dependency lacks a license file: ${pkg.name}`);
        notices.push(`\n=== ${pkg.name}@${pkg.version} (${pkg.license ?? "see upstream text"}) ===\n`);
        for (const file of files) notices.push(`\n--- ${file} ---\n${readFileSync(path.join(directory, file), "utf8")}\n`);
      }
      this.emitFile({ type: "asset", fileName: "THIRD_PARTY_LICENSES.txt", source: notices.join("") });
    },
  };
}
