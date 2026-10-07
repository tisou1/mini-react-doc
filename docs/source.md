---
title: 带注释的完整源码
outline: [2, 2]
---

# 带注释的完整源码

以下代码直接从 `src/` 引入，不维护第二份副本。先读 [完整原理讲解](./principles)，再按模块展开实现；行号和复制按钮便于对照本地文件。

## Element 与 JSX {#element}

创建 UI 描述，保留 type/key/props，处理 children 和 ref。这里不会创建 DOM。

::: details src/react/element.js · Element 与 Children
<<< @/../src/react/element.js
:::

::: details src/react/jsx-runtime.js · JSX 自动转换入口
<<< @/../src/react/jsx-runtime.js
:::

::: details src/react/jsx-dev-runtime.js · JSX 开发入口
<<< @/../src/react/jsx-dev-runtime.js
:::

## Fiber 与协调 {#fiber}

child/sibling/parent 表示遍历路径，alternate 指向已提交节点。type 与 key 决定组件身份。

这里每轮新建候选 Fiber；现代 React 的 `return`、双缓冲复用、`flags/subtreeFlags` 和 Lanes 详见 [Fiber 专题](./fiber)。

<<< @/../src/reconciler/fiber.js

## 调度与批量更新 {#scheduler}

根节点 Set 合并调度请求，5ms 预算在 Fiber 之间让出主线程。flushSync 与简化 transition 在同一调度器处理。

<<< @/../src/reconciler/scheduler.js

## render 与 commit {#renderer}

从 `performUnit` 开始跟踪组件执行，再看 `commitRoot` 如何一次发布候选树。类 snapshot、删除、DOM 移动、状态发布、refs 和 Effects 有不同的执行阶段。

::: details src/reconciler/renderer.js · 根、工作循环、组件与提交
<<< @/../src/reconciler/renderer.js
:::

## Hooks 调用顺序与状态队列 {#hooks}

每个 stateful Hook 按调用位置匹配旧快照。queue 在候选树与已提交树之间共享，只有成功 commit 才消费更新。

<<< @/../src/react/hooks/runtime.js

<<< @/../src/react/hooks/state.js

::: details ref、memo 与 callback
<<< @/../src/react/hooks/ref.js
<<< @/../src/react/hooks/memo.js
:::

## Effects 与资源清理 {#effects}

render 登记 create/deps；提交后执行 create，保存 cleanup，依赖变化与卸载清理资源。

<<< @/../src/react/hooks/effect.js

## Context、ID 与外部数据源 {#context}

::: details Context 对象与 Hook
<<< @/../src/react/context.js
<<< @/../src/react/hooks/context.js
:::

::: details useId 与 useDebugValue
<<< @/../src/react/hooks/id.js
:::

::: details 外部 store 订阅与快照检查
<<< @/../src/react/hooks/external-store.js
:::

## 组件包装器、类与延后更新 {#components}

::: details memo、forwardRef 与 lazy
<<< @/../src/react/wrappers.js
:::

::: details Component 与 PureComponent
<<< @/../src/react/component.js
:::

::: details 简化 transition 与 deferred
<<< @/../src/react/hooks/transition.js
:::

## DOM host 与 Portal {#dom}

宿主层负责真实 DOM 属性、style、原生事件、表单、SVG 和 ref；组件层不直接操作 DOM。

::: details src/react-dom/host.js · 宿主操作
<<< @/../src/react-dom/host.js
:::

::: details createRoot、createPortal 与 flushSync 入口
<<< @/../src/react-dom/client.js
<<< @/../src/react-dom/index.js
:::

## 共享标记与公开入口 {#shared}

::: details Symbol 与浅比较
<<< @/../src/shared/symbols.js
<<< @/../src/shared/shallow-equal.js
:::

::: details React 与 Hooks 公开导出
<<< @/../src/react/index.js
<<< @/../src/react/hooks.js
:::
