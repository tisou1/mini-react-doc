import { ELEMENT, FRAGMENT, PORTAL } from '../shared/symbols.js';

export const Fragment = FRAGMENT;

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
  if (children.length === 1) props.children = children[0];
  else if (children.length > 1) props.children = children;
}

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

export function isValidElement(value) {
  return value !== null && typeof value === 'object' && value.$$typeof === ELEMENT;
}

export function createRef() {
  return { current: null };
}

function escapeKey(key) {
  return '$' + String(key).replace(/[=:]/g, character => character === '=' ? '=0' : '=2');
}

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

function map(children, callback, thisArg) {
  if (children == null) return children;
  const result = [];
  let index = 0;
  traverse(children, (child, path) => {
    appendMapped(result, callback.call(thisArg, child, index++), child, path);
  });
  return result;
}

function forEach(children, callback, thisArg) {
  if (children == null) return;
  let index = 0;
  traverse(children, child => callback.call(thisArg, child, index++));
}

function count(children) {
  if (children == null) return 0;
  let size = 0;
  traverse(children, () => size++);
  return size;
}

function toArray(children) {
  return map(children, child => child) ?? [];
}

function only(children) {
  if (!isValidElement(children)) {
    throw new Error('Children.only expected a single mini-react element.');
  }
  return children;
}

export const Children = { map, forEach, count, toArray, only };
