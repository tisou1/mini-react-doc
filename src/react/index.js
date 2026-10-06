export { createElement, cloneElement, isValidElement, createRef, Children, Fragment } from './element.js';
export { Component, PureComponent } from './component.js';
export { createContext } from './context.js';
export { memo, forwardRef, lazy } from './wrappers.js';
export {
  useState, useReducer, useRef, useMemo, useCallback,
  useEffect, useLayoutEffect, useImperativeHandle,
  useContext, useId, useDebugValue, useSyncExternalStore,
} from './hooks.js';
export { startTransition, useTransition, useDeferredValue } from './hooks/transition.js';
export { SUSPENSE as Suspense, STRICT_MODE as StrictMode } from '../shared/symbols.js';

// 兼容 import React from 'mini-react' 的经典 JSX 用法。
import * as elements from './element.js';
import * as components from './component.js';
import * as contexts from './context.js';
import { memo, forwardRef, lazy } from './wrappers.js';
import {
  useState, useReducer, useRef, useMemo, useCallback,
  useEffect, useLayoutEffect, useImperativeHandle,
  useContext, useId, useDebugValue, useSyncExternalStore,
} from './hooks.js';
import { startTransition, useTransition, useDeferredValue } from './hooks/transition.js';
import { SUSPENSE, STRICT_MODE } from '../shared/symbols.js';

export const version = '0.1.0-mini';
export default {
  ...elements, ...components, ...contexts, memo, forwardRef, lazy,
  useState, useReducer, useRef, useMemo, useCallback,
  useEffect, useLayoutEffect, useImperativeHandle,
  useContext, useId, useDebugValue, useSyncExternalStore,
  startTransition, useTransition, useDeferredValue,
  Suspense: SUSPENSE, StrictMode: STRICT_MODE, version,
};
