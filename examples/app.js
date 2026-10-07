import React, {
  createElement as h, createContext, useContext, useState, useReducer,
  useRef, useMemo, useCallback, useEffect, useLayoutEffect, useImperativeHandle,
  useId, useSyncExternalStore, useTransition, useDeferredValue,
  memo, forwardRef, lazy, Suspense, Component,
} from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';

const ThemeContext = createContext('浅色');
const button = (label, onClick, props = {}) => h('button', { type: 'button', onClick, ...props }, label);
const panel = (title, explanation, ...children) => h('section', { className: 'panel' },
  h('h2', null, title), h('p', { className: 'description' }, explanation), ...children);

function Counter() {
  const [count, setCount] = useState(0);
  const [running, setRunning] = useState(false);
  const double = useMemo(() => count * 2, [count]);
  const increase = useCallback(() => setCount(value => value + 1), []);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(increase, 1000);
    return () => clearInterval(timer);
  }, [running, increase]);
  useEffect(() => {
    document.title = `mini-react · count ${count}`;
    return () => { document.title = 'mini-react · 原理实验室'; };
  }, [count]);
  return panel('01 / 状态与批量更新', '三个函数式更新按顺序计算，随后统一提交 DOM；定时器由 Effect 清理。',
    h('div', { className: 'metric' }, count, h('small', null, `double: ${double}`)),
    h('div', { className: 'actions' }, button('+1', increase), button('+3 · batch', () => {
      increase(); increase(); increase();
    }), button(running ? '停止定时器' : '启动定时器', () => setRunning(value => !value))));
}

function itemReducer(items, action) {
  if (action.type === 'reverse') return [...items].reverse();
  if (action.type === 'remove') return items.filter(item => item.id !== action.id);
  if (action.type === 'reset') return initialItems;
  return items;
}
const initialItems = [{ id: 'a', name: 'Element' }, { id: 'b', name: 'Fiber' }, { id: 'c', name: 'Commit' }];

function Item({ item, remove }) {
  const [note, setNote] = useState('');
  return h('li', null,
    h('span', { className: 'item-name' }, item.name),
    h('input', { value: note, onChange: event => setNote(event.target.value),
      placeholder: '写笔记，再反转列表', 'aria-label': `${item.name} 的笔记` }),
    button('删除', () => remove(item.id), { 'aria-label': `删除 ${item.name}` }));
}

function KeyedList() {
  const [items, dispatch] = useReducer(itemReducer, initialItems);
  return panel('02 / key 与组件身份', '按 key 移动已有 DOM，列表反转后每一项的局部状态跟随对应组件。',
    h('div', { className: 'actions' }, button('反转列表', () => dispatch({ type: 'reverse' })),
      button('重置列表', () => dispatch({ type: 'reset' }))),
    h('ul', { className: 'items' }, items.map(item => h(Item, { key: item.id, item,
      remove: id => dispatch({ type: 'remove', id }) }))));
}

const ThemeLabel = memo(function ThemeLabel() {
  const theme = useContext(ThemeContext);
  return h('p', null, `memo 组件读取到的 Context：${theme}`);
});

const FocusInput = forwardRef(function FocusInput(props, ref) {
  const input = useRef(null);
  const id = useId();
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);
  useLayoutEffect(() => {
    // 该阶段 DOM 与 refs 已提交，可以测量或进行同步 DOM 操作。
    input.current.dataset.mounted = 'true';
  }, []);
  return h('div', { className: 'field' }, h('label', { htmlFor: id }, '通过 imperative handle 聚焦'),
    h('input', { ...props, id, ref: input, placeholder: '点击下方按钮' }));
});

function RefsAndContext() {
  const [theme, setTheme] = useState('浅色');
  const input = useRef(null);
  return panel('03 / Context、memo 与 refs', 'Context 更新穿过 memo；ref 在 commit 阶段赋值，函数组件暴露自定义 handle。',
    h(ThemeContext, { value: theme }, h(ThemeLabel)),
    h(FocusInput, { ref: input }),
    h('div', { className: 'actions' }, button('切换 Context', () => setTheme(value => value === '浅色' ? '深色' : '浅色')),
      button('聚焦输入框', () => input.current.focus())));
}

let storeValue = 0;
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => storeValue;
function ExternalStore() {
  const value = useSyncExternalStore(subscribe, getSnapshot);
  return panel('04 / 外部 store', '提交后订阅外部数据源，并检查 render 与订阅之间的快照变化。',
    h('p', null, `store snapshot：${value}`), button('更新外部 store', () => {
      storeValue++; for (const listener of listeners) listener();
    }));
}

const words = ['Element', 'Fiber', 'Reconciliation', 'Hooks', 'Context', 'Effect', 'Commit', 'Scheduler'];
function DeferredSearch() {
  const [query, setQuery] = useState('');
  const [isPending, start] = useTransition();
  const [reversed, setReversed] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const matches = words.filter(word => word.toLowerCase().includes(deferredQuery.toLowerCase()));
  return panel('05 / 延后更新', '这里用任务队列演示 deferred / transition，不模拟 React 的完整优先级与 Lanes。',
    h('input', { value: query, onChange: event => setQuery(event.target.value),
      placeholder: '搜索概念', 'aria-label': '搜索 React 概念' }),
    h('p', { style: { opacity: query === deferredQuery ? 1 : 0.5 } },
      (reversed ? [...matches].reverse() : matches).join(' · ') || '没有匹配'),
    button(isPending ? '更新中…' : 'transition 反转结果', () => start(() => setReversed(value => !value)),
      { disabled: isPending }));
}

const LazyLesson = lazy(() => new Promise(resolve => {
  setTimeout(() => resolve(import('./lazy-lesson.js')), 700);
}));
function AsyncAndPortal() {
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(false);
  const openButton = useRef(null);
  const closeButton = useRef(null);
  useLayoutEffect(() => {
    if (!modal) return;
    // Portal 在 #root 外：只禁用背景容器，不会连弹窗一起变成 inert。
    const background = document.getElementById('root');
    const wasInert = background.inert;
    const previousOverflow = document.body.style.overflow;
    const opener = openButton.current;
    background.inert = true;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setModal(false);
      } else if (event.key === 'Tab') {
        // 此弹窗只有一个可聚焦控件，Tab / Shift+Tab 都回到关闭按钮。
        event.preventDefault();
        closeButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      background.inert = wasInert;
      document.body.style.overflow = previousOverflow;
      // layout cleanup 与关闭提交同步完成，避免焦点落到已删除按钮或 body。
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [modal]);
  return panel('06 / lazy、Suspense 与 Portal', 'lazy 抛出 Promise，Suspense 提交 fallback；Portal 将 DOM 放进另一个容器。',
    h('div', { className: 'actions' }, button('加载学习卡片', () => setLoaded(true), { disabled: loaded }),
      button('打开 Portal', () => setModal(true), { ref: openButton })),
    loaded ? h(Suspense, { fallback: h('p', { role: 'status' }, '正在加载模块…') }, h(LazyLesson)) : null,
    modal ? createPortal(h('div', { className: 'overlay', onClick: event => {
      if (event.target === event.currentTarget) setModal(false);
    } }, h('div', { className: 'dialog', role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'portal-title' },
      h('h2', { id: 'portal-title' }, '我在 #portal-root 中'),
      h('p', null, 'Fiber 仍属于原来的组件树，DOM 容器已经改变。'),
      button('关闭 · Esc', () => setModal(false), { ref: closeButton }))), document.getElementById('portal-root')) : null);
}

class ClassCounter extends Component {
  state = { count: 0 };
  render() {
    return panel('07 / 类组件更新队列', 'setState 合并部分 state，类生命周期在 commit 后运行。',
      h('p', null, `class state：${this.state.count}`),
      button('+1', () => this.setState(state => ({ count: state.count + 1 }))));
  }
}

function App() {
  const [showCounter, setShowCounter] = useState(true);
  return h('main', null,
    h('header', null, h('p', { className: 'eyebrow' }, `LEARN BY BUILDING / ${React.version}`),
      h('h1', null, 'mini-react', h('span', null, '原理实验室')),
      h('p', { className: 'intro' }, '从一棵 Element 树到真实 DOM。修改源码、设置断点，观察每次 render 与 commit。')),
    h('div', { className: 'toolbar' }, button(showCounter ? '卸载计数器 · 观察清理' : '重新挂载计数器',
      () => setShowCounter(value => !value))),
    h('div', { className: 'grid' }, showCounter ? h(Counter) : null, h(KeyedList), h(RefsAndContext),
      h(ExternalStore), h(DeferredSearch), h(AsyncAndPortal), h(ClassCounter)),
    h('footer', null, '源码阅读路线与 API 差异见 README.md 和 docs/architecture.md。'));
}

createRoot(document.getElementById('root')).render(h(App));
