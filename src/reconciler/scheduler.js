// 同一轮事件中的更新合并到一次微任务；大树按 Fiber 分片让出主线程。
// React 使用更细的优先级和 Lanes，这里只保留调度机制的教学骨架。
const roots = new Set();
let scheduled = false;
let flushing = false;
let syncDepth = 0;
let transitionDepth = 0;

const now = () => performance.now();

export function scheduleRoot(root) {
  if (transitionDepth > 0) {
    // scope 本身同步执行；这里只把调度请求推迟到下一轮任务。
    setTimeout(() => { if (!root.unmounted) enqueueRoot(root); }, 0);
    return;
  }
  enqueueRoot(root);
}

function enqueueRoot(root) {
  roots.add(root);
  if (!scheduled && !flushing && syncDepth === 0) {
    scheduled = true;
    queueMicrotask(() => flushWork(false));
  }
}

export function cancelRoot(root) {
  roots.delete(root);
}

export function runTransition(scope) {
  transitionDepth++;
  try { return scope(); }
  finally { transitionDepth--; }
}

function flushWork(sync) {
  if (flushing) return;
  scheduled = false;
  flushing = true;
  const deadline = sync ? Infinity : now() + 5;
  try {
    for (const root of roots) {
      roots.delete(root);
      try {
        if (!root.performWork(deadline)) roots.add(root);
      } catch (error) {
        root.discardWork();
        if (sync) throw error;
        root.reportError(error);
      }
      if (!sync && now() >= deadline) break;
    }
  } finally {
    flushing = false;
    if (roots.size && !scheduled) {
      scheduled = true;
      setTimeout(() => flushWork(false), 0);
    }
  }
}

export function flushSync(callback) {
  syncDepth++;
  try {
    return callback?.();
  } finally {
    syncDepth--;
    if (syncDepth === 0) flushWork(true);
  }
}
