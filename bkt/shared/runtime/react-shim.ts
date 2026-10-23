// Build-time stand-in for "react": every plugin bundle uses the host's single React copy
// from the plugin SDK, so hooks share one dispatcher with the dashboard.
const sdk = window.__HERMES_PLUGIN_SDK__;
if (!sdk) throw new Error("Hermes plugin SDK is not loaded");
const React = sdk.React;

export default React;
export const {
  Children, Component, Fragment, PureComponent, StrictMode, Suspense,
  cloneElement, createContext, createElement, createRef, forwardRef, isValidElement, lazy, memo,
  startTransition, use, useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useId,
  useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useReducer, useRef, useState,
  useSyncExternalStore, useTransition,
} = React;
