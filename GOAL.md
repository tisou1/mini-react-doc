# mini-react 项目目标

## 目标

在当前目录实现一个用于学习 React 原理的缩小版本，尽量沿用 React 的 API 和常见使用方式。
通过可阅读的模块展示 Element、Fiber、协调、Hooks、调度和 DOM 提交，并提供可运行示例。

## 本轮验收范围

- [x] 建立零运行时依赖的 ESM 项目与 Git 兼容的 jj 仓库。
- [x] 添加 AGENTS.md，规定模块边界、验证方式、记录与提交流程。
- [x] Element：createElement、cloneElement、isValidElement、Children、Fragment、JSX runtimes。
- [x] 组件模型：createRef、forwardRef、memo、createContext、Provider、Consumer、Component、PureComponent。
- [x] 渲染：createRoot、root.render、root.unmount，函数组件、文本、数组和 DOM 属性/事件。
- [x] 协调与调度：Fiber、type/key 复用、插入/移动/删除、批量状态更新、render/commit 分离。
- [x] 状态 Hooks：useState、useReducer、useRef。
- [x] 记忆 Hooks：useMemo、useCallback。
- [x] Effects：useEffect、useLayoutEffect、useImperativeHandle 与卸载清理。
- [x] 其他 Hooks：useContext、useId、useSyncExternalStore、useDebugValue。
- [x] 扩展：createPortal、flushSync、lazy、Suspense，以及简化的 transition/deferred 调度。
- [x] 文档：API 兼容性表、架构阅读路线、学习示例和启动说明。
- [x] 完成最小语法/入口与核心流程验证，所有功能记录并通过 jj 提交。

## 有意暂缓

完整测试套件、开发期边缘诊断、SyntheticEvent、精确 React 并发优先级/Lanes、SSR/hydration、
Server Components、React Compiler、生产级错误边界和 React 19 Actions 等高级能力。
StrictMode 可以作为透传容器使用，暂不模拟开发期双执行。
本轮不承诺与 React 内部实现、DOM 行为及所有 API 完全等价，具体差异将在 README 中逐项注明。

## 完成记录

### 01 · 项目与协作约定

- 完成：ESM package exports 与 dev/check 命令定义、.gitignore、.gitattributes、AGENTS.md、目标文件。
- 版本控制：使用 `jj git init --colocate .` 初始化共置仓库；所有后续逻辑功能通过 jj 提交并移动 main bookmark。
- 验证：目录原先为空；确认 Node 可用、jj 在沙箱外可运行，jj/Git 共置初始化成功。
- 说明：初次沙箱内的 pnpm 命令受环境 shim 与网络限制影响；后续已直接运行 pnpm 成功并固定版本，见记录 19。零依赖项目也提供等价 Node 命令。


### 02 · Element 与 children 工具

- 完成 API/功能：createElement、cloneElement、isValidElement、createRef、Fragment；Children.map / forEach / count / toArray / only。
- 原理：保留单个与多个 children 的原始形状，分离 key 与 props，ref 采用 props.ref；Children 组合 key 且保持 Element 边界。
- 验证：实际执行对应文件的 `node --check` 与 ESM import；核心 API smoke check 通过。DOM 行为暂以原理实现和后续内存 DOM smoke 验证为准，未运行浏览器检查。
- 提交：`feat: add elements fragments refs and Children APIs`（jj）。

### 03 · JSX runtimes

- 完成 API/功能：jsx、jsxs、jsxDEV，两个 runtime 入口的 Fragment。
- 原理：同时支持自动 JSX runtime 与开发 runtime，输出统一 Element；本仓库不内置 JSX 转译器。
- 验证：实际执行对应文件的 `node --check` 与 ESM import；核心 API smoke check 通过。DOM 行为暂以原理实现和后续内存 DOM smoke 验证为准，未运行浏览器检查。
- 提交：`feat: add automatic JSX runtimes`（jj）。

### 04 · 类组件基础

- 完成 API/功能：Component、PureComponent、setState、forceUpdate，Object.is 浅比较工具。
- 原理：组件通过 __updater 提交请求；部分 state 合并、回调与生命周期由 renderer 实现。
- 验证：实际执行对应文件的 `node --check` 与 ESM import；核心 API smoke check 通过。DOM 行为暂以原理实现和后续内存 DOM smoke 验证为准，未运行浏览器检查。
- 提交：`feat: add Component and PureComponent update APIs`（jj）。

### 05 · Context 对象

- 完成 API/功能：createContext、Context.Provider、Context.Consumer，React 19 风格的 Context 直接 Provider。
- 原理：默认值保存为 _defaultValue；每个 Fiber 持有自己的 Context Map，避免跨根污染。
- 验证：实际执行对应文件的 `node --check` 与 ESM import；核心 API smoke check 通过。DOM 行为暂以原理实现和后续内存 DOM smoke 验证为准，未运行浏览器检查。
- 提交：`feat: add Context provider and consumer types`（jj）。

### 06 · 组件包装器与 lazy 状态机

- 完成 API/功能：memo、forwardRef、lazy。
- 原理：memo 保存比较器，forwardRef 保存 render；lazy 缓存加载 Promise、模块和错误，readLazy 为 Suspense 提供挂起信号。
- 验证：实际执行对应文件的 `node --check` 与 ESM import；核心 API smoke check 通过。DOM 行为暂以原理实现和后续内存 DOM smoke 验证为准，未运行浏览器检查。
- 提交：`feat: add memo forwardRef and lazy wrappers`（jj）。

### 07 · DOM host

- 完成 API/功能：文本与属性增删、style、原生事件/Capture、受控表单、SVG、dangerouslySetInnerHTML、object/callback refs。
- 原理：新 DOM 在 render 中脱离文档创建；已挂载 DOM 仅在 commit 修改。支持 Portal 的 ownerDocument 与 namespace；callback ref cleanup 由 renderer 保存。
- 验证：实际执行对应文件的 `node --check` 与 ESM import；核心 API smoke check 通过。DOM 行为暂以原理实现和后续内存 DOM smoke 验证为准，未运行浏览器检查。
- 提交：`feat: implement DOM attributes events forms and refs`（jj）。

### 08 · 状态 Hooks 与 dispatcher

- 完成 API/功能：useState、useReducer；lazy initializer、functional updates、reducer init、稳定 dispatch。
- 原理：按调用顺序克隆 Hooks 快照，render 读取共享队列，commitHooks 才消费；卸载后的 dispatch 忽略，明确拒绝未实现的 render-phase state updates。
- 验证：实际通过 Hooks ESM import 和 `node scripts/check.js` 的语法/入口检查；相关 state、Effect、Context、ref 流程也通过一次性内存 DOM smoke，未建立测试套件。
- 提交：`feat: implement state and reducer hook queues`（jj）。

### 09 · 引用 Hook

- 完成 API/功能：useRef。
- 原理：跨 render 保持同一 ref 对象；修改 current 不会触发重新调度。
- 验证：实际通过 Hooks ESM import 和 `node scripts/check.js` 的语法/入口检查；相关 state、Effect、Context、ref 流程也通过一次性内存 DOM smoke，未建立测试套件。
- 提交：`feat: add useRef with stable object identity`（jj）。

### 10 · 记忆 Hooks

- 完成 API/功能：useMemo、useCallback。
- 原理：用 Object.is 比较依赖，缓存值或函数；没有 deps 时每轮重新计算。
- 验证：实际通过 Hooks ESM import 和 `node scripts/check.js` 的语法/入口检查；相关 state、Effect、Context、ref 流程也通过一次性内存 DOM smoke，未建立测试套件。
- 提交：`feat: add useMemo and useCallback dependency caching`（jj）。

### 11 · Effects 与 imperative handle

- 完成 API/功能：useEffect、useLayoutEffect、useImperativeHandle；runEffects、cleanupHooks。
- 原理：render 只登记 create/deps；layout 在 DOM/ref 提交后执行，passive 异步执行；依赖变化与卸载先清理旧 Effect；handle 包含 ref 的依赖。
- 验证：实际通过 Hooks ESM import 和 `node scripts/check.js` 的语法/入口检查；相关 state、Effect、Context、ref 流程也通过一次性内存 DOM smoke，未建立测试套件。
- 提交：`feat: add effect lifecycle and imperative handles`（jj）。

### 12 · Context Hook

- 完成 API/功能：useContext。
- 原理：读取最近 Fiber Context Map 或默认值，并登记读取依赖，使 Context 更新能穿过 memo。
- 验证：实际通过 Hooks ESM import 和 `node scripts/check.js` 的语法/入口检查；相关 state、Effect、Context、ref 流程也通过一次性内存 DOM smoke，未建立测试套件。
- 提交：`feat: add useContext and context dependency tracking`（jj）。

### 13 · ID 与调试接口

- 完成 API/功能：useId、useDebugValue。
- 原理：useId 在挂载后保持稳定、使用根 ID/counter/identifierPrefix 区分；无 SSR ID 算法。useDebugValue 为无 DevTools 的明确 no-op。
- 验证：实际通过 Hooks ESM import 和 `node scripts/check.js` 的语法/入口检查；相关 state、Effect、Context、ref 流程也通过一次性内存 DOM smoke，未建立测试套件。
- 提交：`feat: add useId and debug hook API`（jj）。

### 14 · 外部 store Hook

- 完成 API/功能：useSyncExternalStore。
- 原理：读取 snapshot，通过 layout Effects 建立/清理订阅，检查 render 到 commit 以及首次订阅期间的变化；getServerSnapshot 保留参数，当前不实现 SSR。
- 验证：实际 `pnpm check` 通过（29 个 JS 文件语法、5 个公共入口导入）。核心 renderer/Portal/Suspense 已通过一次性内存 DOM smoke；transition 的精确并发语义不属于验证或兼容承诺。
- 提交：`feat: add useSyncExternalStore subscription lifecycle`（jj）。

### 15 · Fiber 协调与客户端渲染

- 完成 API/功能：createRoot、root.render、root.unmount；函数/类组件、type/key 匹配、插入/移动/删除、自动 batching、分片 render、commit 和 Suspense。
- 原理：child/sibling/parent 支持可暂停遍历；alternate 连接上一棵树。5ms 时间预算让出主线程，更新版本变化时重算。commit 分离 snapshot、DOM mutation、状态发布、refs/layout 和 passive；lazy Promise 触发 fallback/retry。
- 验证：实际 `pnpm check` 通过（29 个 JS 文件语法、5 个公共入口导入）。核心 renderer/Portal/Suspense 已通过一次性内存 DOM smoke；transition 的精确并发语义不属于验证或兼容承诺。
- 提交：`feat: implement Fiber rendering reconciliation and commits`（jj）。

### 16 · 简化 transition 与 deferred Hooks

- 完成 API/功能：startTransition、useTransition、useDeferredValue。
- 原理：scope 同步执行，调度请求用 timer 延后；pending 通过任务计数和 Promise 模拟，deferred 取消旧 timer。明确不提供 Lanes 或同一根中严格的优先级隔离。
- 验证：实际 `pnpm check` 通过（29 个 JS 文件语法、5 个公共入口导入）。核心 renderer/Portal/Suspense 已通过一次性内存 DOM smoke；transition 的精确并发语义不属于验证或兼容承诺。
- 提交：`feat: add simplified transitions and deferred values`（jj）。

### 17 · Portal 与同步 DOM 入口

- 完成 API/功能：createPortal、flushSync。
- 原理：Portal 改变 host 容器但保留 Fiber/Context 父链，卸载保留外来节点；flushSync 同步处理调度器里已排队的根。事件仍沿真实 DOM 冒泡。
- 验证：实际 `pnpm check` 通过（29 个 JS 文件语法、5 个公共入口导入）。核心 renderer/Portal/Suspense 已通过一次性内存 DOM smoke；transition 的精确并发语义不属于验证或兼容承诺。
- 提交：`feat: expose portals and synchronous flushing`（jj）。

### 18 · 统一 React 公共入口

- 完成 API/功能：全部上述 React API 的 named/default exports、StrictMode 透传、Suspense、version。
- 原理：支持 classic React.createElement 与 named API 用法；package exports 提供 mini-react、两个 JSX runtime、react-dom 与 react-dom/client 五个入口。StrictMode 不执行开发期双调用。
- 验证：实际 `pnpm check` 通过（29 个 JS 文件语法、5 个公共入口导入）。核心 renderer/Portal/Suspense 已通过一次性内存 DOM smoke；transition 的精确并发语义不属于验证或兼容承诺。
- 提交：`feat: expose React-compatible public entry points`（jj）。

### 19 · 零依赖运行工具与 pnpm 锁文件

- 完成 API/功能：dev server、check 命令、固定 pnpm@11.27.0、pnpm-lock.yaml。
- 原理：开发服务器直接提供 ESM/HTML/CSS，默认 127.0.0.1:5173，可用 PORT 调整；无需构建。check 仅检查语法和入口。pnpm 网络与缓存访问在沙箱内受限，已在沙箱外直接运行成功，未安装项目运行时依赖。
- 验证：实际通过 pnpm install --lockfile-only --offline、pnpm check；本机 HTTP smoke 确认首页与源码返回正确状态/MIME，服务随后关闭。
- 提交：`chore: add zero-dependency development and validation tools`（jj）。

### 20 · 可交互学习示例

- 完成 API/功能：计数与 batching、定时器卸载清理、key 重排、reducer、Context/memo、refs/imperative handle、external store、deferred/transition、lazy/Suspense、Portal、类组件。
- 原理：通过 import map 沿用 react / react-dom 模块名，源码使用 createElement，无需 JSX 转译；每张卡片说明对应原理。
- 验证：示例 JS 已通过语法检查，HTTP 检查确认入口/脚本可加载；未执行浏览器行为或视觉检查。核心算法另有内存 DOM smoke。
- 提交：`feat: add interactive React principles learning examples`（jj）。

### 21 · API 兼容说明与源码阅读路线

- 完成 API/功能：README.md、docs/architecture.md；启动、导入、JSX 配置、API 对照、模块地图与调试断点。
- 原理：逐项注明无 SyntheticEvent、SSR/hydration、ErrorBoundary、StrictMode 双执行、eager state bailout 和完整 Lanes；解释 Suspense primary 卸载与简化 pending/deferred。
- 验证：已核对 39 个本地文档链接存在、代码围栏配对、包管理器版本及当前源码行为。
- 提交：`docs: explain architecture API compatibility and learning path`（jj）。
### 22 · 本轮验收完成（2026-10-06）

- 本轮目标：上述验收范围全部完成，暂缓项维持明确记录；源码不依赖 React 或其他运行时包。
- 最小检查：`node scripts/check.js` 与 `pnpm check` 实际通过，覆盖 29 个 JavaScript 文件语法和 5 个公共入口导入。
- 核心流程：一次性内存 DOM smoke 共 13 组场景通过，覆盖根渲染/卸载、functional batching、Effect/layout 清理、key 重排与组件身份、Context/memo、imperative refs、类生命周期/snapshot、lazy/Suspense、Portal、external store、稳定 ID、transition 和 deferred。
- 运行工具：开发服务器实际启动成功，本机 HTTP 检查确认 HTML 和 ESM 资源可加载，检查后关闭服务。
- 文档：39 个本地链接存在，代码围栏与 package manager 版本一致；README 对每个简化 API 说明限制。
- 版本控制：所有逻辑功能提交均使用 jj，每个提交包含 GOAL.md；main bookmark 与 Git 共用历史，未 push 或重写已完成提交。
- 验证边界：没有建立测试套件、执行全量构建、E2E、浏览器行为或视觉验证；内存 DOM 不能覆盖真实浏览器的全部表单与事件差异。
- 提交：`docs: record completed mini-react goal and verification`（jj）。
