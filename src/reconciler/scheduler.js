/**
 * 调度器接收 root 请求，调用 root.performWork(deadline)，直到候选树可以提交。
 * 微任务合并本轮请求，后续任务分片恢复工作；flushSync 走相同流程但不设时间预算。
 * 更新内容和版本重启由 renderer 管理，调度器只决定“何时继续”，不负责协调或 DOM。
 */
// 同一轮事件中的更新合并到一次微任务；大树按 Fiber 分片让出主线程。
// React 使用更细的优先级和 Lanes，这里只保留调度机制的教学骨架。
// 一个 root 可以累积多次状态更新，但 Set 让它在待处理集合中只出现一次。
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
    // 同步代码中的多个 dispatch 先入队，微任务开始时一起渲染，形成简化 batching。
    scheduled = true;
    queueMicrotask(() => flushWork(false));
  }
}

export function cancelRoot(root) {
  roots.delete(root);
}

export function runTransition(scope) {
  // depth 只标识 scope 内的调度请求；不建立独立状态队列，也不能隔离同根更新优先级。
  transitionDepth++;
  try { return scope(); }
  finally { transitionDepth--; }
}

function flushWork(sync) {
  // layout Effects 等提交回调可能再次请求工作；防止在一次提交中重入 render/commit。
  if (flushing) return;
  scheduled = false;
  flushing = true;
  // 5ms 是整个本轮任务共享的教学预算，不是浏览器帧预算或真实 React 的优先级规则。
  // 检查发生在 Fiber 之间，单个耗时组件函数不会在函数内部被抢占。
  const deadline = sync ? Infinity : now() + 5;
  try {
    for (const root of roots) {
      roots.delete(root);
      try {
        // false 表示候选树尚未完成，保留 root 供下一次任务从 nextUnit 恢复。
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
      // 后续分片使用 timer 而非持续微任务，给浏览器处理输入和绘制的机会。
      setTimeout(() => flushWork(false), 0);
    }
  }
}

/** 外层 flushSync 退出时处理当前集合里的根；不模拟 React 的全部同步刷新边界。 */
export function flushSync(callback) {
  syncDepth++;
  try {
    return callback?.();
  } finally {
    syncDepth--;
    if (syncDepth === 0) flushWork(true);
  }
}
