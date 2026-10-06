// 记忆 Hook 在 render 保存值和依赖；create 必须保持纯净，缓存不是副作用生命周期。
import { areHookInputsEqual, nextHook } from './runtime.js';

/** 依赖变化才重新计算；缓存随本轮 Hook 快照提交，失败 render 不覆盖旧缓存。 */
function useMemoImpl(kind, create, deps) {
  const { hook, previous } = nextHook(kind);
  if (!previous || !areHookInputsEqual(deps, previous.deps)) {
    hook.value = create();
  }
  hook.deps = deps;
  return hook.value;
}

/** 缓存 create() 的结果，使用 Object.is 逐项比较 deps，而非深比较对象内容。 */
export function useMemo(create, deps) {
  return useMemoImpl('memo', create, deps);
}

/** 缓存函数身份而不执行 callback；等价于 useMemo(() => callback, deps)。 */
export function useCallback(callback, deps) {
  return useMemoImpl('callback', () => callback, deps);
}
