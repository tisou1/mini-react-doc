import { TEXT, PORTAL } from '../shared/symbols.js';

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

const reservedProps = new Set([
  'children', 'key', 'ref', 'style', 'dangerouslySetInnerHTML',
  'value', 'checked', 'defaultValue', 'defaultChecked',
  'suppressContentEditableWarning', 'suppressHydrationWarning',
]);

const booleanAttributes = new Set([
  'allowFullScreen', 'async', 'autoFocus', 'autoPlay', 'checked', 'controls',
  'default', 'defer', 'disabled', 'disablePictureInPicture', 'disableRemotePlayback',
  'formNoValidate', 'hidden', 'inert', 'isMap', 'itemScope', 'loop', 'multiple',
  'muted', 'noModule', 'noValidate', 'open', 'playsInline', 'readOnly', 'required',
  'reversed', 'selected',
]);

const booleanishAttributes = new Set([
  'contentEditable', 'draggable', 'spellCheck', 'autoReverse',
  'externalResourcesRequired', 'focusable', 'preserveAlpha',
]);

const unitlessStyles = new Set([
  'animationIterationCount', 'aspectRatio', 'borderImageOutset', 'borderImageSlice',
  'borderImageWidth', 'boxFlex', 'boxFlexGroup', 'boxOrdinalGroup', 'columnCount',
  'columns', 'fillOpacity', 'flex', 'flexGrow', 'flexPositive', 'flexShrink',
  'flexNegative', 'flexOrder', 'floodOpacity', 'fontWeight', 'gridArea', 'gridColumn',
  'gridColumnEnd', 'gridColumnSpan', 'gridColumnStart', 'gridRow', 'gridRowEnd',
  'gridRowSpan', 'gridRowStart', 'lineClamp', 'lineHeight', 'opacity', 'order',
  'orphans', 'scale', 'stopOpacity', 'strokeDasharray', 'strokeDashoffset',
  'strokeMiterlimit', 'strokeOpacity', 'strokeWidth', 'tabSize', 'widows', 'zIndex',
  'zoom',
]);

const attributeAliases = {
  className: 'class',
  htmlFor: 'for',
  acceptCharset: 'accept-charset',
  httpEquiv: 'http-equiv',
  tabIndex: 'tabindex',
};

// SVG 的坐标类属性保留大小写；样式类属性需要对应的连字符形式。
const svgAttributeAliases = {
  clipPath: 'clip-path', clipRule: 'clip-rule', colorInterpolation: 'color-interpolation',
  colorInterpolationFilters: 'color-interpolation-filters', dominantBaseline: 'dominant-baseline',
  fillOpacity: 'fill-opacity', fillRule: 'fill-rule', floodColor: 'flood-color',
  floodOpacity: 'flood-opacity', fontFamily: 'font-family', fontSize: 'font-size',
  fontWeight: 'font-weight', letterSpacing: 'letter-spacing', lightingColor: 'lighting-color',
  markerEnd: 'marker-end', markerMid: 'marker-mid', markerStart: 'marker-start',
  paintOrder: 'paint-order', pointerEvents: 'pointer-events', shapeRendering: 'shape-rendering',
  stopColor: 'stop-color', stopOpacity: 'stop-opacity', strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset', strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin', strokeMiterlimit: 'stroke-miterlimit',
  strokeOpacity: 'stroke-opacity', strokeWidth: 'stroke-width', textAnchor: 'text-anchor',
  textDecoration: 'text-decoration', vectorEffect: 'vector-effect', wordSpacing: 'word-spacing',
};

const eventListeners = new WeakMap();
const initializedNodes = new WeakSet();
const pendingSelectDefaults = new WeakMap();

function getContainer(fiber) {
  for (let parent = fiber.parent; parent; parent = parent.parent) {
    if (parent.type === PORTAL) return parent.props.container;
  }
  return fiber.root.container;
}

function containerNamespace(container) {
  return container.localName === 'foreignObject' ? HTML_NAMESPACE
    : container.namespaceURI === SVG_NAMESPACE ? SVG_NAMESPACE : HTML_NAMESPACE;
}

function getNamespace(fiber) {
  if (fiber.type === 'svg') return SVG_NAMESPACE;
  // Function、Fragment 等 Fiber 没有实际 DOM，命名空间要向上寻找宿主节点。
  for (let parent = fiber.parent; parent; parent = parent.parent) {
    if (parent.type === PORTAL) return containerNamespace(parent.props.container);
    if (parent.type === 'foreignObject') return HTML_NAMESPACE;
    if (typeof parent.type === 'string') {
      return parent.namespace ?? parent.dom?.namespaceURI
        ?? (parent.type === 'svg' ? SVG_NAMESPACE : HTML_NAMESPACE);
    }
  }
  return containerNamespace(fiber.root.container);
}

/** 根据 Fiber 创建脱离文档的 DOM，已挂载节点的修改只由 commit 阶段触发。 */
export function createDom(fiber) {
  const container = getContainer(fiber);
  const ownerDocument = container.nodeType === 9 ? container : container.ownerDocument;
  fiber.namespace = getNamespace(fiber);
  const dom = fiber.type === TEXT
    ? ownerDocument.createTextNode('')
    : fiber.namespace === SVG_NAMESPACE
      ? ownerDocument.createElementNS(SVG_NAMESPACE, fiber.type)
      : ownerDocument.createElement(fiber.type);
  updateDom(dom, {}, fiber.props);
  return dom;
}

function cssName(name) {
  if (name.startsWith('--')) return name;
  return name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).replace(/^ms-/, '-ms-');
}

function styleValue(name, value) {
  if (value == null || typeof value === 'boolean' || value === '') return '';
  const unprefixed = name.replace(/^(Webkit|Moz|ms|O)([A-Z])/, (_, prefix, first) => first.toLowerCase());
  if (typeof value === 'number' && value !== 0 && !name.startsWith('--') && !unitlessStyles.has(unprefixed)) {
    return `${value}px`;
  }
  return String(value).trim();
}

function updateStyle(dom, previous = {}, next = {}) {
  previous ??= {};
  next ??= {};
  for (const name of Object.keys(previous)) {
    if (!(name in next)) dom.style.removeProperty(cssName(name));
  }
  for (const name of Object.keys(next)) {
    if (previous[name] !== next[name]) dom.style.setProperty(cssName(name), styleValue(name, next[name]));
  }
}

function getEvent(name, dom, props) {
  const capture = name.endsWith('Capture') && name !== 'onGotPointerCapture' && name !== 'onLostPointerCapture';
  let type = name.slice(2, capture ? -7 : undefined).toLowerCase();
  if (type === 'doubleclick') type = 'dblclick';
  if (type === 'focus') type = 'focusin';
  if (type === 'blur') type = 'focusout';
  if (type === 'change') {
    const tag = dom.localName;
    const inputType = props.type ?? dom.type;
    if (tag === 'textarea' || (tag === 'input' && !['checkbox', 'radio', 'file'].includes(inputType))) {
      type = 'input';
    }
  }
  return { type, capture };
}

function updateEvent(dom, name, nextHandler, props) {
  let listeners = eventListeners.get(dom);
  if (!listeners) {
    listeners = new Map();
    eventListeners.set(dom, listeners);
  }
  const previous = listeners.get(name);
  const { type, capture } = getEvent(name, dom, props);
  if (previous?.handler === nextHandler && previous.type === type && previous.capture === capture) return;
  if (previous) {
    dom.removeEventListener(previous.type, previous.handler, previous.capture);
    listeners.delete(name);
  }
  if (typeof nextHandler === 'function') {
    // 学习版本直接使用浏览器 Event，不实现 React 的 SyntheticEvent 与事件委托。
    dom.addEventListener(type, nextHandler, capture);
    listeners.set(name, { type, capture, handler: nextHandler });
  }
}

function updateAttribute(dom, name, value) {
  const isSVG = dom.namespaceURI === SVG_NAMESPACE;
  const attribute = attributeAliases[name] ?? (isSVG ? svgAttributeAliases[name] ?? name : name.toLowerCase());
  const isData = name.startsWith('data-') || name.startsWith('aria-');
  const isBoolean = booleanAttributes.has(name) || name === 'download' || name === 'capture';
  const shouldRemove = value == null || (!isData && !booleanishAttributes.has(name) && value === false)
    || typeof value === 'function' || typeof value === 'symbol';

  if (isSVG && name === 'xlinkHref') {
    if (shouldRemove) dom.removeAttributeNS(XLINK_NAMESPACE, 'href');
    else dom.setAttributeNS(XLINK_NAMESPACE, 'xlink:href', String(value));
  } else if (shouldRemove) {
    dom.removeAttribute(attribute);
  } else {
    dom.setAttribute(attribute, isBoolean && value === true ? '' : String(value));
  }
  // muted 的 attribute 不会同步媒体播放状态，要修改对应 DOM property。
  if (name === 'muted' && 'muted' in dom) dom.muted = Boolean(value);
}

function updateSelect(dom, value, isDefault) {
  if (dom.multiple) {
    const values = new Set((Array.isArray(value) ? value : [value]).map(String));
    for (const option of dom.options) {
      option.selected = values.has(option.value);
      if (isDefault) option.defaultSelected = option.selected;
    }
  } else {
    dom.value = String(value);
    if (isDefault) {
      for (const option of dom.options) option.defaultSelected = option.selected;
    }
  }
}

function updateFormProps(dom, previous, next, initial) {
  const tag = dom.localName;
  if (tag === 'select') {
    if (initial && next.defaultValue != null) pendingSelectDefaults.set(dom, next.defaultValue);
    // 初次 createDom 时还没有 option，renderer 在子节点插入后再调用 updateDom。
    if (next.value != null) {
      updateSelect(dom, next.value, false);
      pendingSelectDefaults.delete(dom);
    } else if (pendingSelectDefaults.has(dom) && dom.options.length > 0) {
      updateSelect(dom, pendingSelectDefaults.get(dom), true);
      pendingSelectDefaults.delete(dom);
    }
    return;
  }
  if (tag !== 'input' && tag !== 'textarea') {
    // option、progress 等宿主节点仍有普通的 value 属性。
    if (previous.value !== next.value) updateAttribute(dom, 'value', next.value);
    return;
  }
  if (initial && next.defaultValue != null) {
    dom.defaultValue = String(next.defaultValue);
    if (next.value == null) dom.value = String(next.defaultValue);
  }
  if (tag === 'input' && initial && next.defaultChecked != null) {
    dom.defaultChecked = Boolean(next.defaultChecked);
    if (next.checked == null) dom.checked = Boolean(next.defaultChecked);
  }
  // 受控字段每次提交都同步实际值，即使 props 未变化；相同值不重复写入以保留光标。
  if (next.value != null && dom.value !== String(next.value)) dom.value = String(next.value);
  if (tag === 'input' && next.checked != null) dom.checked = Boolean(next.checked);
}

/** 对比宿主属性；children 的协调与 ref 的提交由 renderer 负责。 */
export function updateDom(dom, previous = {}, next = {}) {
  if (dom.nodeType === 3) {
    if (previous.nodeValue !== next.nodeValue) dom.nodeValue = String(next.nodeValue ?? '');
    return;
  }
  const initial = !initializedNodes.has(dom);
  for (const name of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (/^on[A-Z]/.test(name)) {
      updateEvent(dom, name, next[name], next);
    } else if (!reservedProps.has(name) && previous[name] !== next[name]) {
      updateAttribute(dom, name, next[name]);
    }
  }
  updateStyle(dom, previous.style, next.style);
  const previousHTML = previous.dangerouslySetInnerHTML?.__html;
  const nextHTML = next.dangerouslySetInnerHTML?.__html;
  if (previousHTML !== nextHTML) dom.innerHTML = nextHTML ?? '';
  updateFormProps(dom, previous, next, initial);
  initializedNodes.add(dom);
}

/** callback ref 的返回 cleanup 交给 renderer 保存，卸载时优先执行。 */
export function setRef(ref, value) {
  if (typeof ref === 'function') {
    const cleanup = ref(value);
    return typeof cleanup === 'function' ? cleanup : undefined;
  }
  if (ref != null) ref.current = value;
  return undefined;
}
