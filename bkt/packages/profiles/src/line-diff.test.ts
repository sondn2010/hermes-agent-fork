import { diffStats, lineDiff } from "./line-diff";

describe("lineDiff", () => {
  it("marks every line unchanged for equal texts", () => {
    expect(lineDiff("a\nb", "a\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
    ]);
  });

  it("finds insertions and deletions around common lines", () => {
    const diff = lineDiff("intro\nold rule\nfooter", "intro\nnew rule\nextra\nfooter");
    expect(diff).toEqual([
      { kind: "same", text: "intro" },
      { kind: "del", text: "old rule" },
      { kind: "add", text: "new rule" },
      { kind: "add", text: "extra" },
      { kind: "same", text: "footer" },
    ]);
    expect(diffStats(diff)).toEqual({ added: 2, removed: 1 });
  });

  it("handles a new file", () => {
    expect(diffStats(lineDiff("", "one\ntwo"))).toEqual({ added: 2, removed: 1 });
  });
});
