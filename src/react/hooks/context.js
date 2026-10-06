// Context 的值来自 Fiber 路径上的 Provider Map；读取依赖交给 renderer 做 memo 失效判断。
import { getCurrentFiber } from './runtime.js';

/** 读取最近 Provider 的值或 defaultValue，并登记本轮使用的 Context/value。 */
export function useContext(context) {
  const fiber = getCurrentFiber();
  const value = fiber.context.has(context) ? fiber.context.get(context) : context._defaultValue;
  // memo 的 props 没有变化时，renderer 仍需要检查读过的 Context。
  // 此 Hook 没有持久 state 槽位；它写入独立的依赖 Map，而不是 nextHook 的数组。
  fiber.contextDependencies.set(context, value);
  return value;
}
