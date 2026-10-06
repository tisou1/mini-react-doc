import { areHookInputsEqual, nextHook } from './runtime.js';

function useMemoImpl(kind, create, deps) {
  const { hook, previous } = nextHook(kind);
  if (!previous || !areHookInputsEqual(deps, previous.deps)) {
    hook.value = create();
  }
  hook.deps = deps;
  return hook.value;
}

export function useMemo(create, deps) {
  return useMemoImpl('memo', create, deps);
}

export function useCallback(callback, deps) {
  return useMemoImpl('callback', () => callback, deps);
}
