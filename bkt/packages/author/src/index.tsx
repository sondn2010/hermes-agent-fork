import { useEffect, useState } from "react";
import { bktFetch, errorMessage } from "@bkt/shared/api";
import { AUTHOR, COMPANY } from "@bkt/shared/brand";
import { pluginAssetUrl, registerPlugin } from "@bkt/shared/sdk";

interface PluginManifest {
  name: string;
  label: string;
  version: string;
  description: string;
}

function AuthorLine() {
  return (
    <div className="bkt-author-line">
      {AUTHOR.name} · <a href={`mailto:${AUTHOR.email}`}>{AUTHOR.email}</a>
    </div>
  );
}

function AboutPage() {
  const [plugins, setPlugins] = useState<PluginManifest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bktFetch<PluginManifest[]>("/api/dashboard/plugins")
      .then((list) => setPlugins(list.filter((p) => p.name.startsWith("bkt-"))))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <div className="bkt-page bkt-about">
      <div className="bkt-row bkt-about-head">
        <img src={pluginAssetUrl("bkt-brand", "assets/logo.png")} alt={COMPANY} height={60} />
        <div className="bkt-col">
          <h1 className="bkt-about-title">{COMPANY}</h1>
          <div className="bkt-muted">Hermes dashboard extensions</div>
        </div>
      </div>
      <div className="bkt-panel bkt-col">
        <div>
          Author: <strong>{AUTHOR.name}</strong> · <a href={`mailto:${AUTHOR.email}`}>{AUTHOR.email}</a>
        </div>
      </div>
      <div className="bkt-panel bkt-col">
        <h2 className="bkt-about-subtitle">Installed plugins</h2>
        {error && <div className="bkt-error">{error}</div>}
        {!plugins && !error && <div className="bkt-muted">Loading…</div>}
        {plugins && (
          <table className="bkt-about-table">
            <thead>
              <tr>
                <th>Plugin</th>
                <th>Version</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {plugins.map((p) => (
                <tr key={p.name}>
                  <td className="bkt-mono">{p.name}</td>
                  <td>{p.version}</td>
                  <td className="bkt-muted">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

registerPlugin("bkt-author", AboutPage, [{ slot: "post-main", component: AuthorLine }]);
