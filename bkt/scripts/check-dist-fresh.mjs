#!/usr/bin/env node
// Rebuild every bkt-* bundle and fail when the committed dist files differ from the result.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

execFileSync(process.execPath, [resolve(REPO, "bkt", "scripts", "build.mjs")], { cwd: REPO, stdio: "inherit" });
const status = execFileSync(
  "git", ["status", "--porcelain", "--untracked-files=all", "--", ":(glob)plugins/bkt-*/dashboard/dist/**"],
  { cwd: REPO, encoding: "utf8" },
);
if (status.trim()) {
  console.error("check-dist-fresh: the committed bundles are stale; commit the rebuilt files:");
  console.error(status.replace(/^/gm, "  "));
  process.exit(1);
}
console.log("check-dist-fresh: OK");
