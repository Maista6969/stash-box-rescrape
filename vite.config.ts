import { defineConfig } from "vitest/config";
import monkey, { cdn } from "vite-plugin-monkey";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
  version: string;
};

// Imports "*.css?verbatim" as a template-literal string, preserving
// newlines, comments, and formatting exactly as written on disk.
function verbatimCss(): Plugin {
  const SUFFIX = "?verbatim";
  const idToPath = new Map<string, string>();
  let counter = 0;

  return {
    name: "verbatim-css",
    enforce: "pre",
    resolveId(source, importer) {
      if (!source.endsWith(SUFFIX)) return null;
      const realPath = path.resolve(
        path.dirname(importer ?? process.cwd()),
        source.slice(0, -SUFFIX.length),
      );
      const virtualId = `\0verbatim-css-${counter++}`;
      idToPath.set(virtualId, realPath);
      return virtualId;
    },
    load(id) {
      const realPath = idToPath.get(id);
      if (!realPath) return null;
      this.addWatchFile(realPath);
      const raw = readFileSync(realPath, "utf-8");
      const safe = raw
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\$\{/g, "\\${");
      return `export default \`${safe}\`;`;
    },
  };
}
function timestampLogger(): Plugin {
  return {
    name: "timestamp-logger",
    closeBundle() {
      console.log(`built at ${new Date().toLocaleTimeString("en-gb")}`);
    },
  };
}

const GH_USER = "Maista6969";
const GH_REPO = "stash-box-rescrape";
const ASSET_NAME = "stash-box-rescrape.user.js";

export default defineConfig({
  plugins: [
    verbatimCss(),
    timestampLogger(),
    monkey({
      entry: "src/main.ts",

      userscript: {
        name: "stash-box rescrape",
        namespace: `https://github.com/${GH_USER}/${GH_REPO}`,
        version: pkg.version,
        description: "Use Stash scrapers directly on stash-box",
        match: [
          "https://stashdb.org/*",
          "https://fansdb.cc/*",
          "https://javstash.org/*",
          "https://pmvstash.org/*",
        ],
        grant: [
          "GM_setValue",
          "GM_getValue",
          "GM_addStyle",
          "unsafeWindow",
          "GM_registerMenuCommand",
          "GM_xmlhttpRequest",
        ],
        downloadURL: `https://github.com/${GH_USER}/${GH_REPO}/releases/latest/download/${ASSET_NAME}`,
        updateURL: `https://github.com/${GH_USER}/${GH_REPO}/releases/latest/download/${ASSET_NAME}`,
      },

      build: {
        fileName: ASSET_NAME,
        externalGlobals: {
          diff: cdn.unpkg("Diff", "dist/diff.min.js"),
        },
      },
    }),
  ],
  build: {
    minify: false,
    target: ["firefox152"],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: [],
  },
});
