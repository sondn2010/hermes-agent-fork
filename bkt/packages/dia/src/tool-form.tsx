import { useId, useState } from "react";
import type { FormEvent } from "react";
import { ui } from "@bkt/shared/sdk";
import type { DiaTool, DiaToolArguments } from "./dia-api";
import { fieldKind, initialFormValues, missingRequired, schemaProperties, toToolArguments } from "./dia-form-values";
import type { DiaFormValues } from "./dia-form-values";
import { VI } from "./dia-strings";
import type { DiaToolRunState } from "./dia-store";
import { FieldInput } from "./field-inputs";
import { RunResult } from "./run-result";

export interface ToolFormProps {
  module: string;
  tool: DiaTool;
  result: DiaToolRunState | undefined;
  onRun: (module: string, tool: string, args: DiaToolArguments) => void;
}

/** Schema-generated form for one tool, with its latest run result underneath. */
export function ToolForm({ module, tool, result, onRun }: ToolFormProps) {
  const Button = ui("Button");
  const Label = ui("Label");
  const formId = useId();
  const [values, setValues] = useState<DiaFormValues>(() => initialFormValues(tool.parameters));
  const [missing, setMissing] = useState<ReadonlySet<string>>(() => new Set());
  const required = new Set(tool.parameters.required ?? []);
  const pending = result?.pending === true;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const blank = missingRequired(tool.parameters, values);
    setMissing(new Set(blank));
    if (blank.length > 0) return;
    onRun(module, tool.name, toToolArguments(tool.parameters, values));
  };

  const update = (name: string, value: string | boolean) => {
    setValues((current) => ({ ...current, [name]: value }));
    if (missing.has(name)) setMissing((current) => new Set([...current].filter((n) => n !== name)));
  };

  return (
    <section className="bkt-dia-tool bkt-col" data-tool={tool.name}>
      <div>
        <h4 className="bkt-mono bkt-dia-tool-name">{tool.name}</h4>
        {tool.description ? <p className="bkt-muted">{tool.description}</p> : null}
      </div>
      <form noValidate onSubmit={submit} className="bkt-col" aria-label={tool.name}>
        {schemaProperties(tool.parameters).map(([name, property]) => {
          const id = `${formId}-${name}`;
          const errorId = `${id}-error`;
          const hintId = `${id}-hint`;
          const invalid = missing.has(name);
          const describedBy = [property.description ? hintId : null, invalid ? errorId : null].filter(Boolean).join(" ");
          return (
            <div key={name} className="bkt-dia-field" data-field={name}>
              <Label htmlFor={id}>
                {name}
                {required.has(name) ? (
                  <span className="bkt-dia-danger bkt-dia-required" title={VI.form.required}>
                    *
                  </span>
                ) : null}
              </Label>
              {property.description ? (
                <span id={hintId} className="bkt-muted">
                  {property.description}
                </span>
              ) : null}
              <FieldInput
                kind={fieldKind(property)}
                id={id}
                label={name}
                property={property}
                value={values[name] ?? ""}
                invalid={invalid}
                describedBy={describedBy || undefined}
                selectPlaceholder={VI.form.selectPlaceholder}
                onChange={(value) => update(name, value)}
              />
              {invalid ? (
                <span id={errorId} role="alert" className="bkt-error">
                  {VI.form.requiredMissing(name)}
                </span>
              ) : null}
            </div>
          );
        })}
        <div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? VI.buttons.running : `▶ ${VI.buttons.run}`}
          </Button>
        </div>
      </form>
      {result ? <RunResult result={result} /> : null}
    </section>
  );
}
