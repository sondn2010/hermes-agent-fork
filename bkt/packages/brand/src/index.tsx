import { useEffect } from "react";
import { COMPANY } from "@bkt/shared/brand";
import { registerPlugin, selfAssetUrl } from "@bkt/shared/sdk";

// Resolved while the bundle evaluates, from the URL the host loaded it with.
const LOGO_URL = selfAssetUrl("assets/logo.png");

function setFavicon(href: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"][data-bkt-brand]');
  if (!link) {
    for (const old of document.querySelectorAll('link[rel~="icon"]')) old.remove();
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.dataset.bktBrand = "1";
    document.head.appendChild(link);
  }
  link.href = href;
}

function HeaderLogo() {
  useEffect(() => setFavicon(LOGO_URL), []);
  return (
    <span className="bkt-brand-logo" title={COMPANY}>
      <img src={LOGO_URL} alt={COMPANY} height={28} />
    </span>
  );
}

registerPlugin("bkt-brand", null, [{ slot: "header-left", component: HeaderLogo }]);
