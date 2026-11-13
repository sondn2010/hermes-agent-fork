#!/usr/bin/env node
// Fail when this branch changes anything but new BKT paths, so an upstream merge gains no new
// conflicts.  Usage: node bkt/scripts/check-additive.mjs [base-ref]   (default: main-bktech)
import { execFileSync } from "node:child_process";

const ALLOWED_NEW_ROOTS = [/^bkt\//, /^plugins\/bkt-[^/]+\//, /^tests\/plugins\/bkt_[^/]+\//, /^docs\/bkt\//];
// Plans and reports are planning records, not product code.
const PLANNING = /^plans\//;
// The brand source image was committed on this branch before the BKT work began; the user kept it.
const KEPT_FILES = new Set(["Logo.png"]);

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export function classify(nameStatus) {
  const problems = [];
  for (const line of nameStatus.split("\n")) {
    if (!line.trim()) continue;
    const [status, ...paths] = line.split("\t");
    const kind = status[0];
    const path = paths[paths.length - 1];
    if (paths.every((p) => PLANNING.test(p))) continue;
    if (kind === "A" && (ALLOWED_NEW_ROOTS.some((re) => re.test(path)) || KEPT_FILES.has(path))) continue;
    problems.push(`${status}\t${paths.join(" -> ")}`);
  }
  return problems;
}

function main() {
  const base = process.argv[2] ?? "main-bktech";
  const mergeBase = git("merge-base", base, "HEAD").trim();
  // Committed changes plus uncommitted edits to tracked files, so a scratch edit fails too.
  const committed = git("diff", "--name-status", "--find-renames", `${mergeBase}...HEAD`);
  const working = git("diff", "--name-status", "--find-renames", "HEAD");
  const problems = [...new Set(classify(`${committed}\n${working}`))];
  if (problems.length) {
    console.error(`check-additive: ${problems.length} change(s) outside the allowed new BKT roots (base ${base}):`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`check-additive: OK (base ${base} @ ${mergeBase.slice(0, 10)})`);
}

if (process.argv[1]?.endsWith("check-additive.mjs")) main();
