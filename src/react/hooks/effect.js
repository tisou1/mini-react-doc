import { areHookInputsEqual, nextHook } from './runtime.js';

function useEffectImpl(kind, create, deps) {
  const { hook, previous } = nextHook(kind);
  hook.effectKind = kind;
  hook.create = create;
  hook.deps = deps;
  hook.changed = !previous || !areHookInputsEqual(deps, previous.deps);
}

export function useEffect(create, deps) {
  useEffectImpl('passive', create, deps);
}

export function useLayoutEffect(create, deps) {
  useEffectImpl('layout', create, deps);
}

export function useImperativeHandle(ref, createHandle, deps) {
  // ref 的赋值也属于提交阶段；中断的 render 不应暴露未提交的 handle。
  useLayoutEffect(() => {
    if (ref == null) return;
    const handle = createHandle();
    if (typeof ref === 'function') {
      const cleanup = ref(handle);
      return typeof cleanup === 'function' ? cleanup : () => ref(null);
    }
    ref.current = handle;
    return () => { ref.current = null; };
  }, deps == null ? deps : [...deps, ref]);
}

export function runEffects(fiber, kind) {
  for (const hook of fiber.hooks ?? []) {
    if (hook.effectKind !== kind || !hook.changed) continue;
    hook.changed = false;
    const cleanup = hook.cleanup;
    hook.cleanup = undefined;
    if (typeof cleanup === 'function') cleanup();
    const result = hook.create();
    if (typeof result === 'function') hook.cleanup = result;
  }
}

export function cleanupHooks(fiber) {
  // 先关闭队列，再清理 Effect，避免 cleanup 内部更新已经卸载的组件。
  for (const hook of fiber.hooks ?? []) {
    if (hook.queue) {
      hook.queue.mounted = false;
      hook.queue.pending.length = 0;
    }
  }
  for (const hook of fiber.hooks ?? []) {
    const cleanup = hook.cleanup;
    hook.cleanup = undefined;
    hook.changed = false;
    if (typeof cleanup === 'function') cleanup();
  }
}
