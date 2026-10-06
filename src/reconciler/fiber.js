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
    child: null,
    sibling: null,
    alternate,
    index,
    path: `${parent.path}/${encodeURIComponent(identity)}`,
    root: parent.root,
    context: parent.context,
    dom: alternate?.dom ?? null,
    hooks: [],
  };
}

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
    const same = old?.type === type && (type !== PORTAL || old.props.container === element.props.container);
    const fiber = createFiber(element, parent, same ? old : null, index);
    if (same) oldByIdentity.delete(identity);
    if (previous) previous.sibling = fiber;
    else parent.child = fiber;
    previous = fiber;
  });
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

export function visitTree(fiber, visitor, postOrder = false) {
  if (!fiber) return;
  if (!postOrder) visitor(fiber);
  for (let child = fiber.child; child; child = child.sibling) visitTree(child, visitor, postOrder);
  if (postOrder) visitor(fiber);
}
