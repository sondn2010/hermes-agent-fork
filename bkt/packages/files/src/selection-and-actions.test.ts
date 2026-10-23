import { describeSkipped, isNameConflict, withConflictChoice } from "./actions";
import type { Conflict } from "./api";
import type { FileEntry } from "@bkt/shared/files";
import { menuItems } from "./ContextMenu";
import { canDropOn } from "./DragMove";
import { applyClick, EMPTY_SELECTION, retainKeys } from "./useSelection";

const KEYS = ["a", "b", "c", "d", "e"];

describe("applyClick", () => {
  it("plain click selects one and sets the anchor", () => {
    const s = applyClick(EMPTY_SELECTION, KEYS, "c");
    expect([...s.selected]).toEqual(["c"]);
    expect(s.anchor).toBe("c");
  });

  it("shift selects the range from the anchor in either direction", () => {
    const start = applyClick(EMPTY_SELECTION, KEYS, "b");
    expect([...applyClick(start, KEYS, "d", { shift: true }).selected]).toEqual(["b", "c", "d"]);
    const back = applyClick(applyClick(EMPTY_SELECTION, KEYS, "d"), KEYS, "a", { shift: true });
    expect([...back.selected].sort()).toEqual(["a", "b", "c", "d"]);
    expect(back.anchor).toBe("d");
  });

  it("toggle adds and removes single items; toggle+shift extends", () => {
    let s = applyClick(EMPTY_SELECTION, KEYS, "a");
    s = applyClick(s, KEYS, "c", { toggle: true });
    expect([...s.selected].sort()).toEqual(["a", "c"]);
    s = applyClick(s, KEYS, "a", { toggle: true });
    expect([...s.selected]).toEqual(["c"]);
    s = applyClick(s, KEYS, "d", { toggle: true });
    s = applyClick(s, KEYS, "e", { shift: true, toggle: true });
    expect([...s.selected].sort()).toEqual(["c", "d", "e"]);
  });

  it("shift without a live anchor behaves like a plain click", () => {
    expect([...applyClick({ selected: new Set(["zz"]), anchor: "zz" }, KEYS, "b", { shift: true }).selected]).toEqual(["b"]);
  });

  it("retainKeys drops vanished keys and keeps identity when nothing changed", () => {
    const s = { selected: new Set(["a", "x"]), anchor: "x" };
    const kept = retainKeys(s, KEYS);
    expect([...kept.selected]).toEqual(["a"]);
    expect(kept.anchor).toBeNull();
    const same = { selected: new Set(["a"]), anchor: "a" };
    expect(retainKeys(same, KEYS)).toBe(same);
  });
});

describe("canDropOn", () => {
  it("refuses dropping a folder on itself or its descendants", () => {
    expect(canDropOn(["/w/a"], "/w/a")).toBe(false);
    expect(canDropOn(["/w/a"], "/w/a/b")).toBe(false);
    expect(canDropOn(["C:\\w\\a"], "C:\\w\\a\\b")).toBe(false);
    expect(canDropOn(["/w/a"], "/w/ab")).toBe(true);
    expect(canDropOn([], "/w")).toBe(false);
  });
});

describe("withConflictChoice", () => {
  const conflict = new Error('409: {"detail":"a.txt already exists in /w"}');

  it("retries once with the chosen mode", async () => {
    const calls: Conflict[] = [];
    const result = await withConflictChoice(
      async (mode) => {
        calls.push(mode);
        if (mode === "fail") throw conflict;
        return mode;
      },
      async () => "rename",
    );
    expect(result).toBe("rename");
    expect(calls).toEqual(["fail", "rename"]);
  });

  it("reads the status from the host ApiError shape", async () => {
    const hostError = Object.assign(new Error("a.txt already exists in /w"), { status: 409 });
    expect(isNameConflict(hostError)).toBe(true);
    expect(isNameConflict(Object.assign(new Error("a.txt already exists"), { status: 403 }))).toBe(false);
  });

  it("returns null when the user cancels and rethrows other errors", async () => {
    await expect(withConflictChoice(async () => Promise.reject(conflict), async () => null)).resolves.toBeNull();
    const live = new Error('409: {"detail":"database is in use"}');
    expect(isNameConflict(live)).toBe(false);
    await expect(withConflictChoice(async () => Promise.reject(live), async () => "overwrite")).rejects.toBe(live);
  });
});

describe("menus and summaries", () => {
  const file = (name: string, isDir = false): FileEntry => ({
    name, path: `/w/${name}`, is_directory: isDir, size: 1, mtime: 1, mime_type: null,
  });

  it("offers extract only for one zip and single-item actions only for one entry", () => {
    expect(menuItems([file("a.zip")]).map((i) => i.action)).toContain("unzip");
    expect(menuItems([file("a.txt")]).map((i) => i.action)).not.toContain("unzip");
    const many = menuItems([file("a.txt"), file("dir", true)]).map((i) => i.action);
    expect(many).not.toContain("rename");
    expect(many).toEqual(expect.arrayContaining(["copy", "move", "zip", "delete"]));
  });

  it("summarises skipped entries", () => {
    expect(describeSkipped([])).toBe("");
    expect(describeSkipped([{ path: "/h/.env", reason: "sensitive" }], 3)).toBe("3 skipped: .env (sensitive), +2 more");
  });
});
