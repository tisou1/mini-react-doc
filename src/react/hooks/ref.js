// 引用 Hook 保存可变容器；它不进入更新队列，renderer 也不会因 current 改变而调度。
import { nextHook } from './runtime.js';

/** 挂载时创建 { current: initialValue }，随后所有 render 返回同一个对象。 */
export function useRef(initialValue) {
  const { hook, previous } = nextHook('ref');
  // ref 对象跨 render 复用；修改 current 不会发起更新。
  // 对象本身不随 render 回滚，因此不要在 render 中用 current 暴露未提交的外部状态。
  if (!previous) hook.value = { current: initialValue };
  return hook.value;
}
