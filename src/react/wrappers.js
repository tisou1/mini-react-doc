import { MEMO, FORWARD_REF, LAZY } from '../shared/symbols.js';

export function memo(type, compare = null) {
  return { $$typeof: MEMO, type, compare };
}

export function forwardRef(render) {
  return { $$typeof: FORWARD_REF, render };
}

export function lazy(load) {
  return {
    $$typeof: LAZY,
    // -1: 未加载，0: 等待 Promise，1: 已加载，2: 加载失败。
    _payload: { _status: -1, _result: load },
  };
}

export function readLazy(type) {
  const payload = type._payload;
  if (payload._status === -1) {
    const load = payload._result;
    try {
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
