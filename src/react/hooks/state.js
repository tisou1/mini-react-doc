/**
 * 状态 Hook 将「本轮 state 快照」与「跨 render 共享的更新 queue」分开保存。
 * dispatch 只排队并请求 root 调度；renderer 的 commitHooks 才消费已计算的更新。
 * 学习版没有 React 的 Lanes、更新跳过/重放或相同 state 的 eager bailout。
 */
import { isRenderingQueue, nextHook } from './runtime.js';

// useState 是内置 reducer：普通 action 替换值，函数 action 读取前一次计算后的值。
function stateReducer(state, action) {
  return typeof action === 'function' ? action(state) : action;
}

/** 挂载时初始化 state/queue，更新时按顺序折叠队列，返回 state 与稳定 dispatch。 */
function useReducerImpl(kind, reducer, initialArg, init) {
  const { fiber, hook, previous } = nextHook(kind);
  if (!previous) {
    hook.state = init ? init(initialArg) : initialArg;
    // dispatch 闭包持有共享 queue，不绑定某一轮 Fiber，避免重渲染后仍指向旧快照。
    const queue = { pending: [], root: fiber.root, mounted: false };
    queue.dispatch = (action) => {
      if (isRenderingQueue(queue)) {
        throw new Error('Render-phase state updates are not supported by mini-react.');
      }
      // 已卸载的组件不能重新进入更新队列。
      if (!queue.mounted) return;
      queue.pending.push(action);
      queue.root.schedule();
    };
    hook.queue = queue;
  }
  const pending = hook.queue.pending;
  // 固定本轮读取的队列长度；只更新 Hook 快照，不修改共享 pending 数组。
  hook.processedCount = pending.length;
  for (let index = 0; index < hook.processedCount; index++) {
    hook.state = reducer(hook.state, pending[index]);
  }
  return [hook.state, hook.queue.dispatch];
}

/** 返回状态与 setter；函数 initialState 仅在挂载初始化，setter 的函数参数是更新器。 */
export function useState(initialState) {
  return useReducerImpl('state', stateReducer, initialState, (value) =>
    typeof value === 'function' ? value() : value,
  );
}

/** 用 reducer 顺序处理 action；可选 init 将 initialArg 转成初始 state，dispatch 身份稳定。 */
export function useReducer(reducer, initialArg, init) {
  return useReducerImpl('reducer', reducer, initialArg, init);
}
