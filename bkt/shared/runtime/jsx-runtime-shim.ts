// Build-time stand-in for "react/jsx-runtime" on top of the host React (see react-shim.ts).
import React from "./react-shim";

type Props = Record<string, unknown> | null;

export const Fragment = React.Fragment;

export function jsx(type: React.ElementType, props: Props, key?: React.Key) {
  return React.createElement(type, key === undefined ? props : { ...props, key });
}

export const jsxs = jsx;
export const jsxDEV = jsx;
