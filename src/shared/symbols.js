// 共享标记把「普通对象」与 Element、Context、组件包装器区分开。
// Symbol.for 保证同一页面中的多个 mini-react 模块实例能识别这些类型。
export const ELEMENT = Symbol.for('mini-react.element');
export const TEXT = Symbol.for('mini-react.text');
export const FRAGMENT = Symbol.for('mini-react.fragment');
export const CONTEXT = Symbol.for('mini-react.context');
export const CONSUMER = Symbol.for('mini-react.consumer');
export const MEMO = Symbol.for('mini-react.memo');
export const FORWARD_REF = Symbol.for('mini-react.forward_ref');
export const LAZY = Symbol.for('mini-react.lazy');
export const SUSPENSE = Symbol.for('mini-react.suspense');
export const PORTAL = Symbol.for('mini-react.portal');
export const STRICT_MODE = Symbol.for('mini-react.strict_mode');
