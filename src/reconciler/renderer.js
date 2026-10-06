/**
 * 客户端渲染主流程：createRoot 接收 DOM 容器，render 接收 Element，unmount 清理整棵树。
 * render 阶段生成可放弃的候选树：调用组件、读取队列、协调 children、创建脱离文档的 DOM。
 * commit 阶段才更新已挂载 DOM、发布状态并执行 refs/Effects；候选树必须先完整计算成功。
 * 这里将遍历、组件分派和提交放在一个模块中，便于学习；不包含真实 React 的 flags/Lanes。
 */
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

/** Fiber 已携带最近 Provider 的 Context Map；缺少 Provider 时才读取 createContext 默认值。 */
function readContext(fiber, context) {
  return fiber.context.has(context) ? fiber.context.get(context) : context._defaultValue;
}

// memo 只过滤来自父组件的相同 props，组件自身状态队列中的更新仍需要重新计算。
function hasOwnUpdate(fiber) {
  return fiber.alternate?.hooks?.some(hook => hook.queue?.pending.length) ||
    fiber.alternate?.instance?.__queue.length;
}

// useContext/class contextType 记录实际读过的值，让 Context 变化可以穿过 memo 比较器。
function contextChanged(fiber) {
  for (const [context, value] of fiber.alternate?.contextDependencies ?? []) {
    if (!Object.is(value, readContext(fiber, context))) return true;
  }
  return false;
}

/**
 * 类实例跨 render 保持身份，但 props/state 暂存在候选 Fiber 上。
 * 读取本轮开始时的队列长度，不在 render 删除队列项，保证中断或 Suspense 重算不会丢更新。
 */
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
  // 本轮只处理这个快照中的更新；后续追加项留到下一轮，并由 root.version 触发重启。
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
  // forceUpdate 绕过 shouldComponentUpdate；contextType 变化同样必须重新渲染。
  if (old && !forced && Object.is(instance.context, context)) {
    const shouldUpdate = instance.shouldComponentUpdate
      ? instance.shouldComponentUpdate(fiber.props, state, context)
      : !instance.isPureReactComponent ||
        !shallowEqual(instance.props, fiber.props) || !shallowEqual(instance.state, state);
    if (!shouldUpdate) {
      fiber.classDidRender = false;
      // 复用组件输出描述，但 performUnit 仍协调孩子，子组件自身更新不会被祖先挡住。
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
    // 即使 render 抛错或挂起，也恢复公开实例，避免未提交状态泄露到当前 UI。
    instance.props = fiber.previousProps;
    instance.state = fiber.previousState;
    instance.context = previousContext;
  }
}

/** 解包 memo/lazy/forwardRef，最终分派到类组件或带 Hook dispatcher 的函数组件。 */
function renderComponent(fiber, type) {
  if (type?.$$typeof === MEMO) {
    const old = fiber.alternate;
    const compare = type.compare ?? shallowEqual;
    // ref、自己的状态、读过的 Context 都是独立的更新理由，不能仅以 props 相等跳过。
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
      // 只复用该组件的输出，并未跳过子树遍历；这和真实 React 的子树 bailout 优化有别。
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

/**
 * 一个可恢复的 render 工作单元：计算当前 Fiber 的 children，再返回深度优先的下个 Fiber。
 * 不更新已挂载节点，不执行 refs/Effects；新 DOM 此时仍未连接到页面。
 */
function performUnit(fiber) {
  const { type, props } = fiber;
  let children;
  if (type === ROOT || type === FRAGMENT || type === STRICT_MODE) {
    // StrictMode 在本学习版只透传 children，不执行 React 开发模式的额外调用。
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
    // 写 Provider 时复制 Map，兄弟分支继续持有原 Map；子树读取复制后的最近值。
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

/** ref 更换/卸载时优先调用 callback ref 返回的 cleanup，否则传 null 或清空 current。 */
function detachRef(fiber) {
  const ref = fiber.props?.ref;
  if (ref == null || (!fiber.instance && !fiber.dom) || fiber.type === PORTAL) return;
  if (typeof fiber.refCleanup === 'function') fiber.refCleanup();
  else setRef(ref, null);
  fiber.refCleanup = undefined;
}

/** 删除发生在 commit/unmount：清理组件、Hook、ref 和宿主事件后，移除本树拥有的 DOM。 */
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
    // insertBefore 对已有节点是移动，对新节点是插入；复用 DOM 就能保留节点身份。
    else dom.insertBefore(node, cursor);
  }
}

/**
 * 按 before mutation → mutation/状态发布 → layout → 延后 passive 的顺序提交完整候选树。
 * 这一教学流程不设分片时间预算：DOM 与已提交状态不会在两个 render 分片之间半更新。
 * 与 React 的细节并不完全等同，例如删除节点的 Hook cleanup 在这里集中执行。
 */
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
          // 实例看到新 props/state，参数指向旧值；此时 DOM 尚未变化，可保存滚动等快照。
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
    // 成功提交后才消费本轮读过的状态队列；被放弃的候选树不会执行这一步。
    commitHooks(fiber);
    if (fiber.instance) {
      fiber.classCallbacks = fiber.instance.__queue.splice(0, fiber.processedCount);
      fiber.instance.props = fiber.props;
      fiber.instance.state = fiber.classState;
      fiber.instance.context = fiber.classContext;
      fiber.instance.__mounted = true;
    }
  });
  // current 是外部可见结果；下一轮 beginWork 用它作 alternate，而非复用未完成的 work。
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
  // timer 表达 passive 延后执行；不保证这里精确复现 React 相对浏览器绘制的时机。
  root.passiveTimer = setTimeout(() => root.flushPassiveEffects(), 0);
  // 不让 alternate 保留整条历史树，避免每次更新累计不可回收的 Fiber。
  visitTree(finished, fiber => { fiber.alternate = null; });
}

/** 创建单一容器的 root 控制器；公开 render 只请求工作，调度器决定何时开始计算。 */
export function createRoot(container, options = {}) {
  if (!container || ![1, 9, 11].includes(container.nodeType)) {
    throw new TypeError('Target container is not a DOM element.');
  }
  if (containerRoots.has(container)) throw new Error('This container already has a root.');
  const root = {
    container, options, id: nextRootId++, nextId: 0,
    identifierPrefix: options.identifierPrefix ?? '',
    // element 是最新请求；current 是已提交结果；work/nextUnit 是可暂停、可放弃的候选工作。
    element: null, current: null, work: null, nextUnit: null,
    // 版本号把“有新请求”与“当前候选树基于哪次请求”区分开；不是 React 的 Lane 位集。
    // deletions 只服务当前候选树；suspensions 以 Fiber path 记录要显示 fallback 的边界。
    version: 0, workVersion: -1, deletions: [], suspensions: new Map(),
    unmounted: false, pendingPassive: null, passiveTimer: null,

    schedule() {
      if (this.unmounted) return;
      this.version++;
      scheduleRoot(this);
    },
    beginWork() {
      // 下一轮先完成上次 passive，避免新 render 越过尚未执行的 Effect 清理/创建。
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
      // 未提交队列仍保留在旧 Fiber/类实例中，丢弃候选树不需要回滚已挂载 DOM。
      this.work = null;
      this.nextUnit = null;
      this.deletions = [];
    },
    suspend(fiber, promise) {
      let boundary = fiber.parent;
      // 已在显示 fallback 的边界不能再兜住 fallback 自己的挂起，继续找外层边界。
      while (boundary && (boundary.type !== SUSPENSE || this.suspensions.has(boundary.path))) {
        boundary = boundary.parent;
      }
      if (!boundary) throw new Error('A lazy component suspended without a Suspense boundary.');
      const path = boundary.path;
      this.suspensions.set(path, promise);
      const retry = () => {
        // 旧 Promise 晚于新请求完成时不覆盖最新边界状态；卸载之后不再调度。
        if (this.suspensions.get(path) !== promise || this.unmounted) return;
        this.suspensions.delete(path);
        this.schedule();
      };
      // resolve 后重新读取 lazy 模块；reject 后重新 render，让缓存的真实错误被报告。
      promise.then(retry, retry);
      // 丢弃候选树，重新从已提交的树协调 fallback；未提交的队列不被消费。
      // 简化版会正常卸载被 fallback 替换的 primary 子树，不模拟 React 的隐藏树保活。
      this.discardWork();
      this.beginWork();
    },
    performWork(deadline) {
      if (this.unmounted) return true;
      // 分片期间到达新更新时，从 current 重算整个根，防止提交基于过期请求的候选树。
      if (!this.work || this.workVersion !== this.version) this.beginWork();
      while (this.nextUnit) {
        const fiber = this.nextUnit;
        try {
          this.nextUnit = performUnit(fiber);
        } catch (error) {
          // lazy 抛出的 thenable 是挂起信号；普通错误交还调度器，不当成 Suspense。
          if (error && typeof error.then === 'function') this.suspend(fiber, error);
          else throw error;
        }
        if (this.workVersion !== this.version) this.beginWork();
        // false 把恢复位置留在 root.nextUnit，调度器随后换一个任务继续。
        if (performance.now() >= deadline) return false;
      }
      commitRoot(this);
      return !this.work;
    },
    flushPassiveEffects() {
      clearTimeout(this.passiveTimer);
      const pending = this.pendingPassive;
      // 先取走 pending，再调用用户 Effect；回调可调度更新，不会重复执行同一棵提交树。
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
      // 显式的新 render 请求重新选择内容，旧请求留下的 fallback 标记不应沿用。
      root.suspensions.clear();
      root.schedule();
    },
    unmount() {
      if (root.unmounted) return;
      root.flushPassiveEffects();
      // 先标记并取消排队工作，再清理已提交树，避免清理回调重新激活这个根。
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
