import { exportJson, fillVariables, matchesFilter, parseImport, parseTags, variablesOf } from "./template";
import type { Prompt } from "./template";

const prompt: Prompt = { id: "1", title: "Review PR", body: "Review {{repo}} as {{ role }}", tags: ["code"], variables: [], updated_at: 0 };

describe("prompt templates", () => {
  it("finds variables once, in order", () => {
    expect(variablesOf("{{a}} {{ b }} {{a}} {{1bad}} {{c_2}}")).toEqual(["a", "b", "c_2"]);
  });

  it("fills known variables and leaves unknown ones", () => {
    expect(fillVariables("Hi {{ name }}, see {{other}}", { name: "Son" })).toBe("Hi Son, see {{other}}");
  });

  it("does not re-expand placeholders inside values", () => {
    expect(fillVariables("{{a}} {{b}}", { a: "{{b}}", b: "x" })).toBe("{{b}} x");
  });

  it("parses comma separated tags", () => {
    expect(parseTags(" a, b ,, a ")).toEqual(["a", "b"]);
  });

  it("filters by tag and text", () => {
    expect(matchesFilter(prompt, "review", null)).toBe(true);
    expect(matchesFilter(prompt, "", "code")).toBe(true);
    expect(matchesFilter(prompt, "", "other")).toBe(false);
    expect(matchesFilter(prompt, "nothing", null)).toBe(false);
  });

  it("round-trips export and import", () => {
    expect(parseImport(exportJson([prompt]))).toEqual([{ title: "Review PR", body: prompt.body, tags: ["code"] }]);
    expect(parseImport('[{"title":"t","body":"b"}]')).toEqual([{ title: "t", body: "b", tags: [] }]);
  });

  it("rejects malformed imports", () => {
    expect(() => parseImport('{"x":1}')).toThrow(/Expected/);
    expect(() => parseImport('[{"title":"t"}]')).toThrow(/needs a title and a body/);
    expect(() => parseImport("not json")).toThrow();
  });
});
