import { useEffect } from './effect.js';
import { useCallback } from './memo.js';
import { useRef } from './ref.js';
import { useState } from './state.js';
import { runTransition } from '../../reconciler/scheduler.js';

export function startTransition(scope) {
  // 和 React 一样立即执行 scope，简化 scheduler 仅延后其中的调度请求。
  // 没有 Lanes；与普通更新重叠时不能区分同一个根上的更新优先级。
  runTransition(scope);
}

export function useTransition() {
  const [isPending, setPending] = useState(false);
  const pendingActions = useRef(0);
  const start = useCallback((scope) => {
    pendingActions.current++;
    setPending(true);
    let result;
    try {
      result = runTransition(scope);
    } catch (error) {
      pendingActions.current--;
      if (pendingActions.current === 0) setPending(false);
      throw error;
    }
    // pending 生命周期用下一轮任务模拟；异步 scope 等待 Promise 完成。
    setTimeout(async () => {
      try {
        await result;
      } finally {
        pendingActions.current--;
        if (pendingActions.current === 0) setPending(false);
      }
      // 不捕获错误：异常继续成为宿主的 unhandled rejection。
    });
  }, []);
  return [isPending, start];
}

export function useDeferredValue(value, initialValue) {
  const hasInitialValue = arguments.length > 1;
  // 包装 initializer，确保函数类型的 value 被当作值而不是 initializer 调用。
  const [deferredValue, setDeferredValue] = useState(() =>
    hasInitialValue ? initialValue : value,
  );

  useEffect(() => {
    if (Object.is(value, deferredValue)) return;
    const timeout = setTimeout(() => setDeferredValue(() => value), 0);
    // 新值或卸载会取消还没执行的旧任务，仅保留最近一次延后更新。
    return () => clearTimeout(timeout);
  }, [value, deferredValue]);

  return deferredValue;
}
