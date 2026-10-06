# 从 Element 到提交

本文按本仓库的源码解释一次更新。先运行示例，选择一个简单的计数按钮，再沿函数名设断点。首次阅读先理解主路径，之后再加入 memo、Context 和 Suspense。

## 一条更新路径

```text
createElement / jsx
        ↓ UI 描述
root.render / dispatch / setState
        ↓ 更新队列 + root.schedule
scheduler：微任务批量调度 / Fiber 时间预算
        ↓ root.beginWork
fiber：type/key 匹配 + 候选树
        ↓ performUnit
render：执行组件、计算 Hook 状态、协调 children
        ↓ 完整候选树
commit：snapshot → 删除/更新/移动 DOM → 发布状态 → refs/layout
        ↓ 延后的任务
passive Effects
```

关键边界是 render 与 commit。render 计算可以被放弃；已经挂载的 DOM 和已提交的组件状态在 commit 才发布。新 host 节点可以在 render 创建和初始化，但此时脱离文档。用户自己在组件 render 中修改 ref 或执行副作用不会被框架自动回滚，所以组件仍应保持纯净。

## 模块地图

| 文件 | 阅读重点 |
| --- | --- |
| [src/shared/symbols.js](./source#shared) | Element、TEXT、Fragment、Context、包装器与 Portal 的类型标记。 |
| [src/shared/shallow-equal.js](./source#shared) | memo/PureComponent 的浅比较，不递归比较嵌套对象。 |
| [src/react/element.js](./source#element) | Element 的构造、clone、Children 遍历和 key 组合。 |
| [src/react/component.js](./source#components) | 类组件只通过 `__updater` 请求更新，实际合并与提交由 renderer 完成。 |
| [src/react/context.js](./source#context) | 默认值、Provider 自引用和 Consumer 类型。 |
| [src/react/wrappers.js](./source#components) | memo/forwardRef/lazy 包装对象与 lazy 状态机。 |
| [src/react/jsx-runtime.js](./source#element)、[jsx-dev-runtime.js](./source#element) | JSX 转换器调用的纯 Element 创建入口。 |
| [src/react/index.js](./source#shared)、[hooks.js](./source#hooks) | 公共 API 汇总，入口不承担渲染工作。 |
| [src/react-dom/client.js](./source#dom)、[index.js](./source#dom) | `createRoot`、`createPortal` 与 `flushSync` 的包入口。 |
| [src/reconciler/scheduler.js](./source#scheduler) | 根节点队列、批量更新、约 5ms 工作预算、同步 flush 和简化 transition。 |
| [src/reconciler/fiber.js](./source#fiber) | 子节点规范化、身份匹配、候选 Fiber 与遍历指针。 |
| [src/reconciler/renderer.js](./source#renderer) | 根状态、工作循环、组件执行、Context/Suspense、DOM 提交与卸载。 |
| [src/react-dom/host.js](./source#dom) | DOM 创建、属性/style/事件/表单更新、namespace 和 ref 赋值。 |
| [src/react/hooks/runtime.js](./source#hooks) | 当前 Fiber、Hook 索引、候选 Hook 快照与 commit 队列消费。 |
| [src/react/hooks/state.js](./source#hooks)、[ref.js](./source#hooks)、[memo.js](./source#hooks) | 状态更新队列、持久 ref、依赖比较与缓存。 |
| [src/react/hooks/effect.js](./source#effects) | 记录 Effects、依赖变化、layout/passive 执行与 cleanup。 |
| [src/react/hooks/context.js](./source#context)、[id.js](./source#context) | Context 依赖跟踪、稳定客户端 ID 和 DebugValue 入口。 |
| [src/react/hooks/external-store.js](./source#context)、[transition.js](./source#components) | 外部 store 订阅、transition pending 和 deferred 的简化实现。 |

## 1. Element 只描述 UI

`createElement(type, config, ...children)` 返回：

```js
{ $$typeof: ELEMENT, type, key, props }
```

type 可以是标签、函数、类或组件包装器。key 被取出并转换为字符串，ref 留在 `props.ref`。children 不会在这里转成 DOM：一个 child 直接存入 props，多个 child 才形成数组。`jsx` / `jsxs` 使用同一条创建路径，区别在于转换器已经把 children 放入 props。

`Children` 的遍历与 renderer 的协调职责不同。Children 可以处理嵌套集合，但停在 Element 边界；它不会调用组件或展开 Fragment 的 props.children。renderer 之后才处理组件输出与 Fragment。

建议断点：`createElement` 返回处。检查 `type`、`key`、`props.children` 与 `props.ref`。

## 2. 更新先进入调度器

`createRoot` 保存根的 `element`、已提交树 `current`、候选树 `work`、下一个工作单元 `nextUnit`、`version` 和待删除列表。`root.render` 修改根 Element 后调用 `root.schedule`；函数组件 dispatch 和类组件 `setState` 先进入自己的队列，再请求同一根调度。

`scheduleRoot` 将普通更新放入根节点 Set，并安排微任务。因此同一轮事件中的多次更新通常合并处理。`flushWork(false)` 给工作循环约 5ms 预算，未完成的根在后续任务中继续。`flushSync` 用无限预算处理当前队列；没有 React 的完整优先级体系。

`version` 用于识别工作期间出现的新更新。当 `workVersion` 不再匹配，renderer 从 `current` 重建候选树，避免提交基于过期输入的计算结果。开始新一轮 render 前会先 flush 上一次待执行的 passive Effects。

建议断点：`root.schedule`、`scheduleRoot`、`flushWork`、`root.beginWork`。在一个点击回调中连续调用两次函数式 `setCount`，观察队列与根 Set。

## 3. Fiber 保存位置与身份

`childElements` 把字符串、数字与 bigint 转成 TEXT Element，空值不产生 Fiber。空位置仍影响无 key 节点的索引；嵌套数组转成 Fragment，保留层级。

`reconcileChildren` 用旧子节点的 key 或 index 建 Map。新旧节点身份相同且 type 相同时，创建候选 Fiber 并把旧 Fiber 放入 `alternate`；候选节点复用旧 DOM。Portal 还要求容器相同。旧节点没有被匹配就进入 `root.deletions`，这时仍不删除 DOM。

Fiber 的 `child`、`sibling`、`parent` 让深度优先遍历可以在任意工作单元后暂停；`nextFiber` 决定下一个节点。`path` 由父路径和 key/index 组成，用于标识 Suspense 边界。`alternate` 只关联上一棵已提交树，commit 结束后清除旧链，避免积累完整历史。

列表中使用稳定业务 key，可以在重排时继续匹配原来的组件与状态。修改 type 或 key 会重新挂载。不要把随机值作为 key。

建议断点：`reconcileChildren` 的 `same` 计算处。重排列表示例，检查候选 Fiber 的 `alternate` 和 `dom` 是否仍指向原节点。

## 4. render 计算候选结果

`performUnit` 按 type 分派：容器读取 children，host 创建脱离文档的 DOM，Provider 复制 context Map 并写入值，Consumer 调用 render prop，组件交给 `renderComponent`。获得 children 后统一进入协调。

函数组件由 `renderWithHooks` 执行。runtime 设置当前 Fiber 与 Hook 索引，`nextHook` 按调用顺序克隆上一轮 Hook。条件分支改变 Hook 顺序或数量会破坏对应关系，因此源码会对此报错。

状态 Hook 的 queue 在 render 之间共享，dispatch 身份稳定；Hook 的 state 保存于候选快照。render 从旧 state 按顺序处理 pending 更新，记录 `processedCount`；成功 commit 才移除本轮处理的队列项。丢弃候选树不会提前消费已挂载组件的更新。当前实现拒绝 render-phase state updates，也没有相同 state 的 eager bailout。

类组件复用 instance、计算候选 state，render 时暂时替换 props/state/context，结束后还原；commit 再发布新值。memo 检查 props、ref、自身队列与 Context 依赖，满足条件时复用旧输出；复用输出后仍会协调子树，子组件自己的更新不会因此被隐藏。

建议断点：`performUnit`、`renderComponent`、`renderWithHooks`、`useReducerImpl`。对比 `fiber.hooks` 与 `fiber.alternate.hooks`，确认已提交 state 在候选计算期间保持原值。

## 5. commit 发布结果

完整候选树完成后，`commitRoot` 同步执行：

1. Before mutation：断开需要更换的 ref，调用类组件 `getSnapshotBeforeUpdate`，此时读取旧 DOM。
2. Mutation：卸载待删除树，清理队列、Effects 与 refs；更新复用 DOM 的属性。`synchronizeChildren` 收集组件下面的顶层 host 节点，用 `insertBefore` 完成插入与移动。Portal 在自己的容器中处理子节点。
3. 发布：`commitHooks` 消费处理过的更新；发布类 props/state/context 并取出 callbacks；`root.current` 指向完成树。
4. Layout：先赋 host/class refs，再从子组件开始执行 layout Effects、类 `componentDidMount` / `componentDidUpdate` 和更新 callbacks。
5. Passive：记录本次树并安排 `setTimeout`，稍后运行 passive Effects。

组件返回多个 host 节点时，移动必须包含全部顶层节点；hostChildren 遇到 host 节点便停止向下收集，避免重复移动其后代。DOM 属性与原生事件的更新统一在 `host.js`，组件层不直接调用 DOM API。

建议断点：`commitRoot`、`synchronizeChildren`、`updateDom`、`setRef`。对比 `getSnapshotBeforeUpdate` 与 layout Effect 看到的 DOM，并观察重排时 node 引用保持不变。

## 6. Effects 管理资源生命周期

`useEffectImpl` 在 render 记录 create/deps/changed，不执行 create。依赖逐项使用 `Object.is` 比较；没有依赖数组时每次都标记变化。

`runEffects` 只处理对应 layout/passive 类型且 changed 的 Hook：先运行上一轮 cleanup，再执行 create 并保存返回的 cleanup。卸载时 `cleanupHooks` 先关闭状态队列，再同步执行所有 cleanup，避免已卸载组件重新调度。

layout 在本项目的 DOM mutation 之后同步执行。passive 使用 timer；若下次 render 或根卸载先发生，会先主动 flush 尚未运行的 passive。因此不能把此实现的 timer 等同于浏览器一定已经完成 paint。

`useImperativeHandle` 基于 layout Effect；`useSyncExternalStore` 用 layout Effect 发布 snapshot/getSnapshot，建立订阅并检查 render 到 commit 之间的 store 变化。这些实现覆盖学习所需客户端流程，未实现 React 的完整并发一致性保障。

建议断点：`useEffectImpl`、`runEffects`、`cleanupHooks`、`root.flushPassiveEffects`。更新依赖、移除组件，再卸载整个 root，观察 create/cleanup 顺序。

## 扩展怎样接入主路径

### Context 与 Portal

Provider 为当前候选分支复制 Map；其后代读到新值，兄弟分支不受影响。`useContext` 记录读过的值，memo 比较时据此识别 Context 变化。class `contextType` 同样记录依赖。Portal 只改变 DOM 容器，Fiber 父链及 Context 继续保留；事件依然按实际 DOM 树冒泡。

### lazy 与 Suspense

`lazy` 的 payload 状态为 `-1`（未加载）、`0`（等待）、`1`（成功）、`2`（失败）。`readLazy` 首次启动加载；成功返回模块 default export，等待时抛出 Promise，失败时抛出 error。

工作循环捕获 Promise，沿 parent 找到可用的最近 Suspense 边界，把 Promise 保存到根的 suspensions Map，丢弃候选树，再从已提交树协调 fallback。Promise 完成后清除挂起标记并重新调度。加载失败作为普通错误交给根的 `onUncaughtError` 或 `console.error`，没有 ErrorBoundary。

这是 lazy 的演示机制：fallback 会卸载 primary，重试后重新挂载，不保留已经显示的 primary state；没有 `use(promise)`、Offscreen、数据缓存或 React transition 与 Suspense 的完整协作。

建议断点：`readLazy`、`root.suspend` 与 Promise 的 retry。观察 suspend 时没有 commit 候选树，fallback commit 时才执行旧 primary 的卸载。

### transition 与 deferred

`startTransition` 同步运行 scope；`runTransition` 设置临时深度，`scheduleRoot` 将该 scope 内的调度请求延后至 timer。状态队列本身已经接收更新；同一 root 同时有普通更新时，可能一起处理，因为没有 Lanes 或独立优先级队列。

`useTransition` 先设 pending，再用下一轮 timer 和 scope 返回的 Promise 模拟完成。它的 pending 不等价于 React 对后台 render/Suspense 的实际追踪，await 后的更新也不会自动保持 transition 标记。`useDeferredValue` 通过 passive Effect 安排延后的状态更新，并在值变化或卸载时取消旧 timer。

建议断点：`runTransition`、`scheduleRoot` 的 transition 分支、`useTransition` 的 timer。先观察 scope 同步执行，再观察延后的调度请求。

## 继续学习

掌握主路径后，可以分别研究：如何增加 eager state bailout、如何让 memo 跳过无更新的子树、如何在 Suspense 显示 fallback 时保留 primary 状态、如何按优先级处理更新。每次只扩展一个机制，先在 `GOAL.md` 记录目标与简化，再完成最小验证和 jj 提交。

完整 API 范围与暂缓项见 [API 与兼容范围](./api)。React 本身的设计应以 [React 官方文档](https://react.dev/reference/react) 为准。
