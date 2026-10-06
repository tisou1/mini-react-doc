import {
  TEXT, FRAGMENT, CONTEXT, CONSUMER, MEMO, FORWARD_REF, LAZY,
  SUSPENSE, PORTAL, STRICT_MODE,
} from '../shared/symbols.js';
import { shallowEqual } from '../shared/shallow-equal.js';
import { readLazy } from '../react/wrappers.js';
import { renderWithHooks, commitHooks, runEffects, cleanupHooks } from '../react/hooks.js';
import { createDom, updateDom, setRef } from '../react-dom/host.js';
import { ROOT, reconcileChildren, nextFiber, visitTree } from './fiber.js';
import { scheduleRoot, cancelRoot, flushSync } from './scheduler.js';

let nextRootId = 0;
const containerRoots = new WeakMap();

function readContext(fiber, context) {
  return fiber.context.has(context) ? fiber.context.get(context) : context._defaultValue;
}

function hasOwnUpdate(fiber) {
  return fiber.alternate?.hooks?.some(hook => hook.queue?.pending.length) ||
    fiber.alternate?.instance?.__queue.length;
}

function contextChanged(fiber) {
  for (const [context, value] of fiber.alternate?.contextDependencies ?? []) {
    if (!Object.is(value, readContext(fiber, context))) return true;
  }
  return false;
}

function renderClass(fiber, Type) {
  const old = fiber.alternate;
  const context = Type.contextType ? readContext(fiber, Type.contextType) : undefined;
  const instance = old?.instance ?? new Type(fiber.props, context);
  fiber.instance = instance;
  if (Type.contextType) fiber.contextDependencies = new Map([[Type.contextType, context]]);
  if (!old) {
    instance.__queue = [];
    instance.__mounted = false;
    const componentRoot = fiber.root;
    instance.__updater = (partial, callback, force) => {
      if (!instance.__mounted || componentRoot.unmounted) return;
      instance.__queue.push({ partial, callback, force });
      componentRoot.schedule();
    };
  }
  fiber.processedCount = instance.__queue.length;
  let state = instance.state ?? null;
  let forced = false;
  for (let index = 0; index < fiber.processedCount; index++) {
    const update = instance.__queue[index];
    forced ||= update.force;
    const partial = typeof update.partial === 'function'
      ? update.partial(state, fiber.props) : update.partial;
    if (partial != null) state = { ...state, ...partial };
  }
  if (typeof Type.getDerivedStateFromProps === 'function') {
    const derived = Type.getDerivedStateFromProps(fiber.props, state);
    if (derived != null) state = { ...state, ...derived };
  }
  fiber.classState = state;
  fiber.classContext = context;
  fiber.previousProps = instance.props;
  fiber.previousState = instance.state;
  fiber.classDidRender = true;
  if (old && !forced && Object.is(instance.context, context)) {
    const shouldUpdate = instance.shouldComponentUpdate
      ? instance.shouldComponentUpdate(fiber.props, state, context)
      : !instance.isPureReactComponent ||
        !shallowEqual(instance.props, fiber.props) || !shallowEqual(instance.state, state);
    if (!shouldUpdate) {
      fiber.classDidRender = false;
      return old.output;
    }
  }
  // render 使用候选 props/state；随后还原，commit 时才发布新状态。
  const previousContext = instance.context;
  instance.props = fiber.props;
  instance.state = state;
  instance.context = context;
  try {
    return instance.render();
  } finally {
    instance.props = fiber.previousProps;
    instance.state = fiber.previousState;
    instance.context = previousContext;
  }
}

function renderComponent(fiber, type) {
  if (type?.$$typeof === MEMO) {
    const old = fiber.alternate;
    const compare = type.compare ?? shallowEqual;
    if (old && Object.is(old.props.ref, fiber.props.ref) &&
        !hasOwnUpdate(fiber) && !contextChanged(fiber) && compare(old.props, fiber.props)) {
      fiber.hooks = old.hooks;
      fiber.contextDependencies = old.contextDependencies;
      if (old.instance) {
        fiber.instance = old.instance;
        fiber.classState = old.classState;
        fiber.classContext = old.classContext;
        fiber.processedCount = 0;
        fiber.classDidRender = false;
      }
      return old.output;
    }
    return renderComponent(fiber, type.type);
  }
  if (type?.$$typeof === LAZY) return renderComponent(fiber, readLazy(type));
  if (type?.$$typeof === FORWARD_REF) {
    const { ref, ...props } = fiber.props;
    return renderWithHooks(fiber, type.render, props, ref);
  }
  if (typeof type === 'function') {
    if (type.prototype?.isReactComponent) return renderClass(fiber, type);
    return renderWithHooks(fiber, type, fiber.props);
  }
  throw new TypeError('Invalid element type: expected a tag or a supported component.');
}

function performUnit(fiber) {
  const { type, props } = fiber;
  let children;
  if (type === ROOT || type === FRAGMENT || type === STRICT_MODE) {
    children = props.children;
  } else if (type === SUSPENSE) {
    children = fiber.root.suspensions.has(fiber.path) ? props.fallback : props.children;
  } else if (type === PORTAL) {
    fiber.dom = props.container;
    children = props.children;
  } else if (typeof type === 'string' || type === TEXT) {
    if (!fiber.dom) fiber.dom = createDom(fiber);
    const html = props.dangerouslySetInnerHTML;
    if (html != null && props.children != null) {
      throw new Error('Cannot specify both children and dangerouslySetInnerHTML.');
    }
    children = html == null ? props.children : null;
  } else if (type?.$$typeof === CONTEXT) {
    fiber.context = new Map(fiber.context);
    fiber.context.set(type, props.value);
    children = props.children;
  } else if (type?.$$typeof === CONSUMER) {
    children = props.children(readContext(fiber, type._context));
  } else {
    children = renderComponent(fiber, type);
    fiber.output = children;
  }
  reconcileChildren(fiber, children);
  return nextFiber(fiber);
}

function detachRef(fiber) {
  const ref = fiber.props?.ref;
  if (ref == null || (!fiber.instance && !fiber.dom) || fiber.type === PORTAL) return;
  if (typeof fiber.refCleanup === 'function') fiber.refCleanup();
  else setRef(ref, null);
  fiber.refCleanup = undefined;
}

function unmountFiber(fiber) {
  visitTree(fiber, node => {
    if (node.instance) {
      node.instance.__mounted = false;
      node.instance.componentWillUnmount?.();
      node.instance.__queue.length = 0;
    }
    cleanupHooks(node);
    detachRef(node);
    if (node.dom && node.type !== ROOT && node.type !== PORTAL) {
      updateDom(node.dom, node.props, {});
      node.dom.remove();
    }
  });
}

// 一个组件可能返回多个 DOM 节点。移动组件时收集全部顶层 host 节点，
// 遇到 host 节点即停止下降；Portal 的孩子有独立的 DOM 容器。
function hostChildren(parent) {
  const nodes = [];
  function collect(node) {
    if (node.type === PORTAL) return;
    if (node.dom) { nodes.push(node.dom); return; }
    for (let child = node.child; child; child = child.sibling) collect(child);
  }
  for (let child = parent.child; child; child = child.sibling) collect(child);
  return nodes;
}

function synchronizeChildren(fiber) {
  if (!fiber.dom || fiber.type === TEXT || fiber.props.dangerouslySetInnerHTML != null) return;
  const dom = fiber.dom;
  const nodes = hostChildren(fiber);
  // Portal 不接管整个容器，保留容器内已有的非 React 节点。
  let cursor = fiber.type === PORTAL
    ? hostChildren(fiber.alternate ?? { child: null }).find(node => node.parentNode === dom) ?? null
    : dom.firstChild;
  for (const node of nodes) {
    if (node === cursor) cursor = cursor.nextSibling;
    else dom.insertBefore(node, cursor);
  }
}

function commitRoot(root) {
  const finished = root.work;
  if (!root.current) root.container.replaceChildren();

  // Before mutation：更换的 ref 先断开；class snapshot 读取旧 DOM。
  visitTree(finished, fiber => {
    const old = fiber.alternate;
    if (old && old.props.ref !== fiber.props.ref) detachRef(old);
    if (fiber.instance && old && fiber.classDidRender) {
      const instance = fiber.instance;
      if (instance.getSnapshotBeforeUpdate) {
        const oldProps = instance.props;
        const oldState = instance.state;
        instance.props = fiber.props;
        instance.state = fiber.classState;
        try {
          fiber.snapshot = instance.getSnapshotBeforeUpdate(fiber.previousProps, fiber.previousState);
        } finally {
          instance.props = oldProps;
          instance.state = oldState;
        }
      }
    }
  });

  // Mutation：只在完整 render 成功后更新、插入和移动实际 DOM。
  for (const deleted of root.deletions) unmountFiber(deleted);
  visitTree(finished, fiber => {
    if (fiber.dom && fiber.type !== ROOT && fiber.type !== PORTAL && fiber.alternate) {
      updateDom(fiber.dom, fiber.alternate.props, fiber.props);
    }
  });
  visitTree(finished, synchronizeChildren, true);
  // select 的 value 必须在 option 已挂载后应用。
  visitTree(finished, fiber => {
    if (fiber.type === 'select') updateDom(fiber.dom, fiber.props, fiber.props);
    commitHooks(fiber);
    if (fiber.instance) {
      fiber.classCallbacks = fiber.instance.__queue.splice(0, fiber.processedCount);
      fiber.instance.props = fiber.props;
      fiber.instance.state = fiber.classState;
      fiber.instance.context = fiber.classContext;
      fiber.instance.__mounted = true;
    }
  });
  root.current = finished;
  root.work = null;
  root.nextUnit = null;

  // Layout：DOM 已完整连接，先赋 refs，再从子组件开始执行 layout Effects。
  visitTree(finished, fiber => {
    if ((fiber.instance || fiber.dom) && fiber.type !== ROOT && fiber.type !== PORTAL) {
      if (!fiber.alternate || fiber.alternate.props.ref !== fiber.props.ref) {
        fiber.refCleanup = setRef(fiber.props.ref, fiber.instance ?? fiber.dom);
      } else fiber.refCleanup = fiber.alternate.refCleanup;
    }
  });
  visitTree(finished, fiber => {
    runEffects(fiber, 'layout');
    if (fiber.instance && fiber.classDidRender) {
      if (!fiber.alternate) fiber.instance.componentDidMount?.();
      else fiber.instance.componentDidUpdate?.(fiber.previousProps, fiber.previousState, fiber.snapshot);
    }
    for (const update of fiber.classCallbacks ?? []) update.callback?.call(fiber.instance);
  }, true);

  root.pendingPassive = finished;
  root.passiveTimer = setTimeout(() => root.flushPassiveEffects(), 0);
  // 不让 alternate 保留整条历史树，避免每次更新累计不可回收的 Fiber。
  visitTree(finished, fiber => { fiber.alternate = null; });
}

export function createRoot(container, options = {}) {
  if (!container || ![1, 9, 11].includes(container.nodeType)) {
    throw new TypeError('Target container is not a DOM element.');
  }
  if (containerRoots.has(container)) throw new Error('This container already has a root.');
  const root = {
    container, options, id: nextRootId++, nextId: 0,
    identifierPrefix: options.identifierPrefix ?? '',
    element: null, current: null, work: null, nextUnit: null,
    version: 0, workVersion: -1, deletions: [], suspensions: new Map(),
    unmounted: false, pendingPassive: null, passiveTimer: null,

    schedule() {
      if (this.unmounted) return;
      this.version++;
      scheduleRoot(this);
    },
    beginWork() {
      this.flushPassiveEffects();
      this.deletions = [];
      this.workVersion = this.version;
      this.work = {
        type: ROOT, key: null, props: { children: this.element },
        dom: container, root: this, parent: null, child: null, sibling: null,
        alternate: this.current, context: new Map(), path: '', hooks: [],
      };
      this.nextUnit = this.work;
    },
    discardWork() {
      this.work = null;
      this.nextUnit = null;
      this.deletions = [];
    },
    suspend(fiber, promise) {
      let boundary = fiber.parent;
      while (boundary && (boundary.type !== SUSPENSE || this.suspensions.has(boundary.path))) {
        boundary = boundary.parent;
      }
      if (!boundary) throw new Error('A lazy component suspended without a Suspense boundary.');
      const path = boundary.path;
      this.suspensions.set(path, promise);
      const retry = () => {
        if (this.suspensions.get(path) !== promise || this.unmounted) return;
        this.suspensions.delete(path);
        this.schedule();
      };
      promise.then(retry, retry);
      // 丢弃候选树，重新从已提交的树协调 fallback；未提交的队列不被消费。
      this.discardWork();
      this.beginWork();
    },
    performWork(deadline) {
      if (this.unmounted) return true;
      if (!this.work || this.workVersion !== this.version) this.beginWork();
      while (this.nextUnit) {
        const fiber = this.nextUnit;
        try {
          this.nextUnit = performUnit(fiber);
        } catch (error) {
          if (error && typeof error.then === 'function') this.suspend(fiber, error);
          else throw error;
        }
        if (this.workVersion !== this.version) this.beginWork();
        if (performance.now() >= deadline) return false;
      }
      commitRoot(this);
      return !this.work;
    },
    flushPassiveEffects() {
      clearTimeout(this.passiveTimer);
      const pending = this.pendingPassive;
      this.pendingPassive = null;
      if (!pending) return;
      try {
        visitTree(pending, fiber => runEffects(fiber, 'passive'), true);
      } catch (error) { this.reportError(error); }
    },
    reportError(error) {
      if (options.onUncaughtError) options.onUncaughtError(error, { componentStack: '' });
      else console.error(error);
    },
  };
  containerRoots.set(container, root);
  return {
    render(element) {
      if (root.unmounted) throw new Error('Cannot update an unmounted root.');
      root.element = element;
      root.suspensions.clear();
      root.schedule();
    },
    unmount() {
      if (root.unmounted) return;
      root.flushPassiveEffects();
      root.unmounted = true;
      cancelRoot(root);
      root.discardWork();
      if (root.current) unmountFiber(root.current);
      root.current = null;
      root.element = null;
      root.suspensions.clear();
      containerRoots.delete(container);
    },
  };
}

export { flushSync };
