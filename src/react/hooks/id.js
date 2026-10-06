import { getCurrentFiber, nextHook } from './runtime.js';

export function useId() {
  const { fiber, hook, previous } = nextHook('id');
  if (!previous) {
    const root = fiber.root;
    hook.value = `:${root.identifierPrefix ?? ''}r${root.id}-${root.nextId++}:`;
  }
  return hook.value;
}

export function useDebugValue() {
  getCurrentFiber();
  // 教学项目没有 DevTools 协议；保留 API，但不执行 formatter 或产生额外工作。
}
