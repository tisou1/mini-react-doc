# mini-react

用原生 JavaScript ESM 实现的 React 学习项目，展示从 Element 到 Fiber、状态队列、协调与 DOM 提交的完整路径。公共 API 尽量沿用 React 的名称、参数和常见用法；具体简化见下方兼容性表。

代码没有运行时依赖，没有把 React 当作实现基础。这里的 Fiber 和调度器用于解释机制，不承诺与 React 内部结构、并发语义或所有 DOM 行为完全一致。

## 运行

需要 Node.js 22 或更高版本。仓库使用 `pnpm@11.27.0`。mini-react 核心仍没有运行时依赖；VitePress 与 Vue 是文档开发依赖，首次运行先安装：

```sh
pnpm install
```

```sh
pnpm dev
```

`pnpm dev` 启动 VitePress 原理文档站，提供完整讲解、源码浏览、本地搜索和交互实验。默认端口 5173，被占用时依次尝试 5174、5175；设置 `PORT` 可改变起始端口，访问地址以终端输出为准。

也可以单独启动原生 ESM 示例：

```sh
pnpm dev:examples
# 无需文档依赖时也可直接运行 node scripts/dev-server.js
```

文档中的“交互实验”直接运行 [examples/index.html](examples/index.html)，无需第二个服务。请通过开发服务器访问，浏览器 ESM 不适合直接双击 HTML 文件启动。

完整的 Markdown 原理教材是 [docs/principles.md](docs/principles.md)，可在文件中阅读，也会展示为文档网页。简要架构与断点见 [docs/architecture.md](docs/architecture.md)。源码已增加中文职责、状态流转和关键设计理由注释。

重点学习 Fiber 时，阅读 [docs/fiber.md](docs/fiber.md)：双缓冲、beginWork/completeWork、render/commit、Lanes 与更新重放、Hooks 和 Suspense，均有真实 React 与本项目的对照。文档首页可以逐步推演候选树、让出主线程、追加更新重启和 commit。

文档静态构建与预览：

```sh
pnpm docs:build
pnpm docs:preview
```

最小检查命令：

```sh
pnpm check
# 或
node scripts/check.js
```

`check` 检查源码语法和公共入口导入，不代表完整测试、浏览器行为或 React 兼容性已验证。本轮不添加测试框架、E2E 或浏览器自动化验证。

## 使用方式

### 浏览器 ESM

示例通过 import map 把熟悉的 React 模块名映射到本仓库：

```html
<script type="importmap">
{
  "imports": {
    "react": "/src/react/index.js",
    "react-dom/client": "/src/react-dom/client.js",
    "react-dom": "/src/react-dom/index.js"
  }
}
</script>
```

接着在 `type="module"` 的脚本中使用：

```js
import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';

function Counter() {
  const [count, setCount] = useState(0);
  return h('button', {
    onClick: () => setCount(value => value + 1),
  }, `计数：${count}`);
}

const root = createRoot(document.getElementById('root'));
root.render(h(Counter));
// 需要释放根节点时：root.unmount();
```

### Node.js / 包入口

`package.json` 使用 `mini-react` 作为包名。在仓库内的 Node.js ESM 文件中，可以利用 package self-reference 导入：

```js
import { createElement, useState } from 'mini-react';
import { createRoot } from 'mini-react/react-dom/client';
import { createPortal, flushSync } from 'mini-react/react-dom';

console.log(createElement('p', { key: 'intro' }, 'Element 是描述对象'));
```

Node.js 可以导入 API、观察 Element 等纯 JavaScript 对象；`createRoot` 的实际渲染需要 DOM 环境。浏览器直接执行源码时使用上面的 import map。

### JSX

仓库提供 classic 和 automatic JSX runtime。经典转换可使用 `import React from 'mini-react'` 和 `React.createElement`。外部转换工具使用 automatic runtime 时，把 JSX import source 设为 `mini-react`。例如 TypeScript 的转换选项：

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "jsx": "react-jsx",
    "jsxImportSource": "mini-react"
  }
}
```

转换器会导入 `mini-react/jsx-runtime` 或 `mini-react/jsx-dev-runtime`；配置含义见 [TypeScript jsxImportSource 文档](https://www.typescriptlang.org/tsconfig/jsxImportSource.html)。本仓库没有内建 JSX 转译器；浏览器示例使用 `createElement`，可以直接运行。

## API 与兼容范围

<!-- #region api -->
以下 API 已提供，表中的限制是当前实现契约。

| API / 能力 | 当前行为与简化 |
| --- | --- |
| `createElement`、`cloneElement`、`isValidElement` | Element 为 `{ $$typeof, type, key, props }`；`key` 独立于 props，`ref` 放在 `props.ref`；单个 child 直接保存，多个形成数组。无开发期冻结与完整参数警告。 |
| `Children.map/forEach/count/toArray/only` | 遍历数组及 iterable、组合 key；Element 和 Fragment 是边界，不渲染组件也不继续读取其 children。实际 renderer 接受数组，不承诺任意 iterable 渲染。 |
| `Fragment`、文本、数组、空节点 | 文本使用 TEXT Fiber；空节点保留位置语义；嵌套数组作为 Fragment 保存层级。 |
| `jsx`、`jsxs`、`jsxDEV` | 提供 automatic runtime 入口；`jsxDEV` 不产生 source/self 等开发期诊断。 |
| `createRoot`、`root.render`、`root.unmount` | 客户端根节点、更新和卸载；默认以微任务批量调度，较大树可按 Fiber 让出主线程。可使用 `identifierPrefix` 和 `onUncaughtError`；没有完整 React root options 支持。 |
| `useState`、`useReducer` | 惰性初始化、稳定 dispatch、函数式更新、按顺序处理队列；成功 commit 才消费队列。没有 eager `Object.is` state bailout；相同状态仍可能发起 render。当前明确拒绝 render-phase state updates。 |
| `useRef`、`createRef` | 支持持久 ref 对象；host/class ref 在 commit 赋值，卸载时清理；支持 callback ref 返回 cleanup。修改 `current` 不触发更新。 |
| `useMemo`、`useCallback` | 对依赖数组逐项使用 `Object.is`；按 Hook 调用顺序保存结果。 |
| `useEffect`、`useLayoutEffect` | 依赖变化先清理旧 effect 再执行新 effect；卸载 cleanup 在 commit 同步执行。layout 在 DOM 提交后执行；passive 使用 `setTimeout`，下一轮 render 前会先 flush，不能保证精确 paint 时机。 |
| `useImperativeHandle`、`forwardRef` | handle 在 layout 阶段赋值并清理；`forwardRef` 将 ref 作为第二个参数传入。普通函数组件也能读取 React 19 风格的 `props.ref`。 |
| `createContext`、`useContext`、Provider、Consumer | 支持 `<Context value={...}>`、`Context.Provider` 和 render-prop Consumer；每棵候选 Fiber 树用 Map 传递值；memo 仍检查自身读过的 Context。 |
| `memo` | 默认浅比较或自定义 compare；组件自身状态、Context 和 ref 变化可触发执行。复用组件输出后仍协调子树，不实现完整 subtree bailout。 |
| `Component`、`PureComponent` | 支持 `setState`、`forceUpdate`、callback、`shouldComponentUpdate`、`contextType`、类 `defaultProps`、`getDerivedStateFromProps`、`getSnapshotBeforeUpdate`、`componentDidMount/DidUpdate/WillUnmount`。PureComponent 浅比较 props/state；未实现 legacy/UNSAFE lifecycles 与 ErrorBoundary。 |
| `useId` | 按根生成并保存稳定客户端 ID，支持 `identifierPrefix`；不提供 SSR/hydration 一致性。 |
| `useSyncExternalStore` | 读取 snapshot、订阅/取消订阅、commit 后检查变化；仅客户端行为，`getServerSnapshot` 参数保留但不执行。没有 React 的完整并发一致性机制。 |
| `useDebugValue` | 保留调用入口；没有 DevTools 协议，不执行 formatter。 |
| `createPortal` | DOM 挂到指定容器，Context 仍沿 Fiber 父链传递。事件使用 DOM 冒泡，不模拟 React Portal 的逻辑树事件冒泡。 |
| `flushSync` | 同步处理当前已排队根节点；不保证完整 React 的调度和 Effects flush 语义。 |
| `lazy`、`Suspense` | lazy 缓存加载 Promise，读取模块的 default export；挂起时渲染最近边界的 fallback，Promise 完成后重试。fallback 会卸载 primary，不保留已显示 primary 的状态；没有 `use(promise)` 或通用 Suspense 数据缓存。 |
| `startTransition`、`useTransition`、`useDeferredValue` | `startTransition` 立即执行 scope，只延后其中调度请求；`useTransition` 以 timer/Promise 模拟 pending；`useDeferredValue` 延后一轮任务更新。没有 Lanes，同一 root 的普通更新与 transition 重叠时不能区分优先级。异步 scope 的 await 后更新也不会自动保留 transition 标记。 |
| `StrictMode` | 当前作为透传容器；不模拟开发期 render/Effect/ref 双执行。 |
| DOM 属性与事件 | 支持常见属性、style、HTML/SVG、表单字段和 `dangerouslySetInnerHTML`；直接注册原生 Event，不实现 SyntheticEvent 或完整事件委托。复杂 DOM 兼容性仍需单独验证。 |
<!-- #endregion api -->

## 学习路线

1. 从 [src/react/element.js](src/react/element.js) 看 Element 数据结构，理解创建描述与渲染之间的区别。
2. 从 [src/react-dom/client.js](src/react-dom/client.js) 跟进 `createRoot`，再读 [scheduler.js](src/reconciler/scheduler.js) 的批量调度与时间预算。
3. 阅读 [fiber.js](src/reconciler/fiber.js) 的 child/sibling/parent 指针、type/key 身份和 `alternate`。
4. 阅读 [renderer.js](src/reconciler/renderer.js) 的 `performUnit` 与 `commitRoot`，观察候选树与已提交树如何隔离。
5. 阅读 [Hooks runtime](src/react/hooks/runtime.js)、[状态队列](src/react/hooks/state.js) 与 [Effects](src/react/hooks/effect.js)，跟踪一次按钮更新。
6. 再看 Context、memo、Portal、lazy/Suspense、transition 如何嵌入同一条渲染路径。

详细模块关系、更新流程和断点建议见 [docs/architecture.md](docs/architecture.md)。

## 暂缓项

<!-- #region limitations -->
SSR、`hydrateRoot` / hydration、Server Components、React Compiler、React 19 Actions（包括 `useActionState`、`useOptimistic`、`useFormStatus`）、`use(promise)`、ErrorBoundary、SyntheticEvent、完整 DevTools、StrictMode 开发期双执行、精确并发 Lanes、eager `Object.is` state bailout、完整测试套件与边缘兼容诊断均不在当前范围。
<!-- #endregion limitations -->

## 记录与提交

[GOAL.md](GOAL.md) 记录目标、验收范围和每个功能的完成情况；[AGENTS.md](AGENTS.md) 规定模块边界与协作方式。每完成一个逻辑功能，更新目标记录并使用 Git 共置的 jj 提交：

```sh
jj commit -m "feat: 功能描述" <本次功能路径...>
jj bookmark set main -r @-
```

`main` bookmark 让 Git 也能读取同一提交历史。不自行 push 或改写已完成的提交。

API 的参照来源：[React API reference](https://react.dev/reference/react)、[React DOM client](https://react.dev/reference/react-dom/client)、[React 19](https://react.dev/blog/2024/12/05/react-19)。本文描述的是本仓库当前实现，官方文档描述的是 React 本身。
