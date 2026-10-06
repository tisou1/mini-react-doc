/**
 * 将外部 store 接入内部状态调度：render 读 snapshot，layout Effect 管理订阅。
 * 两次补查覆盖「render → commit」和「订阅建立之前」的变化窗口。
 * 这是客户端教学组合实现，不提供真实 React 的并发一致性检查或 SSR 支持。
 */
import { useLayoutEffect } from './effect.js';
import { useRef } from './ref.js';
import { useState } from './state.js';

/** 返回 getSnapshot()；subscribe 返回退订函数，store 未变化时 snapshot 应保持 Object.is 相等。 */
export function useSyncExternalStore(subscribe, getSnapshot, _getServerSnapshot) {
  const snapshot = getSnapshot();
  const [, forceUpdate] = useState(0);
  // 订阅回调通过稳定 ref 读取最新已提交的 snapshot/getSnapshot，避免旧闭包捕获过期值。
  const instance = useRef({ snapshot, getSnapshot });

  useLayoutEffect(() => {
    instance.current = { snapshot, getSnapshot };
    // store 可能在 render 和 commit 之间变化，提交后再检查一次。
    if (!Object.is(snapshot, getSnapshot())) forceUpdate((value) => value + 1);
  }, [snapshot, getSnapshot]);

  useLayoutEffect(() => {
    const checkForUpdates = () => {
      const current = instance.current;
      if (!Object.is(current.snapshot, current.getSnapshot())) {
        forceUpdate((value) => value + 1);
      }
    };
    const unsubscribe = subscribe(checkForUpdates);
    // 防止第一次订阅之前的变化被遗漏。
    checkForUpdates();
    // subscribe 身份变化先退订再订阅；组件卸载同样运行这份 cleanup。
    return unsubscribe;
  }, [subscribe]);

  // 本项目只实现客户端 renderer，getServerSnapshot 暂保留参数兼容。
  return snapshot;
}
