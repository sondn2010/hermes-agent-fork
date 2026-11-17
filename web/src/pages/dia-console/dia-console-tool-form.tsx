import { useId, useState, type FormEvent } from "react";
import { Play } from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Label } from "@nous-research/ui/ui/components/label";
import type { DiaConsolePageStrings } from "@/i18n/types";
import type { DiaTool, DiaToolArguments } from "@/lib/dia-console-api";
import { DiaFieldInput } from "./dia-console-field-inputs";
import {
  fieldKind,
  initialFormValues,
  missingRequired,
  schemaProperties,
  toToolArguments,
  type DiaFormValues,
} from "./dia-console-form-values";
import { DiaRunResult } from "./dia-console-run-result";
import type { DiaToolRunState } from "./dia-console-store";

export interface DiaToolFormProps {
  module: string;
  tool: DiaTool;
  result: DiaToolRunState | undefined;
  strings: DiaConsolePageStrings;
  onRun: (module: string, tool: string, args: DiaToolArguments) => void;
}

/** Schema-generated form for one tool, with its latest run result underneath. */
export function DiaToolForm({ module, tool, result, strings, onRun }: DiaToolFormProps) {
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
    <section className="flex flex-col gap-3 border-t border-border pt-3" data-tool={tool.name}>
      <div>
        <h4 className="font-mono text-sm">{tool.name}</h4>
        {tool.description ? <p className="text-xs text-muted-foreground">{tool.description}</p> : null}
      </div>
      <form noValidate onSubmit={submit} className="flex flex-col gap-3" aria-label={tool.name}>
        {schemaProperties(tool.parameters).map(([name, property]) => {
          const id = `${formId}-${name}`;
          const errorId = `${id}-error`;
          const hintId = `${id}-hint`;
          const invalid = missing.has(name);
          const describedBy = [property.description ? hintId : null, invalid ? errorId : null].filter(Boolean).join(" ");
          return (
            <div key={name} className="grid gap-1" data-field={name}>
              <Label htmlFor={id} className="text-sm">
                {name}
                {required.has(name) ? (
                  <span className="ml-1 text-destructive" title={strings.form.required}>
                    *
                  </span>
                ) : null}
              </Label>
              {property.description ? (
                <span id={hintId} className="text-xs text-muted-foreground">
                  {property.description}
                </span>
              ) : null}
              <DiaFieldInput
                kind={fieldKind(property)}
                id={id}
                label={name}
                property={property}
                value={values[name] ?? ""}
                invalid={invalid}
                describedBy={describedBy || undefined}
                selectPlaceholder={strings.form.selectPlaceholder}
                onChange={(value) => update(name, value)}
              />
              {invalid ? (
                <span id={errorId} role="alert" className="text-xs text-destructive">
                  {strings.form.requiredMissing(name)}
                </span>
              ) : null}
            </div>
          );
        })}
        <div>
          <Button type="submit" size="sm" disabled={pending}>
            <Play aria-hidden className="mr-1 h-3.5 w-3.5" />
            {pending ? strings.buttons.running : strings.buttons.run}
          </Button>
        </div>
      </form>
      {result ? <DiaRunResult result={result} strings={strings} /> : null}
    </section>
  );
}
