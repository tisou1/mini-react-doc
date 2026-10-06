/**
 * renderer 在执行函数组件时进入此 dispatcher，并在 commit 发布 Hook 队列状态。
 * 需要持久状态的 Hooks 用调用顺序定位数组槽位，条件分支不能改变其数量或顺序。
 * 本实现用数组展示映射关系；真实 React 的 Hook 结构与并发更新队列更复杂。
 */
// 同一个组件的 Hooks 通过调用顺序关联；fiber 保存本次 render 的 Hook 快照。
let currentFiber = null;
let hookIndex = 0;

/** 取得当前 render 的 Fiber；没有 renderer 设置的上下文时拒绝调用 Hook。 */
export function getCurrentFiber() {
  if (currentFiber === null) {
    throw new Error('Hooks can only be called while rendering a function component.');
  }
  return currentFiber;
}

/** 返回本轮 Hook、上一轮快照及其 Fiber，并将游标前进到下一个调用位置。 */
export function nextHook(kind) {
  const fiber = getCurrentFiber();
  const previousHooks = fiber.alternate?.hooks;
  const previous = previousHooks?.[hookIndex];
  if (previousHooks && (!previous || previous.kind !== kind)) {
    throw new Error('The order of Hooks must stay the same between renders.');
  }
  // 克隆 Hook，避免未提交或失败的 render 修改已提交的状态。
  // 浅克隆让 state/deps 等字段独立；queue 和 ref 对象仍共享，以保持 dispatch/ref 身份。
  const hook = previous ? { ...previous } : { kind };
  fiber.hooks[hookIndex++] = hook;
  return { fiber, hook, previous };
}

/** 逐项 Object.is 比较 deps；省略 deps 时每次失效，[] 则在后续 render 保持相等。 */
export function areHookInputsEqual(nextDeps, previousDeps) {
  if (nextDeps == null || previousDeps == null || nextDeps.length !== previousDeps.length) {
    return false;
  }
  return nextDeps.every((dependency, index) => Object.is(dependency, previousDeps[index]));
}

/** 判断更新是否来自正在执行的组件；学习版拒绝 render-phase state updates。 */
export function isRenderingQueue(queue) {
  return currentFiber?.hooks.some((hook) => hook.queue === queue) ?? false;
}

/** 为一次组件执行创建 Hook/Context 快照并返回 children；不运行 Effects。 */
export function renderWithHooks(fiber, render, props, ref) {
  const parentFiber = currentFiber;
  const parentIndex = hookIndex;
  currentFiber = fiber;
  hookIndex = 0;
  fiber.hooks = [];
  fiber.contextDependencies = new Map();
  try {
    const children = render(props, ref);
    if (fiber.alternate?.hooks && hookIndex !== fiber.alternate.hooks.length) {
      throw new Error('The number of Hooks must stay the same between renders.');
    }
    return children;
  } finally {
    // 组件抛出 Promise 或 error 时也恢复 dispatcher，防止后续调用误用残留 Fiber。
    currentFiber = parentFiber;
    hookIndex = parentIndex;
  }
}

/** 成功提交后消费已处理的 queue 前缀；中断/丢弃 render 不会丢掉待处理更新。 */
export function commitHooks(fiber) {
  for (const hook of fiber.hooks ?? []) {
    if (hook.queue) {
      // render 只读取队列；成功 commit 后，才移除这次已经处理的更新。
      // render 期间新加入的更新位于此前缀之后，必须留给下一轮 render。
      hook.queue.pending.splice(0, hook.processedCount ?? 0);
      hook.processedCount = 0;
      hook.queue.mounted = true;
    }
  }
}
