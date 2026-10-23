#!/usr/bin/env node
// Install the BKT dashboard extras into a Hermes checkout and its homes.
//
//   node bkt/install.mjs                 build everything, install the theme in every home
//   node bkt/install.mjs --home <dir>    install the theme only into <dir>
//   node bkt/install.mjs --skip-npm      reuse bkt/node_modules (offline re-run)
//
// The dashboard reads themes from the home it was launched with, so by default the theme goes
// into the root home and every profile home. Homes come from Hermes itself, never a fixed path.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BKT = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BKT, "..");
const THEME_DIR = join(BKT, "theme");
const IS_WINDOWS = process.platform === "win32";

function parseArgs(argv) {
  const args = { home: null, skipNpm: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--home") args.home = argv[++i];
    else if (argv[i] === "--skip-npm") args.skipNpm = true;
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("usage: node bkt/install.mjs [--home <dir>] [--skip-npm]");
      process.exit(0);
    } else {
      console.error(`unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (args.home === undefined) {
    console.error("--home needs a directory");
    process.exit(2);
  }
  return args;
}

function run(cmd, args) {
  // npm is a .cmd shim on Windows, which only runs through a shell.
  const result = spawnSync(cmd, args, { cwd: REPO, stdio: "inherit", shell: IS_WINDOWS && cmd === "npm" });
  if (result.status !== 0) {
    console.error(`failed: ${cmd} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

/** The active home's config.yaml, as Hermes resolves it (HERMES_HOME, active profile, ...). */
function activeConfigPath() {
  try {
    return execFileSync("hermes", ["config", "path"], { encoding: "utf8", shell: IS_WINDOWS }).trim().split(/\r?\n/).pop();
  } catch {
    return null;
  }
}

/** The root home plus every profile home under ``<root>/profiles/``. */
export function homesFromConfigPath(configPath) {
  const active = dirname(configPath);
  const parent = dirname(active);
  const root = basename(parent) === "profiles" ? dirname(parent) : active;
  const homes = [root];
  const profilesDir = join(root, "profiles");
  if (existsSync(profilesDir)) {
    for (const name of readdirSync(profilesDir).sort()) {
      const dir = join(profilesDir, name);
      if (statSync(dir).isDirectory()) homes.push(dir);
    }
  }
  return homes;
}

function installTheme(homes) {
  const themes = readdirSync(THEME_DIR).filter((f) => f.endsWith(".yaml")).sort();
  for (const home of homes) {
    const target = join(home, "dashboard-themes");
    mkdirSync(target, { recursive: true });
    for (const theme of themes) copyFileSync(join(THEME_DIR, theme), join(target, theme));
    console.log(`theme  ${target}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.skipNpm) run("npm", ["--prefix", "bkt", "ci"]);
  run(process.execPath, [join(BKT, "scripts", "build.mjs"), "--vendor"]);

  let homes;
  if (args.home) {
    homes = [resolve(args.home)];
  } else {
    const configPath = activeConfigPath();
    if (!configPath) {
      console.error("could not run `hermes config path`; pass --home <dir> to name the home");
      process.exit(1);
    }
    homes = homesFromConfigPath(configPath);
  }
  installTheme(homes);
  console.log("\nDone. Restart the dashboard if it is running: plugin API routes mount at startup.");
  console.log("Then pick the BachKhoa Technology theme in the dashboard's theme picker.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
