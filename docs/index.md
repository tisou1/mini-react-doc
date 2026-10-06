---
title: 阅读导航
description: 从一次点击开始，逐步理解 mini-react 的 Element、Fiber、Hooks 和 commit。
---

<p class="reading-label">MINI-REACT / IMPLEMENTATION NOTES</p>

# 从一次点击，读懂 React 的工作过程

<p class="reading-intro">先看状态更新如何进入队列，再沿着 Fiber 找到真实 DOM。本手册把概念、当前实现和注释源码放在同一条阅读路径上。</p>

<div class="reading-links">
  <a href="./principles">阅读完整原理</a>
  <a href="./source">对照注释源码</a>
  <a href="./examples">运行交互实验</a>
</div>

<RenderWalkthrough />

## 按什么顺序读

| 阅读顺序 | 你要解决的问题 | 对应页面 |
| --- | --- | --- |
| 先建立整体认识 | JSX 描述怎样变成 DOM？为什么有 render 和 commit？ | [完整原理讲解](./principles) |
| 跟踪一次更新 | dispatch 后哪些函数执行？状态何时发布？ | [更新路径与断点](./architecture) |
| 对照代码 | alternate、processedCount、Context Map 各保存什么？ | [带注释的完整源码](./source) |
| 确认兼容范围 | 哪些 API 保留了 React 用法？哪些机制被简化？ | [API 对照](./api) |
| 动手观察 | +3 batching、列表重排、Effect 清理如何表现？ | [交互实验](./examples) |

## 这份实现覆盖什么

核心链路包括 Element、Fiber、按 type/key 协调、微任务批量调度、Hooks 队列、DOM 提交和 Effects。
Context、refs、memo、类组件、Portal 和 lazy/Suspense 都接入同一个工作循环。

这里展示的是本仓库实际机制。React 的 Lanes、SyntheticEvent、SSR/hydration、ErrorBoundary 和开发期 StrictMode 检查仍有明确简化，见 [API 兼容范围](./api)。

## 本地运行

```sh
pnpm install
pnpm dev
```

默认端口是 5173，被占用后自动尝试下一个端口；访问终端输出的地址。修改 Markdown 或源码后，VitePress 会更新对应内容。
mini-react 核心没有运行时依赖；VitePress 与 Vue 仅用于文档开发。
