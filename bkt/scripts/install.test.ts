import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error -- plain .mjs script without type declarations
import { homesFromConfigPath, installSkins, installTheme } from "../install.mjs";

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

describe("installSkins", () => {
  beforeEach(() => vi.spyOn(console, "log").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  const home = () => mkdtempSync(join(tmpdir(), "bkt-skin-"));
  const skinPath = (h: string) => join(h, "skins", "bkt.yaml");

  it("installs the bkt skin into <home>/skins/ and not as a dashboard theme", () => {
    const h = home();
    mkdirSync(join(h, "skins"));
    installSkins([h]);
    expect(existsSync(skinPath(h))).toBe(true);
    expect(existsSync(join(h, "dashboard-themes", "bkt.yaml"))).toBe(false);
  });

  it("creates the skins directory when the home has none", () => {
    const h = home();
    installSkins([h]);
    expect(existsSync(skinPath(h))).toBe(true);
  });

  it("ships custom CSS that loads nothing external", () => {
    const h = home();
    installSkins([h]);
    const skin = readFileSync(skinPath(h), "utf8");
    expect(skin).toMatch(/^name: bkt$/m);
    for (const banned of ["url(", "@import", "@font-face"]) expect(skin).not.toContain(banned);
  });

  it("keeps a user-edited skin unless forced", () => {
    const h = home();
    mkdirSync(join(h, "skins"));
    writeFileSync(skinPath(h), "name: bkt\n# edited\n");
    installSkins([h]);
    expect(readFileSync(skinPath(h), "utf8")).toContain("# edited");
    installSkins([h], { force: true });
    expect(readFileSync(skinPath(h), "utf8")).not.toContain("# edited");
  });

  it("is not picked up by the dashboard theme install", () => {
    const h = home();
    installTheme([h]);
    const themes = readdirSync(join(h, "dashboard-themes"));
    expect(themes).not.toContain("skins");
    expect(readFileSync(join(h, "dashboard-themes", "bkt.yaml"), "utf8")).toMatch(/^palette:$/m);
  });
});
