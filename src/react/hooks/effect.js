/**
 * render 只登记 Effect 描述，renderer 在 DOM/ref 提交后才调用 runEffects。
 * layout 在 commit 同步执行，passive 由 renderer 安排到后续任务；两者共享清理规则。
 * 清理函数随 Hook 快照保留，依赖变化和卸载时释放旧订阅、定时器等外部资源。
 */
import { areHookInputsEqual, nextHook } from './runtime.js';

/** 记录 create/deps 与是否变化；此处绝不调用 create，保证可放弃的 render 无副作用。 */
function useEffectImpl(kind, create, deps) {
  const { hook, previous } = nextHook(kind);
  hook.effectKind = kind;
  hook.create = create;
  hook.deps = deps;
  hook.changed = !previous || !areHookInputsEqual(deps, previous.deps);
}

/** 登记 passive Effect；提交后异步执行 create，并保存其可选 cleanup 返回值。 */
export function useEffect(create, deps) {
  useEffectImpl('passive', create, deps);
}

/** 登记 layout Effect；DOM/ref 就绪后同步执行，适合读取布局或更新 imperative handle。 */
export function useLayoutEffect(create, deps) {
  useEffectImpl('layout', create, deps);
}

/** 用 layout Effect 暴露自定义 handle；更换 ref 或依赖时先撤销旧 handle。 */
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

/** renderer 按阶段调用；依赖变化时先执行旧 cleanup，再运行本轮 create。 */
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

/** 卸载契约：停止 state queue 接收更新，再清理所有已执行的 Effects。 */
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
