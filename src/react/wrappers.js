/**
 * 包装器返回带类型标记的描述；renderer 解包后决定组件执行、跳过或挂起。
 * memo/forwardRef 不在这里创建 Fiber，lazy 也只在首次 render 读取时开始加载。
 */
import { MEMO, FORWARD_REF, LAZY } from '../shared/symbols.js';

/** 保存组件与可选 props 比较器；默认 shallowEqual，内部 state/Context 仍可触发更新。 */
export function memo(type, compare = null) {
  return { $$typeof: MEMO, type, compare };
}

/** renderer 将 props/ref 分开传入 render；ref 的挂载和清理仍属于 commit。 */
export function forwardRef(render) {
  return { $$typeof: FORWARD_REF, render };
}

/** 缓存异步模块的加载状态；load 返回的模块以 default 导出作为组件类型。 */
export function lazy(load) {
  return {
    $$typeof: LAZY,
    // -1: 未加载，0: 等待 Promise，1: 已加载，2: 加载失败。
    _payload: { _status: -1, _result: load },
  };
}

/** renderer 的读取契约：成功返回组件类型，等待时 throw Promise，失败时 throw error。 */
export function readLazy(type) {
  const payload = type._payload;
  if (payload._status === -1) {
    const load = payload._result;
    try {
      // 先记录 pending；后续 render 共享同一 Promise，不会重复发起模块加载。
      const promise = Promise.resolve(load());
      payload._status = 0;
      payload._result = promise;
      promise.then(
        module => {
          if (payload._status === 0) {
            payload._status = 1;
            payload._result = module;
          }
        },
        error => {
          if (payload._status === 0) {
            payload._status = 2;
            payload._result = error;
          }
        },
      );
    } catch (error) {
      payload._status = 2;
      payload._result = error;
    }
  }

  if (payload._status === 1) return payload._result.default;
  // Suspense 捕获 Promise；真正的加载错误继续交给 renderer 的错误处理。
  throw payload._result;
}
