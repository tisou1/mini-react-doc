/**
 * Element 是「希望渲染什么」的描述，不是 DOM，也不保存组件运行状态。
 * renderer 将它协调成 Fiber，后者才持有 alternate、Hooks、DOM 和更新标记。
 * 本模块只组装描述与遍历 children；真正的子节点规范化交给 reconciler。
 */
import { ELEMENT, FRAGMENT, PORTAL } from '../shared/symbols.js';

// Fragment 提供分组身份，renderer 会展开其 children，但不创建额外 DOM 容器。
export const Fragment = FRAGMENT;

// key 参与同级 Fiber 身份匹配，因此不传给组件；开发期 source/self 在此忽略。
const reservedProps = new Set(['key', '__self', '__source']);

function applyDefaultProps(type, props) {
  // React 19 的函数组件使用参数默认值；保留类组件的 static defaultProps。
  if (!type?.prototype?.isReactComponent || !type.defaultProps) return;
  for (const name of Object.keys(type.defaultProps)) {
    if (props[name] === undefined) props[name] = type.defaultProps[name];
  }
}

function assignChildren(props, children) {
  // 单个 child 直接保存，多个 child 才形成数组；不在这里展平或创建 DOM。
  // 未传可变 children 参数时，不覆盖 config/clone 合并后的 props.children。
  if (children.length === 1) props.children = children[0];
  else if (children.length > 1) props.children = children;
}

/** 从 type、props 和可变 children 创建 Element；此时不执行组件、不进行挂载。 */
export function createElement(type, config, ...children) {
  const props = {};
  let key = null;

  if (config != null) {
    if (config.key !== undefined) key = String(config.key);
    for (const name of Object.keys(config)) {
      if (!reservedProps.has(name)) props[name] = config[name];
    }
  }

  assignChildren(props, children);
  applyDefaultProps(type, props);
  // ref 是 React 19 风格的普通 prop，renderer 在 commit 时处理它。
  return { $$typeof: ELEMENT, type, key, props };
}

/** 浅合并 props 并返回新 Element；可变 children 参数覆盖合并后的 children。 */
export function cloneElement(element, config, ...children) {
  const props = { ...element.props };
  let key = element.key;

  if (config != null) {
    if (config.key !== undefined) key = String(config.key);
    for (const name of Object.keys(config)) {
      // ref: undefined 保留旧 ref；明确传 null 时才移除 ref。
      if (!reservedProps.has(name) && !(name === 'ref' && config[name] === undefined)) {
        props[name] = config[name];
      }
    }
  }

  assignChildren(props, children);
  applyDefaultProps(element.type, props);
  return { $$typeof: ELEMENT, type: element.type, key, props };
}

/** 检查 Element 类型标记；可渲染的文本、数组和 Portal 并不都是 Element。 */
export function isValidElement(value) {
  return value !== null && typeof value === 'object' && value.$$typeof === ELEMENT;
}

/** 每次调用返回新引用容器；renderer 在 commit 赋值，函数组件通常用 useRef 保持身份。 */
export function createRef() {
  return { current: null };
}

// 转义路径分隔字符，让用户 key 与嵌套集合自动生成的 key 路径不会混淆。
function escapeKey(key) {
  return '$' + String(key).replace(/[=:]/g, character => character === '=' ? '=0' : '=2');
}

// 有显式 key 时使用它；无 key 时使用位置，因此无 key 的列表重排无法表达稳定身份。
function childKey(child, index) {
  return child != null && typeof child === 'object' && child.key != null
    ? escapeKey(child.key)
    : index.toString(36);
}

function escapePath(path) {
  return path.replace(/\/+/g, '$&/');
}

function isCollection(value) {
  return Array.isArray(value) || (
    value !== null && typeof value === 'object' &&
    !isValidElement(value) && value.$$typeof !== PORTAL &&
    typeof value[Symbol.iterator] === 'function'
  );
}

/** 深入数组/iterable，给每个叶子构造 key 路径；不执行组件或递归 Element 内部。 */
function traverse(children, callback, path = '') {
  if (isCollection(children)) {
    const prefix = path === '' ? '.' : path + ':';
    let index = 0;
    for (const child of children) {
      traverse(child, callback, prefix + childKey(child, index++));
    }
    return;
  }

  // 空节点也占据 Children.count / 回调的一个位置，但最终 map/toArray 会过滤。
  const child = children == null || typeof children === 'boolean' ? null : children;
  if (child !== null && typeof child === 'object' && !isValidElement(child) && child.$$typeof !== PORTAL) {
    throw new TypeError('Objects are not valid as a mini-react child.');
  }
  if (typeof child === 'function' || typeof child === 'symbol') return;
  // Element（包括 Fragment）是遍历边界，不能继续读取其 props.children。
  callback(child, path || '.' + childKey(child, 0));
}

// map 可以返回集合：展平返回值，同时将新 key 与原路径组合，保留原节点身份线索。
function appendMapped(result, mapped, sourceChild, sourcePath, prefix = '') {
  if (isCollection(mapped)) {
    traverse(mapped, (child, path) => {
      appendMapped(result, child, child, path, prefix + escapePath(sourcePath) + '/');
    });
    return;
  }
  if (mapped == null || typeof mapped === 'boolean') return;

  if (isValidElement(mapped)) {
    const mappedKey = mapped.key != null && mapped.key !== sourceChild?.key
      ? escapePath(mapped.key) + '/'
      : '';
    // 返回新 Element，避免为了组合 key 修改调用者的 Element。
    result.push({ ...mapped, key: prefix + mappedKey + sourcePath });
  } else {
    result.push(mapped);
  }
}

/** 遍历叶子并展平映射结果，过滤空节点；顶层 null/undefined 保持原值。 */
function map(children, callback, thisArg) {
  if (children == null) return children;
  const result = [];
  let index = 0;
  traverse(children, (child, path) => {
    appendMapped(result, callback.call(thisArg, child, index++), child, path);
  });
  return result;
}

/** 与 map 使用相同遍历边界，但忽略回调返回值，不生成新 children。 */
function forEach(children, callback, thisArg) {
  if (children == null) return;
  let index = 0;
  traverse(children, child => callback.call(thisArg, child, index++));
}

/** 统计遍历位置：数组中的空节点也计数，Element/Fragment 内部不展开。 */
function count(children) {
  if (children == null) return 0;
  let size = 0;
  traverse(children, () => size++);
  return size;
}

/** 将 children 转为过滤空节点的一维数组，并为 Element 组合稳定的遍历 key。 */
function toArray(children) {
  return map(children, child => child) ?? [];
}

/** 要求输入本身是一个 Element；包含一个 Element 的数组仍不满足条件。 */
function only(children) {
  if (!isValidElement(children)) {
    throw new Error('Children.only expected a single mini-react element.');
  }
  return children;
}

/** 操作不透明的 children 结构，不代表组件执行后最终产生的 DOM 节点集合。 */
export const Children = { map, forEach, count, toArray, only };
