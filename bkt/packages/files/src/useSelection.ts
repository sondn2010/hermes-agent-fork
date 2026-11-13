import { useCallback, useMemo, useState } from "react";

export interface SelectionState {
  selected: ReadonlySet<string>;
  anchor: string | null;
}

export interface ClickModifiers {
  shift?: boolean;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  toggle?: boolean;
}

export const EMPTY_SELECTION: SelectionState = { selected: new Set(), anchor: null };

/**
 * Next selection after a click on ``key`` within the ordered ``keys``: plain click selects one,
 * toggle adds or removes one, shift selects the range from the anchor (added to the current
 * selection when toggle is also held).
 */
export function applyClick(state: SelectionState, keys: readonly string[], key: string, mods: ClickModifiers = {}): SelectionState {
  if (mods.shift && state.anchor !== null && keys.includes(state.anchor)) {
    const from = keys.indexOf(state.anchor);
    const to = keys.indexOf(key);
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    const range = keys.slice(lo, hi + 1);
    const selected = new Set(mods.toggle ? [...state.selected, ...range] : range);
    return { selected, anchor: state.anchor };
  }
  if (mods.toggle) {
    const selected = new Set(state.selected);
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    return { selected, anchor: key };
  }
  return { selected: new Set([key]), anchor: key };
}

/** Keep only keys still present, e.g. after a refresh removed some entries. */
export function retainKeys(state: SelectionState, keys: readonly string[]): SelectionState {
  const present = new Set(keys);
  const selected = new Set([...state.selected].filter((k) => present.has(k)));
  const anchor = state.anchor !== null && present.has(state.anchor) ? state.anchor : null;
  return selected.size === state.selected.size && anchor === state.anchor ? state : { selected, anchor };
}

export function useSelection(keys: readonly string[]) {
  const [state, setState] = useState<SelectionState>(EMPTY_SELECTION);
  const current = useMemo(() => retainKeys(state, keys), [state, keys]);

  const click = useCallback(
    (key: string, mods?: ClickModifiers) => setState((prev) => applyClick(retainKeys(prev, keys), keys, key, mods)),
    [keys],
  );
  const selectOnly = useCallback((key: string) => setState({ selected: new Set([key]), anchor: key }), []);
  const selectAll = useCallback(() => setState({ selected: new Set(keys), anchor: keys[0] ?? null }), [keys]);
  const clear = useCallback(() => setState(EMPTY_SELECTION), []);

  return { selected: current.selected, anchor: current.anchor, click, selectOnly, selectAll, clear };
}
