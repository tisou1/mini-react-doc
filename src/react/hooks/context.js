import { getCurrentFiber } from './runtime.js';

export function useContext(context) {
  const fiber = getCurrentFiber();
  const value = fiber.context.has(context) ? fiber.context.get(context) : context._defaultValue;
  // memo 的 props 没有变化时，renderer 仍需要检查读过的 Context。
  fiber.contextDependencies.set(context, value);
  return value;
}
