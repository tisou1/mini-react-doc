// ID 使用 root 的计数器分配，并存入 Hook 快照；调试接口不接入外部 DevTools。
import { getCurrentFiber, nextHook } from './runtime.js';

/** 返回组件挂载期间稳定的 ID；identifierPrefix/根 ID 区分根，不实现 SSR/hydration 算法。 */
export function useId() {
  const { fiber, hook, previous } = nextHook('id');
  if (!previous) {
    const root = fiber.root;
    // 计数器不随放弃 render 回退，因此只保证唯一/稳定，不保证连续；也不用于列表 key。
    hook.value = `:${root.identifierPrefix ?? ''}r${root.id}-${root.nextId++}:`;
  }
  return hook.value;
}

/** 验证调用位置后不做额外工作；无 DevTools 的学习版不会执行 formatter。 */
export function useDebugValue() {
  getCurrentFiber();
  // 教学项目没有 DevTools 协议；保留 API，但不执行 formatter 或产生额外工作。
}
