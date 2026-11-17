import { Link } from "react-router";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Card } from "@nous-research/ui/ui/components/card";
import type { DiaConsolePageStrings } from "@/i18n/types";
import type { DiaModule, DiaToolArguments } from "@/lib/dia-console-api";
import { BKT_MODULES_PATH } from "./dia-console-grouping";
import { DIA_CONSOLE_VI } from "./dia-console-i18n";
import { toolRunKey, type DiaToolRunState } from "./dia-console-store";
import { DiaToolForm } from "./dia-console-tool-form";

export interface DiaModulePanelProps {
  module: DiaModule;
  results: Readonly<Record<string, DiaToolRunState>>;
  strings: DiaConsolePageStrings;
  onRun: (module: string, tool: string, args: DiaToolArguments) => void;
}

function DisabledNotice({ strings }: { strings: DiaConsolePageStrings }) {
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="dia-module-disabled">
      <p>{strings.disabledModuleHint}</p>
      <p lang="vi" className="text-xs text-muted-foreground">
        {DIA_CONSOLE_VI.disabledModuleHint}
      </p>
      <Link to={BKT_MODULES_PATH} className="underline">
        {strings.buttons.openBktModules}
      </Link>
    </div>
  );
}

/** One module: header, then a form per tool when enabled, or a pointer to BKT Modules when not. */
export function DiaModulePanel({ module, results, strings, onRun }: DiaModulePanelProps) {
  let body;
  if (!module.enabled) body = <DisabledNotice strings={strings} />;
  else if (module.error) body = <p className="text-sm text-destructive" data-testid="dia-module-error">{module.error}</p>;
  else if (module.tools.length === 0) body = <p className="text-sm text-muted-foreground">{strings.empty.noTools}</p>;
  else {
    body = module.tools.map((tool) => (
      <DiaToolForm
        key={tool.name}
        module={module.name}
        tool={tool}
        result={results[toolRunKey(module.name, tool.name)]}
        strings={strings}
        onRun={onRun}
      />
    ));
  }

  return (
    <Card className="flex flex-col gap-3 p-4" data-module={module.name}>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {module.emoji ? <span aria-hidden>{module.emoji}</span> : null}
          <h3 className="font-medium">{module.title || module.name}</h3>
          {module.function_code ? <Badge tone="outline">{module.function_code}</Badge> : null}
          <Badge tone={module.enabled ? "success" : "secondary"}>
            {module.enabled ? strings.status.enabled : strings.status.disabled}
          </Badge>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{module.name}</span>
        {module.description ? <p className="text-sm text-muted-foreground">{module.description}</p> : null}
      </header>
      {body}
    </Card>
  );
}
