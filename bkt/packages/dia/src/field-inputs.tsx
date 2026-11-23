/** Schema field input: one component per field kind, chosen from a table, never a type ladder. */
import type { ComponentType } from "react";
import { ui } from "@bkt/shared/sdk";
import type { DiaSchemaProperty } from "./dia-api";
import type { DiaFieldKind } from "./dia-form-values";

export interface FieldInputProps {
  id: string;
  label: string;
  property: DiaSchemaProperty;
  value: string | boolean;
  invalid: boolean;
  describedBy: string | undefined;
  selectPlaceholder: string;
  onChange: (value: string | boolean) => void;
}

const asText = (value: string | boolean) => (typeof value === "string" ? value : "");

function TextField({ id, value, invalid, describedBy, onChange }: FieldInputProps) {
  const Input = ui("Input");
  return (
    <Input
      id={id}
      value={asText(value)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e: { target: HTMLInputElement }) => onChange(e.target.value)}
    />
  );
}

function TextareaField({ id, value, invalid, describedBy, onChange }: FieldInputProps) {
  return (
    <textarea
      id={id}
      className="bkt-textarea"
      value={asText(value)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function NumberField({ id, property, value, invalid, describedBy, onChange }: FieldInputProps) {
  const Input = ui("Input");
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
      onChange={(e: { target: HTMLInputElement }) => onChange(e.target.value)}
    />
  );
}

function BooleanField({ id, label, value, describedBy, onChange }: FieldInputProps) {
  const Checkbox = ui("Checkbox");
  return (
    <Checkbox
      id={id}
      checked={value === true}
      aria-label={label}
      aria-describedby={describedBy}
      onCheckedChange={(next: boolean | "indeterminate") => onChange(next === true)}
    />
  );
}

function EnumField({ id, property, value, selectPlaceholder, onChange }: FieldInputProps) {
  const Select = ui("Select");
  const SelectOption = ui("SelectOption");
  return (
    <Select id={id} value={asText(value)} onValueChange={(next: string) => onChange(next)}>
      <SelectOption value="">{selectPlaceholder}</SelectOption>
      {(property.enum ?? []).map((option) => (
        <SelectOption key={String(option)} value={String(option)}>
          {String(option)}
        </SelectOption>
      ))}
    </Select>
  );
}

const FIELD_INPUTS: Record<DiaFieldKind, ComponentType<FieldInputProps>> = {
  text: TextField,
  textarea: TextareaField,
  number: NumberField,
  boolean: BooleanField,
  enum: EnumField,
};

export function FieldInput({ kind, ...props }: FieldInputProps & { kind: DiaFieldKind }) {
  const Field = FIELD_INPUTS[kind];
  return <Field {...props} />;
}
