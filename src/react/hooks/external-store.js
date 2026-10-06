import { useLayoutEffect } from './effect.js';
import { useRef } from './ref.js';
import { useState } from './state.js';

export function useSyncExternalStore(subscribe, getSnapshot, _getServerSnapshot) {
  const snapshot = getSnapshot();
  const [, forceUpdate] = useState(0);
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
    return unsubscribe;
  }, [subscribe]);

  // 本项目只实现客户端 renderer，getServerSnapshot 暂保留参数兼容。
  return snapshot;
}
