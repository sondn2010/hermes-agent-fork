/**
 * Schema → form mapping for DIA tool forms: which input each JSON-schema property gets,
 * the initial values, required-field checks and conversion to typed tool arguments.
 */
import type { DiaSchemaProperty, DiaSchemaType, DiaToolArguments, DiaToolParameters } from "./dia-api";

export type DiaFieldKind = "text" | "textarea" | "number" | "boolean" | "enum";

/** Raw form state: numbers stay strings until submit so a half-typed value is kept. */
export type DiaFormValues = Record<string, string | boolean>;

const KIND_BY_TYPE: Record<DiaSchemaType, DiaFieldKind> = {
  string: "text",
  integer: "number",
  number: "number",
  boolean: "boolean",
  // The DIA tools take scalars; anything richer is typed as text. The server only checks required fields.
  array: "text",
  object: "text",
};

/** Descriptions that announce a long, free-form value get a textarea. */
const LONG_TEXT_HINT = /\b(long|multi-?line|paragraph|free[- ]form|detailed)\b|nhiều dòng|đoạn văn|mô tả chi tiết/i;

export function fieldKind(property: DiaSchemaProperty): DiaFieldKind {
  if (Array.isArray(property.enum) && property.enum.length > 0) return "enum";
  const kind = KIND_BY_TYPE[property.type ?? "string"] ?? "text";
  if (kind === "text" && property.description && LONG_TEXT_HINT.test(property.description)) return "textarea";
  return kind;
}

export function schemaProperties(parameters: DiaToolParameters): Array<[string, DiaSchemaProperty]> {
  return Object.entries(parameters.properties ?? {});
}

export function initialFormValues(parameters: DiaToolParameters): DiaFormValues {
  const values: DiaFormValues = {};
  for (const [name, property] of schemaProperties(parameters)) {
    if (fieldKind(property) === "boolean") values[name] = property.default === true;
    else values[name] = property.default === undefined ? "" : String(property.default);
  }
  return values;
}

function isBlank(value: string | boolean | undefined): boolean {
  return value === undefined || (typeof value === "string" && value.trim() === "");
}

/** Required fields with no value (a boolean always has one). */
export function missingRequired(parameters: DiaToolParameters, values: DiaFormValues): string[] {
  const properties = parameters.properties ?? {};
  return (parameters.required ?? []).filter(
    (name) => name in properties && fieldKind(properties[name]) !== "boolean" && isBlank(values[name]),
  );
}

function enumValue(property: DiaSchemaProperty, raw: string): string | number {
  return property.enum?.find((option) => String(option) === raw) ?? raw;
}

function numberValue(raw: string): string | number {
  const parsed = Number(raw.trim());
  // Leave an unparsable value as text; the server checks required fields only, so it is sent as typed.
  return Number.isFinite(parsed) ? parsed : raw;
}

/** Typed arguments for `runDiaTool`; blank optional fields are left out. */
export function toToolArguments(parameters: DiaToolParameters, values: DiaFormValues): DiaToolArguments {
  const args: DiaToolArguments = {};
  for (const [name, property] of schemaProperties(parameters)) {
    const value = values[name];
    if (typeof value === "boolean") {
      args[name] = value;
      continue;
    }
    if (isBlank(value)) continue;
    const kind = fieldKind(property);
    if (kind === "number") args[name] = numberValue(value);
    else if (kind === "enum") args[name] = enumValue(property, value);
    else args[name] = value;
  }
  return args;
}
