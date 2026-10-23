// @ts-expect-error -- plain .mjs script without type declarations
import { classify } from "./check-additive.mjs";

describe("check-additive classify", () => {
  it("accepts new files under the BKT roots and planning edits", () => {
    const diff = [
      "A\tbkt/package.json",
      "A\tplugins/bkt-files/dashboard/manifest.json",
      "A\ttests/plugins/bkt_files/test_ops.py",
      "A\tdocs/bkt/README.md",
      "M\tplans/x/plan.md",
      "A\tLogo.png",
    ].join("\n");
    expect(classify(diff)).toEqual([]);
  });

  it("rejects edits, deletes, renames and new files elsewhere", () => {
    const diff = [
      "M\tweb/src/App.tsx",
      "D\tplugins/kanban/dashboard/manifest.json",
      "R100\tREADME.md\tbkt/README.md",
      "A\tplugins/kanban-extra/x.py",
      "M\tplugins/bkt-files/dashboard/manifest.json",
    ].join("\n");
    expect(classify(diff)).toHaveLength(5);
  });
});
