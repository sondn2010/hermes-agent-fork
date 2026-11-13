import { baseName, breadcrumbs, fileKind, joinPath, parentOf, pathSep, safeRelativePath } from "./paths";

describe("host path helpers", () => {
  it("joins with the separator the host path already uses", () => {
    expect(joinPath("/home/u", "a", "b.txt")).toBe("/home/u/a/b.txt");
    expect(joinPath("/", "etc")).toBe("/etc");
    expect(joinPath("C:\\Users\\u", "a", "b.txt")).toBe("C:\\Users\\u\\a\\b.txt");
    expect(joinPath("C:\\", "x")).toBe("C:\\x");
    expect(pathSep("C:/Users")).toBe("\\");
  });

  it("finds the parent and base name on POSIX and Windows", () => {
    expect(parentOf("/a/b")).toBe("/a");
    expect(parentOf("/a")).toBe("/");
    expect(parentOf("/")).toBeNull();
    expect(parentOf("C:\\a\\b")).toBe("C:\\a");
    expect(parentOf("C:\\a")).toBe("C:\\");
    expect(parentOf("C:\\")).toBeNull();
    expect(baseName("/a/b/")).toBe("b");
    expect(baseName("C:\\a\\notes.md")).toBe("notes.md");
  });

  it("builds breadcrumbs down from the root or a locked root", () => {
    expect(breadcrumbs("/a/b").map((c) => c.path)).toEqual(["/", "/a", "/a/b"]);
    expect(breadcrumbs("/srv/data/x", "/srv/data").map((c) => c.label)).toEqual(["data", "x"]);
    expect(breadcrumbs("C:\\Users\\u").map((c) => c.path)).toEqual(["C:\\", "C:\\Users", "C:\\Users\\u"]);
  });
});

describe("safeRelativePath", () => {
  it("accepts nested relative paths with either separator", () => {
    expect(safeRelativePath("folder/sub/deep/x.txt")).toEqual(["folder", "sub", "deep", "x.txt"]);
    expect(safeRelativePath("folder\\sub\\x.txt")).toEqual(["folder", "sub", "x.txt"]);
    expect(safeRelativePath("./a//b")).toEqual(["a", "b"]);
  });

  it.each(["", "../x", "a/../../x", "a\\..\\x", "/etc/passwd", "\\x", "C:\\x", "c:x", "a/\0b", ".", "./"])(
    "rejects %j",
    (rel) => {
      expect(safeRelativePath(rel)).toBeNull();
    },
  );
});

describe("fileKind", () => {
  it("routes markdown, text, images and PDFs to their viewers", () => {
    expect(fileKind("README.md")).toBe("markdown");
    expect(fileKind("main.py")).toBe("text");
    expect(fileKind("photo.JPG")).toBe("image");
    expect(fileKind("spec.pdf")).toBe("pdf");
    expect(fileKind("data.bin", "application/octet-stream")).toBe("binary");
    expect(fileKind("notes", "text/plain")).toBe("text");
  });
});
