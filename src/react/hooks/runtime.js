// 同一个组件的 Hooks 通过调用顺序关联；fiber 保存本次 render 的 Hook 快照。
let currentFiber = null;
let hookIndex = 0;

export function getCurrentFiber() {
  if (currentFiber === null) {
    throw new Error('Hooks can only be called while rendering a function component.');
  }
  return currentFiber;
}

export function nextHook(kind) {
  const fiber = getCurrentFiber();
  const previousHooks = fiber.alternate?.hooks;
  const previous = previousHooks?.[hookIndex];
  if (previousHooks && (!previous || previous.kind !== kind)) {
    throw new Error('The order of Hooks must stay the same between renders.');
  }
  // 克隆 Hook，避免未提交或失败的 render 修改已提交的状态。
  const hook = previous ? { ...previous } : { kind };
  fiber.hooks[hookIndex++] = hook;
  return { fiber, hook, previous };
}

export function areHookInputsEqual(nextDeps, previousDeps) {
  if (nextDeps == null || previousDeps == null || nextDeps.length !== previousDeps.length) {
    return false;
  }
  return nextDeps.every((dependency, index) => Object.is(dependency, previousDeps[index]));
}

export function isRenderingQueue(queue) {
  return currentFiber?.hooks.some((hook) => hook.queue === queue) ?? false;
}

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
    currentFiber = parentFiber;
    hookIndex = parentIndex;
  }
}

export function commitHooks(fiber) {
  for (const hook of fiber.hooks ?? []) {
    if (hook.queue) {
      // render 只读取队列；成功 commit 后，才移除这次已经处理的更新。
      hook.queue.pending.splice(0, hook.processedCount ?? 0);
      hook.processedCount = 0;
      hook.queue.mounted = true;
    }
  }
}
