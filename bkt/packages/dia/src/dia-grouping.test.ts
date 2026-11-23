import type { CronJob, DiaCategory, DiaModule, DiaRunLogEntry, DiaToolParameters } from "./dia-api";
import {
  diaMonitoringJobs,
  groupDiaModules,
  hiddenPluginNames,
  latestRunByModule,
  visibleDiaModules,
} from "./dia-grouping";
import { fieldKind, initialFormValues, missingRequired, toToolArguments } from "./dia-form-values";

const CATEGORIES: DiaCategory[] = [
  { slug: "domain-lookup", label_vi: "Tra cứu", label_en: "Domain lookup" },
  { slug: "analysis-forecast", label_vi: "Phân tích", label_en: "Analysis" },
  { slug: "decision-support", label_vi: "Quyết định", label_en: "Decision support" },
];

function mod(name: string, category: string): DiaModule {
  return { name, category, function_code: "F", title: name, description: "", emoji: "", enabled: true, tools: [] };
}

function run(id: number, module: string, at: number): DiaRunLogEntry {
  return { id, at, module, tool: "t", source: "console", ok: true, stage: null, error: null, duration_ms: 1, question_preview: null };
}

describe("DIA console grouping", () => {
  it("groups in catalog order, drops empty categories and appends unknown slugs", () => {
    const groups = groupDiaModules(
      [mod("b", "analysis-forecast"), mod("a", "domain-lookup"), mod("c", "zeta"), mod("d", "")],
      CATEGORIES,
    );
    expect(groups.map((g) => g.slug)).toEqual(["domain-lookup", "analysis-forecast", "uncategorized", "zeta"]);
    expect(groups[3].category).toBeNull();
  });

  it("gives the shared category and every empty category no group", () => {
    const groups = groupDiaModules(
      [mod("a", "domain-lookup")],
      [{ slug: "shared", label_vi: "Dùng chung", label_en: "Shared" }, ...CATEGORIES],
    );
    expect(groups.map((g) => g.slug)).toEqual(["domain-lookup"]);
  });

  it("filters modules the user hid with Show UI", () => {
    const hidden = hiddenPluginNames([
      { name: "a", user_hidden: true },
      { name: "b", user_hidden: false },
    ]);
    expect(visibleDiaModules([mod("a", "x"), mod("b", "x")], hidden).map((m) => m.name)).toEqual(["b"]);
  });

  it("keeps the newest run per module regardless of order", () => {
    const latest = latestRunByModule([run(1, "a", 10), run(2, "a", 30), run(3, "b", 5), run(4, "a", 20)]);
    expect(latest.get("a")?.id).toBe(2);
    expect(latest.get("b")?.id).toBe(3);
  });

  it("selects cron jobs whose skills include a bkt-dia skill", () => {
    const jobs = [
      { id: "1", enabled: true, skills: ["bkt-dia-risk-monitor"] },
      { id: "2", enabled: true, skills: ["bkt-prompts"] },
      { id: "3", enabled: true, skills: null },
      { id: "4", enabled: true },
    ] as CronJob[];
    expect(diaMonitoringJobs(jobs).map((j) => j.id)).toEqual(["1"]);
  });
});

describe("DIA tool form values", () => {
  const params: DiaToolParameters = {
    type: "object",
    properties: {
      code: { type: "string" },
      note: { type: "string", description: "Long free-form context" },
      year: { type: "integer", default: 2026 },
      ratio: { type: "number" },
      strict: { type: "boolean" },
      period: { type: "string", enum: ["Q1", "Q2"] },
      level: { type: "integer", enum: [1, 2] },
    },
    required: ["code", "strict", "period"],
  };

  it("maps schema types to input kinds", () => {
    const props = params.properties!;
    expect(fieldKind(props.code)).toBe("text");
    expect(fieldKind(props.note)).toBe("textarea");
    expect(fieldKind(props.year)).toBe("number");
    expect(fieldKind(props.strict)).toBe("boolean");
    expect(fieldKind(props.level)).toBe("enum");
  });

  it("reports blank required fields but never a boolean", () => {
    const values = initialFormValues(params);
    expect(values).toMatchObject({ code: "", year: "2026", strict: false });
    expect(missingRequired(params, values)).toEqual(["code", "period"]);
    expect(missingRequired(params, { ...values, code: " x ", period: "Q1" })).toEqual([]);
  });

  it("converts to typed arguments and omits blank optional fields", () => {
    const values = { ...initialFormValues(params), code: "0101", period: "Q2", level: "2", ratio: "abc" };
    expect(toToolArguments(params, values)).toEqual({
      code: "0101",
      year: 2026,
      ratio: "abc",
      strict: false,
      period: "Q2",
      level: 2,
    });
  });
});
