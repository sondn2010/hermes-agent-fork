import { ui } from "@bkt/shared/sdk";
import type { DiaModule, DiaToolArguments } from "./dia-api";
import { BKT_MODULES_PATH } from "./dia-grouping";
import { RouteLink } from "./dia-primitives";
import { VI } from "./dia-strings";
import { toolRunKey } from "./dia-store";
import type { DiaToolRunState } from "./dia-store";
import { ToolForm } from "./tool-form";

export interface ModulePanelProps {
  module: DiaModule;
  results: Readonly<Record<string, DiaToolRunState>>;
  onRun: (module: string, tool: string, args: DiaToolArguments) => void;
}

function DisabledNotice() {
  return (
    <div className="bkt-col" data-testid="dia-module-disabled">
      <p>{VI.disabledModuleHint}</p>
      <RouteLink to={BKT_MODULES_PATH}>{VI.buttons.openBktModules}</RouteLink>
    </div>
  );
}

function PanelBody({ module, results, onRun }: ModulePanelProps) {
  if (!module.enabled) return <DisabledNotice />;
  if (module.error) return <p className="bkt-error" data-testid="dia-module-error">{module.error}</p>;
  if (module.tools.length === 0) return <p className="bkt-muted">{VI.empty.noTools}</p>;
  return (
    <>
      {module.tools.map((tool) => (
        <ToolForm key={tool.name} module={module.name} tool={tool} result={results[toolRunKey(module.name, tool.name)]} onRun={onRun} />
      ))}
    </>
  );
}

/** One module: header, then a form per tool when enabled, or a pointer to BKT Modules when not. */
export function ModulePanel(props: ModulePanelProps) {
  const Badge = ui("Badge");
  const { module } = props;
  return (
    <section className="bkt-panel bkt-col" data-module={module.name}>
      <header className="bkt-col">
        <div className="bkt-row">
          {module.emoji ? <span aria-hidden="true">{module.emoji}</span> : null}
          <h3 className="bkt-dia-module-title">{module.title || module.name}</h3>
          {module.function_code ? <Badge tone="outline">{module.function_code}</Badge> : null}
          <Badge tone={module.enabled ? "success" : "secondary"}>
            {module.enabled ? VI.status.enabled : VI.status.disabled}
          </Badge>
        </div>
        <span className="bkt-mono bkt-muted">{module.name}</span>
        {module.description ? <p className="bkt-muted">{module.description}</p> : null}
      </header>
      <PanelBody {...props} />
    </section>
  );
}
