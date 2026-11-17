/** Schema field input: one component per field kind, chosen from a table, never a type ladder. */
import type { ComponentType } from "react";
import { Input } from "@nous-research/ui/ui/components/input";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { Switch } from "@nous-research/ui/ui/components/switch";
import type { DiaSchemaProperty } from "@/lib/dia-console-api";
import type { DiaFieldKind } from "./dia-console-form-values";

export interface DiaFieldInputProps {
  id: string;
  label: string;
  property: DiaSchemaProperty;
  value: string | boolean;
  invalid: boolean;
  describedBy: string | undefined;
  selectPlaceholder: string;
  onChange: (value: string | boolean) => void;
}

const TEXTAREA_CLASS =
  "flex min-h-[80px] w-full border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const asText = (value: string | boolean) => (typeof value === "string" ? value : "");

function TextField({ id, value, invalid, describedBy, onChange }: DiaFieldInputProps) {
  return (
    <Input
      id={id}
      value={asText(value)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function TextareaField({ id, value, invalid, describedBy, onChange }: DiaFieldInputProps) {
  return (
    <textarea
      id={id}
      className={TEXTAREA_CLASS}
      value={asText(value)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function NumberField({ id, property, value, invalid, describedBy, onChange }: DiaFieldInputProps) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      step={property.type === "integer" ? 1 : "any"}
      min={property.minimum}
      max={property.maximum}
      value={asText(value)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function BooleanField({ id, label, value, describedBy, onChange }: DiaFieldInputProps) {
  return (
    <Switch
      id={id}
      checked={value === true}
      aria-label={label}
      aria-describedby={describedBy}
      onCheckedChange={(next) => onChange(next)}
    />
  );
}

function EnumField({ id, property, value, selectPlaceholder, onChange }: DiaFieldInputProps) {
  return (
    <Select id={id} value={asText(value)} onValueChange={(next) => onChange(next)}>
      <SelectOption value="">{selectPlaceholder}</SelectOption>
      {(property.enum ?? []).map((option) => (
        <SelectOption key={String(option)} value={String(option)}>
          {String(option)}
        </SelectOption>
      ))}
    </Select>
  );
}

const FIELD_INPUTS: Record<DiaFieldKind, ComponentType<DiaFieldInputProps>> = {
  text: TextField,
  textarea: TextareaField,
  number: NumberField,
  boolean: BooleanField,
  enum: EnumField,
};

export function DiaFieldInput({ kind, ...props }: DiaFieldInputProps & { kind: DiaFieldKind }) {
  const Field = FIELD_INPUTS[kind];
  return <Field {...props} />;
}
