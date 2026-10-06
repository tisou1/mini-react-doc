/**
 * Fiber 树与 children 协调：输入 Element 描述和上一棵已提交的树，
 * 输出本轮候选 Fiber 链与待删除节点；整个模块属于 render 阶段，不操作 DOM。
 * Element 表达“想显示什么”，Fiber 额外保存“上次显示了什么、下一步做什么”。
 */
import { ELEMENT, TEXT, FRAGMENT, PORTAL } from '../shared/symbols.js';

export const ROOT = Symbol('mini-react.root');

// null 也占一个位置：无 key 的组件状态由父节点下的位置决定。
// 嵌套数组作为 Fragment 保留层级，而不是随意 flatten 破坏组件身份。
export function childElements(children) {
  const values = Array.isArray(children) ? children : [children];
  return values.map(value => {
    if (value == null || typeof value === 'boolean') return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
      return { $$typeof: ELEMENT, type: TEXT, key: null, props: { nodeValue: String(value) } };
    }
    if (Array.isArray(value)) {
      return { $$typeof: ELEMENT, type: FRAGMENT, key: null, props: { children: value } };
    }
    if (value.$$typeof === ELEMENT || value.$$typeof === PORTAL) return value;
    throw new TypeError('Invalid React child: expected an element, text, array, or empty value.');
  });
}

export function createFiber(element, parent, alternate, index) {
  const type = element.$$typeof === PORTAL ? PORTAL : element.type;
  const identity = element.key == null ? `i:${index}` : `k:${element.key}`;
  return {
    type,
    key: element.key,
    props: element.props,
    parent,
    // 三个显式指针把树展开为可恢复的深度优先遍历，不依赖一直占用的递归调用栈。
    child: null,
    sibling: null,
    // 本轮候选节点指向身份匹配的已提交节点，读取旧 DOM/Hooks；不会原地改写旧树。
    // 这里每轮新建 Fiber 对象，不实现真实 React 中复用两套 Fiber 的完整双缓冲。
    alternate,
    index,
    // path 是本版本 Suspense 边界的稳定定位线索，key 只在同一父节点下区分身份。
    path: `${parent.path}/${encodeURIComponent(identity)}`,
    root: parent.root,
    // 默认共享父级 Map；只有 Provider 建立新 Map，避免污染兄弟节点的 Context。
    context: parent.context,
    dom: alternate?.dom ?? null,
    hooks: [],
  };
}

/**
 * 同一父节点下用 key（无 key 时用原始 index）找到旧节点，再检查 type。
 * 身份相同则携带 alternate，DOM 与状态得以延续；未匹配节点在 commit 中卸载。
 * 这是直观的 Map 协调，不实现 React 的完整两段 diff、flags 或移动代价优化。
 */
export function reconcileChildren(parent, children) {
  const oldByIdentity = new Map();
  for (let old = parent.alternate?.child; old; old = old.sibling) {
    oldByIdentity.set(old.key == null ? old.index : `$${old.key}`, old);
  }
  let previous = null;
  childElements(children).forEach((element, index) => {
    if (!element) return;
    const identity = element.key == null ? index : `$${element.key}`;
    const old = oldByIdentity.get(identity);
    const type = element.$$typeof === PORTAL ? PORTAL : element.type;
    // Portal 的宿主容器也属于身份：换容器时按卸载/挂载处理，不能沿用原 DOM 子树。
    const same = old?.type === type && (type !== PORTAL || old.props.container === element.props.container);
    const fiber = createFiber(element, parent, same ? old : null, index);
    if (same) oldByIdentity.delete(identity);
    if (previous) previous.sibling = fiber;
    else parent.child = fiber;
    previous = fiber;
  });
  // render 只记录删除意图，候选工作若被放弃，就不会触发卸载或清理副作用。
  for (const old of oldByIdentity.values()) parent.root.deletions.push(old);
}

// 显式 child/sibling/parent 指针将递归树转换成可暂停、可恢复的工作单元。
export function nextFiber(fiber) {
  if (fiber.child) return fiber.child;
  let node = fiber;
  while (node) {
    if (node.sibling) return node.sibling;
    node = node.parent;
  }
  return null;
}

/** commit 可整树遍历：默认父先子后；postOrder 用于先连接子 DOM、先执行子 layout。 */
export function visitTree(fiber, visitor, postOrder = false) {
  if (!fiber) return;
  if (!postOrder) visitor(fiber);
  for (let child = fiber.child; child; child = child.sibling) visitTree(child, visitor, postOrder);
  if (postOrder) visitor(fiber);
}
