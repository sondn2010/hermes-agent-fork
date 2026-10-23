import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error -- plain .mjs script without type declarations
import { homesFromConfigPath } from "../install.mjs";

describe("homesFromConfigPath", () => {
  function tree() {
    const root = mkdtempSync(join(tmpdir(), "bkt-home-"));
    for (const name of ["work", "alt"]) mkdirSync(join(root, "profiles", name), { recursive: true });
    writeFileSync(join(root, "profiles", "stray.txt"), "");
    return root;
  }

  it("lists the root home and each profile home from the root config", () => {
    const root = tree();
    expect(homesFromConfigPath(join(root, "config.yaml"))).toEqual([
      root, join(root, "profiles", "alt"), join(root, "profiles", "work"),
    ]);
  });

  it("walks up from a non-default active profile", () => {
    const root = tree();
    expect(homesFromConfigPath(join(root, "profiles", "work", "config.yaml"))[0]).toBe(root);
  });
});
