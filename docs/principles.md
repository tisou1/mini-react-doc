# mini-react 技术原理：从描述对象到一次按钮更新

本文以当前仓库的实现为依据，讲清 Element、Fiber、协调、调度、Hooks 与 commit 如何连成一条路径。 它可以直接作为 Markdown 阅读，也可以在文档站中逐节阅读；示例不依赖网页组件或在线代码导入。 先读懂一次计数更新，再加入 Context、Portal 与 Suspense，会比逐个背 API 更容易理解。

文中的“本项目”指 mini-react；涉及 React 本身的行为时会明确标注，并提供官方资料。 这里采用了与 React 相近的职责划分，但对象字段、调度策略与边界处理都是教学实现，不能据此推断 React 内部源码。 需要简短导航时，先看[架构阅读路线](./architecture)；需要对照代码时，打开[源码讲解](./source#renderer)。

重点学习现代 React Fiber 时，配合阅读 [Fiber 架构专题](./fiber)：从双缓冲与工作循环深入到 Lanes、更新队列重放和 Suspense，并逐项对照本项目的简化。

## 1. 先建立完整地图

### 1.1 四个层次分别保存什么

| 层次 | 保存的内容 | 何时产生 | 是否已经影响屏幕 |
| --- | --- | --- | --- |
| Element | `type`、`key`、`props` 等 UI 描述 | `createElement` 或 JSX runtime 调用时 | 没有 |
| Fiber | 当前位置、旧节点关联、候选状态、DOM 引用与遍历指针 | 协调和 render 时 | 候选结果尚未发布 |
| render | 组件输出、下一份状态、子节点匹配结果 | 调度器执行工作单元时 | 已挂载 DOM 尚未修改 |
| commit | 删除、属性更新、节点移动、状态发布、refs 与 Effects | 候选树完成后 | DOM 与已提交状态发生变化 |

```text
createElement / jsx / jsxs
            |
            v
         Element
            |
 root.render / dispatch / class setState
            |
            v
 更新队列 -> root.schedule -> scheduler
                              |
                              v
                  候选 Fiber 树 / render
                              |
                 成功完成整棵树才继续
                              v
                           commit
                              |
                DOM、状态、refs、layout
                              |
                     延后执行 passive
```

render 可以暂停或丢弃，commit 则同步发布完整结果。浏览器随后如何 paint，是另一个层面的工作。 本项目能保证框架自身不在 render 中修改已经挂载的 DOM；它无法替用户撤销组件中自行执行的副作用。 React 的阶段概念可进一步阅读[Render and Commit](https://react.dev/learn/render-and-commit)。

### 1.2 按 API 找源码

| API / 机制 | 主要源码路径 | 对照时关注什么 |
| --- | --- | --- |
| `createElement`、`cloneElement`、`isValidElement`、`Children`、`createRef`、`Fragment` | `src/react/element.js` | 描述对象、保留字段、children 与 key |
| `jsx`、`jsxs`、`jsxDEV` | `src/react/jsx-runtime.js`、`src/react/jsx-dev-runtime.js` | 转换后如何统一进入 Element 创建 |
| `Component`、`PureComponent`、`setState`、`forceUpdate` | `src/react/component.js`、`src/reconciler/renderer.js` | 更新请求与候选状态分开 |
| `createContext`、Provider、Consumer | `src/react/context.js`、`src/reconciler/renderer.js` | 分支上的 Context Map |
| `memo`、`forwardRef`、`lazy` | `src/react/wrappers.js`、`src/reconciler/renderer.js` | 包装对象与 render 分派 |
| `createRoot`、`root.render`、`root.unmount`、`Suspense`、`StrictMode` | `src/reconciler/renderer.js` | 根状态、工作循环、提交与卸载 |
| Fiber、type/key 协调 | `src/reconciler/fiber.js` | `alternate` 与 child/sibling/parent |
| batching、分片、`flushSync` | `src/reconciler/scheduler.js` | 根 Set、微任务、共享工作预算 |
| Hook 调用与队列提交 | `src/react/hooks/runtime.js` | 当前 Fiber、slot、`processedCount` |
| `useState`、`useReducer` | `src/react/hooks/state.js` | 共享队列与候选 state |
| `useRef`、`useMemo`、`useCallback` | `src/react/hooks/ref.js`、`src/react/hooks/memo.js` | 对象身份与依赖比较 |
| `useEffect`、`useLayoutEffect`、`useImperativeHandle` | `src/react/hooks/effect.js` | 记录、执行、cleanup |
| `useContext`、`useId`、`useDebugValue` | `src/react/hooks/context.js`、`src/react/hooks/id.js` | Context 依赖与客户端 ID |
| `useSyncExternalStore` | `src/react/hooks/external-store.js` | snapshot、订阅与补查 |
| `startTransition`、`useTransition`、`useDeferredValue` | `src/react/hooks/transition.js`、`src/reconciler/scheduler.js` | 延后的调度与 timer 模拟 |
| `createPortal`、DOM 属性、事件与 refs | `src/react-dom/index.js`、`src/react-dom/host.js` | 宿主容器、属性差异与原生事件 |

`src/react/index.js` 汇总公共 API；`src/react-dom/client.js` 转出 `createRoot`。 `src/shared/symbols.js` 定义类型标记，`src/shared/shallow-equal.js` 提供浅比较。 先找机制的实现文件，再看公共入口，可以避免把一次 re-export 误认成实现。

## 2. Element：UI 先成为数据

### 2.1 createElement 不执行组件

下面的代码只创建描述对象，不会调用 `Greeting`，也不会插入 DOM：

```js
import { createElement as h } from 'mini-react';

function Greeting({ name }) {
  return h('p', null, `你好，${name}`);
}

const element = h(Greeting, { key: 'hello', name: '小明' });
console.log(element.type === Greeting); // true
console.log(element.key);              // 'hello'
console.log(element.props.name);       // '小明'
```

当前 Element 的形状是 `{ $$typeof, type, key, props }`。 `$$typeof` 使用 `Symbol.for('mini-react.element')`，让 renderer 区分普通对象与 Element。 `type` 可以是标签字符串、函数、类或包装对象；`key` 转成字符串并从 props 中取出。 `ref` 保留在 `props.ref`，这是本项目采用的 React 19 风格接口。

children 的保存规则也很直接：零个额外 child 不覆盖配置中的 children；一个直接保存；多个形成数组。 类组件的 `static defaultProps` 会补齐值为 `undefined` 的 props；函数组件使用参数默认值。 `cloneElement` 浅合并 props 并返回新对象；它不会复制 DOM，也不会复制组件的 state。

### 2.2 JSX 最终仍然创建 Element

经典 JSX 转换调用 `createElement`，automatic runtime 则把 children 放进 props，并单独传递 key。 本项目的 `jsx` 最终调用同一个 `createElement`；`jsxs` 是 `jsx` 的别名。 下面是转换后可执行的 JavaScript，而不是需要浏览器自行解析的 JSX：

```js
import { jsx, jsxs } from 'mini-react/jsx-runtime';

const title = jsx('h1', { children: '学习 Fiber' });
const section = jsxs('section', {
  children: [title, jsx('p', { children: '先描述，再提交' })],
}, 'intro');
```

`jsxDEV` 保留调用签名，但忽略 source/self 等开发期信息；仓库本身不做 JSX 转译。 公共创建接口的真实 React 契约见[createElement](https://react.dev/reference/react/createElement)。

### 2.3 Children 遍历与 renderer 展开是两件事

`Children` 可以遍历嵌套数组及 iterable，并为映射结果组合 key。 它停在 Element 边界：不会调用函数组件，也不会继续展开 Fragment 的 `props.children`。 renderer 的 `childElements` 则接受 Element、Portal、文本、数组与空值，不支持任意 iterable。

```js
import { Children, Fragment, createElement as h } from 'mini-react';

const group = h(Fragment, null, h('b', null, 'A'), h('b', null, 'B'));
console.log(Children.count(group));         // 1，Fragment 本身是一个 Element
console.log(Children.count([null, group])); // 2，数组中的空位置也计数
console.log(Children.toArray([null, group]).length); // 1，结果过滤空值
```

## 3. Fiber：把树变成可暂停的工作单元

### 3.1 一个 Element 对应一个候选 Fiber

Element 描述“希望显示什么”；Fiber 还保存“处于哪一个位置、能复用哪份已提交数据”。 `createFiber` 在协调时创建候选对象，再由 renderer 逐步补充组件或宿主信息。

| 字段 | 当前实现中的含义 |
| --- | --- |
| `type`、`key`、`props` | 当前 Element 的类型、身份与输入 |
| `parent`、`child`、`sibling` | 父节点、首个子节点、下一个兄弟 |
| `alternate` | 本次匹配到的旧 Fiber；没有匹配时为 `null` |
| `index` | 原 children 集合中的位置，空位置也参与索引 |
| `path` | 由父路径与编码后的 key/index 组成，供 Suspense 定位边界 |
| `root` | 所属根，状态更新最终请求这个根调度 |
| `dom` | 复用的旧 DOM，或 render 新建的脱离文档 DOM |
| `context` | 此分支可见的 Context Map |
| `hooks`、`contextDependencies` | 候选 Hook 快照与实际读取过的 Context |
| `output`、`instance`、`classState` | 组件输出、类实例与候选类状态等附加信息 |

本项目没有 React 内部的完整 `tag`、flags、Lanes 与 update queue 结构。 不要把这张字段表当作 React Fiber 的精确结构图；它只解释当前文件中的教学模型。

### 3.2 child/sibling/parent 替代持续递归

```text
Root
  |
 child
  v
 App
  |
 child
  v
 section
  |
 child
  v
 h1 ----- sibling -----> button
  |                       |
 child                   child
  v                       v
 TEXT                    TEXT
```

`nextFiber` 优先进入 child；没有 child 时找 sibling；仍没有就沿 parent 向上找兄弟。 因此 render 可以保存 `nextUnit`，在后续任务中继续，而不必保留一整套递归调用栈。 `visitTree` 是 commit 等阶段使用的树遍历工具，支持先父后子或先子后父；它本身不会分片。

### 3.3 文本、空值与嵌套数组

字符串、数字和 bigint 转成 TEXT Element，最终对应 Text DOM；`null`、`undefined` 和 boolean 不创建 Fiber。 空值仍占原集合的位置，例如 `[null, h(Counter)]` 中 Counter 的无 key 索引为 1。 嵌套数组被包装为 Fragment，保留层级；随意展平会改变以父节点和位置决定的身份。

### 3.4 从教学 Fiber 走向真实 React

本项目用显式树指针、候选快照和同步 commit 展示 Fiber 的核心分工。继续读真实 React 源码时，还需要理解以下机制：

| 学习问题 | 真实 React 中继续关注的机制 | 专题 |
| --- | --- | --- |
| 每次 render 都创建完整的新树吗？ | `createWorkInProgress`、`current/alternate` 的对象复用 | [双缓冲](./fiber#double-buffer) |
| 子节点返回后还要做什么？ | render 内的 `beginWork`、`completeWork` 与标记汇总 | [工作循环](./fiber#work-loop) |
| 为何紧急更新能先显示，后续状态仍按原顺序计算？ | `lanes/childLanes`、`baseState/baseQueue` 与更新重放 | [Lanes 与 rebase](./fiber#lanes) |
| 哪些知识能直接对照本仓库？ | 每个机制的真实实现与教学简化 | [差异表](./fiber#comparison) |

## 4. 协调：先判断身份，再决定复用

### 4.1 type 与 key 都要匹配

`reconcileChildren` 先把旧的直接子 Fiber 放入 Map：有 key 用 key，没有则用原 index。 处理新 child 时，先找到同身份旧节点，再比较 `type`；Portal 还要求容器相同。 匹配成功就把旧 Fiber 作为 `alternate`，复用其 DOM、Hook queue 或类实例。 剩余旧节点加入 `root.deletions`；此时只记录删除计划，不立刻删除 DOM。

| 旧节点 -> 新节点 | 结果 |
| --- | --- |
| `h(Counter, { key: 'a' })` -> 同 type、同 key | 复用组件身份与已提交状态 |
| `h(Counter, { key: 'a' })` -> key 改为 `'b'` | 旧实例卸载，新实例挂载 |
| `h('div', { key: 'a' })` -> `h('section', { key: 'a' })` | type 不同，重新创建 |
| 无 key Counter 从 index 0 移到 index 1 | 按新位置匹配，状态可能跟随位置 |
| 相同 Portal key，但 container 改变 | 重新挂载到新容器 |

key 在同一父 Fiber 的孩子之间起作用，不能跨任意父节点寻找旧组件。 同级 key 应唯一而稳定；随机 key 会每轮变成新身份，本项目也没有完整重复 key 诊断。 React 的状态位置概念见[Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state)。

### 4.2 手算一次带 key 的重排

假设旧列表为 `[A, B, C]`，新列表为 `[C, A, B]`，三个 Item 分别使用稳定 key。 协调之后，每个新 Fiber 都对应自己的旧 Fiber，组件 state 与 DOM 引用保留。 真正移动发生在 commit 的 `synchronizeChildren`：

```text
旧 DOM： A -> B -> C
目标：   C -> A -> B

cursor = A
处理 C：C !== cursor，insertBefore(C, A)
DOM：    C -> A -> B；cursor 仍为 A
处理 A：A === cursor，cursor 移到 B
处理 B：B === cursor，cursor 移到 null
```

浏览器的 `insertBefore` 会移动已有节点，不会自动复制它。这里没有把三个 DOM 全部重建。 本项目遍历目标顺序来同步孩子，便于理解；它没有计算 React 的 placement flags 或最少移动次数。 若 Item 返回 Fragment 中的两个顶层 DOM，`hostChildren` 会一起收集两者，确保整个组件输出移动。

### 4.3 为什么数组 index 作为 key 容易错

旧列表 `[A, B]` 没有业务 key，A 的组件 slot 在 index 0，B 在 index 1。 头部插入 X 后得到 `[X, A, B]`：index 0 的旧 state 被新 X 复用，index 1 的旧 state 被新 A 复用。 即使文字都更新正确，输入框草稿或组件内部计数仍可能对应错行。 适合重排的身份是数据本身的 ID，例如 `h(Item, { key: item.id, item })`。

## 5. Root 与 scheduler：更新请求如何合并

### 5.1 根保存已提交树与候选树

`createRoot` 校验容器，并用 WeakMap 防止同一容器重复创建根。 根的 `element` 是最近请求的输入，`current` 是已提交树，`work` 是正在计算的候选树。 `nextUnit` 保存下一个 Fiber，`deletions` 保存本次候选删除计划，`version` 记录更新请求版本。 `root.render` 记录新 Element、清空挂起标记并调用 schedule；状态 dispatch 则先写自己的队列再 schedule。

### 5.2 微任务 batching 与约 5ms 工作预算

普通更新把根放入 scheduler 的 Set，然后安排一次 `queueMicrotask`。 同一个事件处理函数连续 dispatch 三次，会留下三个 action，但 Set 中通常仍只有同一个根。 事件函数结束后，微任务开始计算；因此 batching 合并的是调度机会，三个 action 都会按顺序处理。

`flushWork(false)` 为这一轮所有根共享 `performance.now() + 5` 的 deadline。 renderer 完成一个 `performUnit` 后检查 deadline；未完成的根重新加入 Set，再用 `setTimeout` 续做。 这是协作式让出：单个慢组件函数无法被中途抢占，commit 也不会按 5ms 分片。 所以约 5ms 是检查预算，不是每个任务绝不超过 5ms 的性能保证。

### 5.3 version 防止提交过期计算

每次 `root.schedule` 都增加 version，`beginWork` 保存 `workVersion` 并从 current 建新候选根。 若大树暂停期间又出现更新，恢复时发现两个版本不同，就重新从已提交树计算。 循环中也会检查版本；旧的候选 state 与删除计划被放弃，尚未消费的状态队列仍然保留。

```text
current：count = 0
version = 1：队列 [n => n + 1]，开始 workVersion = 1
render 暂停：候选 count = 1，current 仍为 0
version = 2：再入队 n => n + 1
恢复：从 current 重算队列两项 -> 候选 count = 2
commit：current = 2，消费两项队列
```

候选计算中的 initializer、reducer 与组件函数可能再次执行，所以它们应保持纯净。 `beginWork` 会先 flush 上一次尚未执行的 passive Effects，再记录版本并建立新候选树。 这保证上一轮 Effects 不会被后一轮 render 直接略过，但不提供事务级副作用回滚。

### 5.4 flushSync 与卸载

`flushSync(callback)` 执行 callback 后用无限预算处理 scheduler 中当前已排队的根。 它不包含 React 的完整 Effects flush 语义，也不会把尚未触发的 transition timer 变成已排队工作。 `root.unmount` 先 flush pending passive，标记根卸载、取消调度、丢弃候选树，再同步卸载 current。 根卸载后不能再 `root.render`；卸载组件的 dispatch 会被关闭，不能复活旧组件。

## 6. render：计算可被放弃的下一版

### 6.1 performUnit 按 type 分派

| Fiber 类型 | 当前工作单元的行为 |
| --- | --- |
| ROOT、Fragment、StrictMode | 直接读取 `props.children` |
| Suspense | 按 suspensions Map 选择 primary 或 fallback |
| Portal | 设置独立容器，再处理 children |
| HTML/SVG 标签、TEXT | 必要时创建脱离文档 DOM，再协调 children |
| Provider | 复制 Context Map，写入此 Provider 的 value |
| Consumer | 读取值并调用 children render prop |
| 函数、类、memo、forwardRef、lazy | 经 `renderComponent` 得到组件输出 |

各种分支最后都调用 `reconcileChildren`，再由 `nextFiber` 选择下一个工作单元。 宿主节点已存在时，此阶段只复用引用；属性差异在 commit 才作用于旧 DOM。 新节点的 `createDom` 可以初始化属性和事件，但尚未连接到文档。

### 6.2 候选隔离有明确边界

函数组件的 Hook 对象被浅克隆，候选 `state` 不直接覆盖旧 Hook 的 state。 类组件 render 时临时替换 instance 的 props/state/context，再在 `finally` 中还原。 不过 ref 对象、state 中的嵌套对象和外部变量仍可共享，框架不会深复制所有 JavaScript 对象。 直接修改旧 state 对象或在 render 写 `ref.current`，仍可能让被丢弃的计算泄漏到外部。

普通 render 错误使调度器丢弃候选工作并报告给 `onUncaughtError` 或 `console.error`。 这个路径没有组件级 ErrorBoundary；commit 阶段已经执行的 DOM 操作也不具备自动回滚能力。

## 7. commit：按顺序发布完整结果

主要实现见[renderer 源码](./source#renderer)中的 `commitRoot`。 首次提交先清空 root container 中的已有孩子；之后通过旧树匹配来更新，不每轮清空整棵 DOM。

| 次序 | 源码动作 | 此时能观察到什么 |
| --- | --- | --- |
| 1 · Before mutation | 断开更换的 ref，调用类 snapshot | snapshot 仍可读取旧 DOM |
| 2 · 删除 | 遍历 deletions，清理类生命周期、Hooks、refs、DOM | 被替换组件结束生命周期 |
| 3 · 更新与移动 | 更新复用 DOM 属性，再按后序同步 children | 文本、属性、插入顺序成为新结果 |
| 4 · 发布 | 修正 select，消费 Hook/class 队列，发布类状态与 current | 已提交数据变成候选结果 |
| 5 · Refs 与 layout | 赋 host/class ref，再先子后父执行 layout 与类回调 | DOM 已连接，ref 可读 |
| 6 · Passive | 记录 finished tree，安排 timer | passive 稍后执行或下次 render 前 flush |

### 7.1 snapshot、删除和属性更新

`getSnapshotBeforeUpdate(previousProps, previousState)` 运行时，类实例暂时呈现候选 props/state，DOM 仍是旧版。 返回值保存在 Fiber，稍后作为 `componentDidUpdate` 的第三个参数。 删除分支调用 `componentWillUnmount`，关闭状态队列，执行所有 Hook cleanup，清除 ref 并移除节点。 本项目卸载时会同步执行 passive cleanup，不应据此推断 React 所有卸载时机。

`host.js` 负责文本、attribute、style、表单字段与事件差异。 旧事件 listener 会被移除，再添加新 handler；传入的是浏览器原生 Event。 受控 input 的 value 每次提交都会校对实际 DOM 值；select 在 option 插入后还会再次应用值。 children 与 ref 不由普通属性更新处理；`dangerouslySetInnerHTML` 也不能与 children 同时指定。

### 7.2 DOM 顺序、队列与 refs

`hostChildren` 只收集当前容器内的顶层宿主节点，遇到 host 节点就停止下探。 Portal 后代属于另一容器，不混入父容器的节点顺序。 `synchronizeChildren` 按后序执行，因此先连接内部孩子，再把上层节点放入最终位置。 随后 `commitHooks` 移除本轮已经处理的 action，并把 queue 标记为 mounted。

发布 `root.current = finished` 后才赋新 refs；所有 refs 先就位，之后才执行 layout Effects。 对象 ref 写入 `current`，callback ref 的返回 cleanup 被保存；断开时优先调用该 cleanup，否则传 `null`。 commit 末尾清除候选树的 alternate，避免保留整条历史；下一轮候选树再把当前树作为旧树关联。

## 8. Hooks：调用位置、快照与状态队列

### 8.1 Hook slot 属于 Fiber，不属于函数变量名

`renderWithHooks` 设置当前 Fiber，把 `hookIndex` 归零，再执行函数组件。 `nextHook(kind)` 按索引取上一轮 Hook，核对 kind，浅克隆后写入候选 `fiber.hooks`。 组件结束时还会核对数量；因此条件分支中增减 state/effect 等 Hook 会破坏对应关系。

```js
function Editor() {
  const [text, setText] = useState(''); // slot 0：state
  const input = useRef(null);          // slot 1：ref
  useEffect(() => saveDraft(text), [text]); // slot 2：passive
  return h('input', { ref: input, value: text,
    onChange: event => setText(event.target.value) });
}
```

变量改名不会影响 slot，调用顺序才影响。 自定义 Hook 在这里就是普通函数，内部调用多个基础 Hook 就占多个 slot。 当前 `useContext` 与 `useDebugValue` 只访问 current Fiber，不调用 `nextHook`；不要把每个公开 Hook 都画成一个数组项。 这也不是允许条件调用的契约：组件仍应遵循[React Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)。

### 8.2 Hook 快照与 queue 为什么分开

state Hook 保存 `state`、`queue` 与 `processedCount`。 queue 保存 `pending`、稳定的 `dispatch`、所属 root 与 mounted 标记；它跨候选 render 共享。 dispatch 只把 action 放入 pending 并请求调度；render 从旧 state 开始，按次序处理当时队列长度。

```text
已提交 Hook：state = 0 ----+
                          +---- 同一个 queue：pending = [add1, add1]
候选 Hook：state = 2 ------+
           processedCount = 2

render：读取 action，不 splice
commit：pending.splice(0, processedCount)，发布候选 Hook
丢弃：候选 state 不发布，pending 仍可在下次重算
```

初次挂载的 queue 在 commit 前为未挂载；组件卸载时会关闭并清空 queue。 本项目对正在 render 的组件自身 queue 的 dispatch 明确抛出 render-phase update 错误。 它没有完整跨组件 render 更新诊断，也没有相同 state 的 eager `Object.is` bailout。 即使 `setCount(count)` 值相同，当前实现仍可能调度和执行组件。

### 8.3 三次 setCount(count + 1) 为什么只加一

假设当前已提交 `count = 0`，点击 handler 来自这一轮 render：

```js
function addWithSnapshot() {
  setCount(count + 1);
  setCount(count + 1);
  setCount(count + 1);
  console.log(count); // 当前闭包里的 count 仍然为 0
}
```

三行表达式都先求值成 `1`，入队的是 `[1, 1, 1]`。 `useState` 的 reducer 对非函数 action 使用替换语义，因此手算为：

| 队列项 | 输入 state | 输出 state |
| --- | --- | --- |
| 替换为 1 | 0 | 1 |
| 替换为 1 | 1 | 1 |
| 替换为 1 | 1 | 1 |

batching 不会改写 handler 中的局部变量，也不会把三个替换 action 自动解释成三次加法。 若连续三个 action 都是 `setCount(value => value + 1)`，它们依次得到前一项的结果：

```text
pending = [add1, add1, add1]
0 -> add1(0) = 1 -> add1(1) = 2 -> add1(2) = 3
```

也可手算混合队列 `[2, value => value + 3, value => value * 2]`：从 0 得到 2、5、10。 这是更新函数与 render 快照的区别；React 的同类概念见[Queueing a Series of State Updates](https://react.dev/learn/queueing-a-series-of-state-updates)。

### 8.4 useReducer 与惰性初始化

`useReducer` 与 `useState` 使用同一个队列处理骨架，区别是由调用者提供 reducer。 `useState(() => initial)` 在新挂载计算时调用 initializer；`useReducer(reducer, arg, init)` 用 init 计算初值。 候选初次挂载若被丢弃，重试可能再次初始化，因此初始化函数也不能承担不可重复的副作用。 state Hook 的对象 action 会替换整个值；类 `setState` 的 partial object 则在 renderer 中浅合并。

## 9. Ref、Memo 与 Effects：身份和资源各自管理

### 9.1 useRef 保存同一个可变对象

`useRef` 初次创建 `{ current: initialValue }`，后续候选 Hook 仍复用这个对象。 它适合存 DOM、timer ID 或不参与 UI 的数据；改 current 不会 schedule。 UI 需要随值变化时应使用 state；每轮函数组件执行都调用 `createRef()` 则会得到新的对象。 ref 的共享也意味着 render 写入它无法靠丢弃候选树撤销，DOM ref 由 commit 赋值更安全。

### 9.2 useMemo 缓存值，useCallback 缓存函数身份

依赖比较要求数组长度相同，并逐项使用 `Object.is`；没有 deps 时视为变化。 `useMemo` 在 render 中运行 create 并保存结果，`useCallback` 相当于保存传入 callback 本身。 新建的对象与函数即使内容相同，也通常具有不同引用，可能打破 memo 或 Effect 的依赖比较。

```js
const visible = useMemo(() => items.filter(item => item.done === done), [items, done]);
const increment = useCallback(() => setCount(value => value + 1), []);
```

第二行能使用空 deps，因为只使用稳定 dispatch 与函数式更新，不读取当前 count。 若改成 `() => setCount(count + 1)` 却仍使用空 deps，缓存的闭包就会一直读取首次 count。 缓存依赖不替你分析闭包；create 应纯净，缓存也不能代替 state 的业务语义。 React 的定位见[useMemo](https://react.dev/reference/react/useMemo)。

### 9.3 Effect 的 create 在 render 记录，在提交阶段或提交后执行

`useEffectImpl` 保存 create/deps/changed，render 不调用 create。 首次或 deps 变化时，`runEffects` 先运行旧 cleanup，再运行新 create，并保存其返回函数。 deps 省略表示每轮，空数组表示挂载后不因普通更新重跑；重新挂载仍会再次执行。

```js
useEffect(() => {
  const timer = setInterval(() => setCount(value => value + 1), delay);
  return () => clearInterval(timer);
}, [delay]);
```

delay 变化时，旧 cleanup 清除旧 timer，再建立新 timer；组件卸载时清除最后一个 timer。 函数式更新避免 interval 闭包一直读取旧 count；若 Effect 读取其他 props/state，也必须考虑其依赖。 每一轮 create 与 cleanup 都闭包捕获各自那一轮的值，cleanup 不会自动读取最新局部变量。

### 9.4 layout 与 passive 的本项目时机

`useLayoutEffect` 在 DOM 更新和 ref 赋值之后同步运行；适合演示测量新 DOM。 更新时的 layout cleanup 也在这个 layout 阶段执行，所以它看到的 DOM 已完成 mutation。 `useEffect` 由 timer 驱动，下一轮 render 或 root 卸载也会提前 flush pending passive。 不要把 `setTimeout` 等同于浏览器必定完成一次 paint，也不要把这个顺序当作 React 的完整提交实现。 React 的资源同步与清理原则见[Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)。

## 10. Context、组件包装与类组件

### 10.1 Provider 改变的是一个候选分支

`createContext` 保存 defaultValue，让 `Context.Provider` 指向 Context 自身，并建立 Consumer 包装对象。 进入 Provider Fiber 时复制父 context Map，再写入自己的值；孩子继承这份 Map，其他兄弟仍使用父 Map。 默认值只用于没有对应 Provider 的分支；Provider 明确传 `undefined` 时，读到的就是 `undefined`。 `useContext` 会记录 `[context, value]`，memo 检查这个依赖，避免 props 相同却错过主题变化。 类 `contextType` 也记录依赖；Consumer 则调用 `props.children(value)` 产生输出。

### 10.2 memo 复用输出后仍然协调孩子

本项目 `memo` 返回一个包装对象，在 render 时检查 props、ref、自身更新队列与 Context 依赖。 默认使用浅比较，自定义 compare 也可用；自身 state 或读过的 Context 变化不能被 props 相等掩盖。 满足条件时跳过被包装组件函数，复用 old.output；随后仍调用 `reconcileChildren` 并继续处理子树。 所以子组件自己的 pending state 仍可执行，当前实现没有完整 subtree bailout。 自定义比较若忽略函数 prop 的变化，也可能让子组件继续使用旧闭包。 React 的 API 意义见[memo](https://react.dev/reference/react/memo)。

### 10.3 forwardRef 与 useImperativeHandle

forwardRef render 分支从 props 中取出 ref，作为第二个参数传给包装函数。 `useImperativeHandle` 基于 layout Effect，在 DOM 与 refs 就绪后创建 handle，cleanup 时释放 handle：对象 ref 清空，callback ref 优先执行返回的 cleanup，否则传 null。 有 deps 时会把 ref 也加入比较，保证 ref 变化能重新赋值；普通函数组件也可直接读取 `props.ref`。

```js
const FocusInput = forwardRef(function FocusInput(props, ref) {
  const input = useRef(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);
  return h('input', { ...props, ref: input });
});
```

### 10.4 类状态也是先计算，后发布

类实例跨匹配复用，`setState` 经注入的 updater 入队，不在组件 API 层立即合并。 renderer 按顺序处理 partial；函数 partial 接收候选 state 和新 props，然后浅合并结果。 `getDerivedStateFromProps` 可追加派生结果，forceUpdate 则跳过更新阻止判断。 `shouldComponentUpdate` 优先于 PureComponent 的浅 props/state 比较；Context 改变时不走这一阻止分支。 render 临时使用候选值，结束后还原；commit 消费队列并发布 props/state/context。 snapshot 在 mutation 前，DidMount/DidUpdate 和 setState callbacks 在 layout 阶段；WillUnmount 在删除时。 这里没有 legacy/UNSAFE lifecycles、ErrorBoundary 或完整 React 类组件边缘行为。

## 11. 外部 Store 与 ID

### 11.1 外部数据变化需要通知根重新计算

`useSyncExternalStore` 每次 render 先调用 getSnapshot，再用 state 驱动重算、用 ref 保存最新 snapshot/getSnapshot。 第一个 layout Effect 发布这组数据并补查 render 到 commit 的变化；第二个建立订阅，订阅后立即补查一次。 通知时用 `Object.is` 对比 snapshot，变化才请求 forceUpdate；cleanup 调用 unsubscribe。

```js
let value = 0;
const listeners = new Set();
const getSnapshot = () => value;
const subscribe = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
function incrementStore() {
  value++;
  for (const listener of listeners) listener();
}
```

组件可用 `useSyncExternalStore(subscribe, getSnapshot)` 读取上面的数值。 getSnapshot 应在数据未变化时返回相同结果；每次返回新对象会不断被判断成变化。 稳定 subscribe 还能避免每轮取消再订阅；本实现保留 getServerSnapshot 参数但不执行。 这些补查覆盖客户端学习流程，不等同于 React 的完整并发一致性保障，参见[useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)。

### 11.2 useId 的稳定范围

首次 useId 根据 root ID、root 计数器与 identifierPrefix 生成字符串，随后保存在 Hook 中复用。 它适合把 label 的 htmlFor 与 input 的 id 对应起来，不能替代列表项的稳定业务 key。 同一已挂载组件更新时 ID 稳定，重新挂载会重新生成；候选初始化被丢弃可能留下计数空隙。 本项目没有 SSR/hydration 一致性；React 的使用规则见[useId](https://react.dev/reference/react/useId)。 `useDebugValue` 仅验证处于函数组件 render 中，不执行 formatter，也没有 DevTools 协议。

## 12. Portal、lazy/Suspense 与简化延后调度

### 12.1 Portal 改变 DOM 容器，保留 Fiber 父链

`createPortal(children, container, key)` 创建专门描述对象，Portal Fiber 的 dom 指向目标容器。 孩子仍沿原 Fiber 父链读取 Context，宿主创建则根据 Portal 容器确定 ownerDocument 与 namespace。 父容器收集 hostChildren 时跳过 Portal；Portal 容器单独同步自己的孩子，并保留外来的非本项目节点。 但本项目事件直接注册在 DOM 上，所以冒泡沿真实 DOM 树，未模拟 React Portal 的逻辑树事件传播。

### 12.2 lazy 的四个状态

| `_status` | `_result` 保存什么 | readLazy 的行为 |
| --- | --- | --- |
| -1 | load 函数 | 首次调用 load，转换并缓存 Promise |
| 0 | 等待中的 Promise | 抛出 Promise，让工作循环识别挂起 |
| 1 | 加载成功的模块 | 返回 `module.default` |
| 2 | 加载错误 | 抛出错误，交给根错误处理 |

lazy 包装对象应在组件外建立，否则每次 render 都可能创建新类型并重新加载。 缓存位于 lazy 对象的 payload；它并非任意 Promise 数据缓存，也不提供 `use(promise)`。

### 12.3 Suspense 如何切换到 fallback

工作循环捕获带 then 的对象时，沿 fiber.parent 找最近尚未挂起的 Suspense 边界。 根把 `[boundary.path, promise]` 写入 suspensions Map，丢弃当前候选树，从 current 重新协调 fallback。 Promise 成功或失败都会请求 retry；成功时 lazy 返回组件，失败时 readLazy 抛普通错误。 没有边界会报告错误；也没有 ErrorBoundary 接管加载失败。

```text
读 lazy -> 抛 Promise -> 标记边界挂起
                       -> 丢弃未提交 work
                       -> 从 current 计算 fallback -> commit
Promise settles -> 清除对应挂起标记 -> schedule -> 重算 primary
```

本项目没有保留隐藏的 primary 树。切换 fallback 会按普通 children 协调，卸载被替换的 primary。 常见的不同类型 fallback 会让已经显示的 primary state 丢失，retry 时重新挂载。 不要据此认为 React 总会卸载 primary；React 有更完整的隐藏、状态保留与 transition 协作，见[Suspense](https://react.dev/reference/react/Suspense)。

### 12.4 transition 的 scope 同步执行

`runTransition` 只在同步 scope 期间增加 transitionDepth；`scheduleRoot` 看到它后用 timer 延后入根 Set。 action 已经写进共享状态队列，所以同一个根若还收到普通更新，两类 action 可能一起处理。 这里没有 Lanes，也没有按优先级分别保留和重放更新，因此不能承诺真实后台渲染语义。 await 后 transitionDepth 已还原，后面的更新不会自动保留标记；React 接口参见[startTransition](https://react.dev/reference/react/startTransition)。

`useTransition` 用 state 显示 pending，用 ref 计数，下一轮 timer 等待 scope 返回的 Promise 后减少计数。 pending 跟踪的是这套 timer/Promise 模拟过程，不精确代表后台 Fiber 已提交或 Suspense 已完成。 `useDeferredValue` 则在 passive Effect 中安排 timer 更新另一份 state；新值或卸载 cleanup 会取消旧 timer。 它不是固定时长防抖，也没有 React 根据渲染负载动态推进后台工作的机制。

## 13. 一次按钮更新的完整时间线

下例使用仓库包入口。浏览器示例采用 import map 时，把导入名换成 `react` 与 `react-dom/client`。 把它放在已有入口脚本中，并确保页面提供 id 为 root 的容器，即可观察节点、refs 与 Effects。

```js
import { createElement as h, useState, useRef, useLayoutEffect, useEffect } from 'mini-react';
import { createRoot } from 'mini-react/react-dom/client';

function Counter() {
  const [count, setCount] = useState(0);
  const button = useRef(null);
  useLayoutEffect(() => {
    console.log('layout', count, button.current.textContent);
    return () => console.log('layout cleanup', count);
  }, [count]);
  useEffect(() => {
    console.log('passive', count);
    return () => console.log('passive cleanup', count);
  }, [count]);
  return h('button', {
    ref: button,
    onClick: () => {
      setCount(value => value + 1);
      setCount(value => value + 1);
      setCount(value => value + 1);
      console.log('handler snapshot', count);
    },
  }, `计数：${count}`);
}

const root = createRoot(document.getElementById('root'));
root.render(h(Counter));
```

首次提交及其 passive 执行完毕后点击一次，顺序为：

1. 原生 click handler 执行，三项函数 action 入队，handler 打印旧快照 0。
2. 根 version 增加三次，但 scheduler Set 保留一个根，微任务开始工作。
3. beginWork 从 current 建候选树；Counter 的 state slot 从 0 依次算到 1、2、3。
4. 协调复用旧 button 与 TEXT Fiber；render 尚未把页面中的文字改成 3。
5. 完整候选树完成，commit 更新 TEXT DOM，消费三项 action，发布 current。
6. 对象 ref 仍指向同一个 button；layout cleanup 打印旧闭包 0，再运行新 layout 打印 3。
7. passive flush 先打印旧 cleanup 0，再执行新 create 打印 3。

第 6 步的旧 layout cleanup 虽捕获 count 0，但 DOM 此时已是“计数：3”。 “闭包快照”与“当前 DOM”是两种不同信息，必须结合阶段一起观察。 若点击发生在初次 passive timer 之前，beginWork 会先 flush 初次 passive，再开始这次 render。 以上代码用于解释和人工观察，不代表本项目执行了完整浏览器测试。

### 13.1 按问题设置断点

| 想确认的问题 | 函数 / 文件 | 观察变量 |
| --- | --- | --- |
| Element 是否只描述 UI | `createElement` / `element.js` | type、key、props.children |
| 三次更新是否全部入队 | queue.dispatch / `hooks/state.js` | pending、queue.root.version |
| 根是否被批量调度 | `enqueueRoot`、`flushWork` / `scheduler.js` | roots、scheduled、deadline |
| 候选是否对应当前版本 | `beginWork`、`performWork` / `renderer.js` | current、work、version、workVersion |
| 是否复用旧身份 | `reconcileChildren` / `fiber.js` | identity、same、alternate、dom |
| Hook 是否按顺序匹配 | `nextHook`、`useReducerImpl` | hookIndex、kind、state、processedCount |
| DOM 何时变化 | `commitRoot`、`updateDom`、`synchronizeChildren` | finished、deletions、cursor |
| action 何时被移除 | `commitHooks` / `hooks/runtime.js` | pending 与 processedCount |
| cleanup 为何读到旧值 | `runEffects` / `hooks/effect.js` | cleanup、create、changed、effectKind |
| Suspense 为何重算 | `readLazy`、root.suspend、retry | payload、boundary.path、suspensions |

每次只追一个问题：先观察队列，再观察候选 state，最后观察 DOM。 浏览器暂停断点会改变实际任务耗时，不适合据此判断 5ms 调度性能。

## 14. 实现边界与下一步学习

| 当前简化 | 可以继续研究的问题 |
| --- | --- |
| Hook 为数组 slot，队列为普通数组 | 怎样记录不同优先级 action 与重放顺序？ |
| 相同 state 仍调度，无 eager bailout | 如何在不漏掉后续更新的情况下提前判断相等？ |
| 每次从根协调，memo 只复用输出 | 怎样识别子树有无更新并安全跳过整个分支？ |
| 5ms 协作预算，commit 同步 | 如何减少单个慢工作单元或大 commit 的阻塞？ |
| Suspense fallback 不保留 primary 树 | 如何保存隐藏子树状态并管理 layout 资源？ |
| transition/deferred 依靠 timer，无 Lanes | 怎样让紧急与后台更新使用独立优先级？ |
| DOM 上直接注册事件 | 事件委托、SyntheticEvent 与 Portal 逻辑冒泡如何实现？ |
| external store 仅补查客户端快照 | 如何保障更复杂并发 render 下的一致性？ |
| 只提供客户端 root 与 ID | SSR/hydration 怎样对应服务端和客户端树？ |
| 根报告错误，无 ErrorBoundary | 如何定位组件边界并提交可恢复的错误 UI？ |

StrictMode 当前只是透传容器，不模拟开发期 render、Effect、ref 双执行。 React 19 Actions、Server Components、React Compiler、完整 DevTools 与复杂 DOM 兼容性也不在当前实现中。 学习扩展时先写清目标、API 行为和验收范围，再改一个机制；不要从几个小示例推导生产级兼容性。 可以沿[架构阅读路线](./architecture)回到主路径，或在[完整源码讲解](./source#hooks)中继续追踪 Hooks。

读完后可以先手算三个练习：混合 state action 的最终值、稳定 key 重排后的 state 归属、Effect 依赖变化时的 cleanup 顺序。 再用示例中的断点观察真实变量，比较预测与实现；这一步比增加更多 API 更能检验是否理解了当前机制。
