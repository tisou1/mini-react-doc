import { isRenderingQueue, nextHook } from './runtime.js';

function stateReducer(state, action) {
  return typeof action === 'function' ? action(state) : action;
}

function useReducerImpl(kind, reducer, initialArg, init) {
  const { fiber, hook, previous } = nextHook(kind);
  if (!previous) {
    hook.state = init ? init(initialArg) : initialArg;
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
  hook.processedCount = pending.length;
  for (let index = 0; index < hook.processedCount; index++) {
    hook.state = reducer(hook.state, pending[index]);
  }
  return [hook.state, hook.queue.dispatch];
}

export function useState(initialState) {
  return useReducerImpl('state', stateReducer, initialState, (value) =>
    typeof value === 'function' ? value() : value,
  );
}

export function useReducer(reducer, initialArg, init) {
  return useReducerImpl('reducer', reducer, initialArg, init);
}
