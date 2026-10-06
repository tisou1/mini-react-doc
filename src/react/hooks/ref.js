import { nextHook } from './runtime.js';

export function useRef(initialValue) {
  const { hook, previous } = nextHook('ref');
  // ref 对象跨 render 复用；修改 current 不会发起更新。
  if (!previous) hook.value = { current: initialValue };
  return hook.value;
}
