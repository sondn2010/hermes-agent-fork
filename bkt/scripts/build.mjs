#!/usr/bin/env node
// Build every bkt-* dashboard plugin bundle into plugins/bkt-<name>/dashboard/dist/.
//
//   node bkt/scripts/build.mjs            plugin bundles only (what check-dist-fresh compares)
//   node bkt/scripts/build.mjs --vendor   also the git-ignored mermaid vendor bundle
//   node bkt/scripts/build.mjs --only files,chat   just those packages
//
// Output is deterministic (no timestamps, fixed package order) so a clean rebuild of an
// unchanged source tree leaves the committed dist files byte-identical.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const BKT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(BKT, "..");
const SHARED = join(BKT, "shared");
const HERMES_SHARED = join(REPO, "apps", "shared", "src");

// Every plugin the fork ships. A package without sources yet is skipped with a notice.
export const PACKAGES = [
  "brand",
  "author",
  "profiles",
  "files",
  "chat",
  "kanban-workflow",
  "health",
  "prompts",
];

// Keeps a margin under the 500 KiB blob-size gate (scripts/ci/check_blob_size.py).
const MAX_DIST_BYTES = 450 * 1024;

const aliasPlugin = {
  name: "bkt-alias",
  setup(b) {
    const shim = (file) => ({ path: join(SHARED, "runtime", file) });
    b.onResolve({ filter: /^react$/ }, () => shim("react-shim.ts"));
    b.onResolve({ filter: /^react\/jsx(-dev)?-runtime$/ }, () => shim("jsx-runtime-shim.ts"));
    b.onResolve({ filter: /^react-dom(\/.*)?$/ }, (args) => ({
      errors: [{ text: `${args.path} must not be bundled: the host owns rendering` }],
    }));
    b.onResolve({ filter: /^mermaid(\/.*)?$/ }, (args) => ({ path: args.path, external: true }));
    // Read-only import of the desktop's shared sources; no file there is modified.
    b.onResolve({ filter: /^@hermes\/shared\// }, (args) =>
      resolveTs(join(HERMES_SHARED, args.path.slice("@hermes/shared/".length))));
    b.onResolve({ filter: /^@bkt\/shared\// }, (args) =>
      resolveTs(join(SHARED, args.path.slice("@bkt/shared/".length))));
  },
};

function resolveTs(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return { path: candidate };
  }
  return { errors: [{ text: `cannot resolve ${relative(REPO, base)}` }] };
}

function distDir(name) {
  return join(REPO, "plugins", `bkt-${name}`, "dashboard", "dist");
}

function writeIfChanged(file, content) {
  if (existsSync(file) && readFileSync(file).equals(Buffer.from(content))) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

async function buildPackage(name) {
  const entry = join(BKT, "packages", name, "src", "index.tsx");
  if (!existsSync(entry)) {
    console.log(`skip  bkt-${name} (no ${relative(REPO, entry)} yet)`);
    return [];
  }
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["es2022"],
    jsx: "automatic",
    jsxImportSource: "react",
    minify: true,
    legalComments: "none",
    charset: "utf8",
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: `/* bkt-${name}: generated from bkt/packages/${name} by bkt/scripts/build.mjs. Do not edit. */` },
    plugins: [aliasPlugin],
    logLevel: "warning",
  });
  const out = distDir(name);
  const js = result.outputFiles[0].contents;
  const sharedCss = readFileSync(join(SHARED, "styles.css"), "utf8");
  const ownCssFile = join(BKT, "packages", name, "src", "styles.css");
  const css = existsSync(ownCssFile) ? `${sharedCss}\n${readFileSync(ownCssFile, "utf8")}` : sharedCss;
  writeIfChanged(join(out, "index.js"), js);
  writeIfChanged(join(out, "style.css"), css);
  return [join(out, "index.js"), join(out, "style.css")];
}

async function buildVendorMermaid() {
  const out = join(distDir("brand"), "vendor");
  // The vendor directory is committed only for this ignore file; the bundle never is.
  writeIfChanged(join(out, ".gitignore"), "*\n!.gitignore\n");
  await build({
    stdin: {
      contents: 'import mermaid from "mermaid"; window.mermaid = mermaid;',
      resolveDir: BKT,
      loader: "js",
    },
    bundle: true,
    outfile: join(out, "mermaid.js"),
    format: "iife",
    platform: "browser",
    target: ["es2022"],
    minify: true,
    legalComments: "eof",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  });
  console.log(`vendor ${relative(REPO, join(out, "mermaid.js"))}`);
}

async function main() {
  const vendor = process.argv.includes("--vendor");
  const onlyAt = process.argv.indexOf("--only");
  const only = onlyAt > 0 ? process.argv[onlyAt + 1]?.split(",") ?? [] : null;
  const unknown = (only ?? []).filter((name) => !PACKAGES.includes(name));
  if (unknown.length) {
    console.error(`unknown package(s): ${unknown.join(", ")}`);
    process.exit(2);
  }
  const oversized = [];
  for (const name of only ?? PACKAGES) {
    for (const file of await buildPackage(name)) {
      const size = statSync(file).size;
      console.log(`built ${relative(REPO, file)} ${(size / 1024).toFixed(1)} KiB`);
      if (size > MAX_DIST_BYTES) oversized.push(`${relative(REPO, file)} is ${(size / 1024).toFixed(1)} KiB`);
    }
  }
  if (oversized.length) {
    console.error(`dist budget is ${MAX_DIST_BYTES / 1024} KiB per file:\n  ${oversized.join("\n  ")}`);
    process.exit(1);
  }
  if (vendor) await buildVendorMermaid();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
