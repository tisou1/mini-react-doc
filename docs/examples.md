---
title: 交互实验与断点
---

# 交互实验与断点

先在这里观察 UI，再按照每项实验的函数名设断点。下面运行的是本仓库的 mini-react，文档站的 Vue 与示例的渲染容器互相独立。

[在独立页面打开完整实验](/examples/index.html){target="_blank"}

<iframe class="example-frame" src="/examples/index.html" title="mini-react 原理交互实验" loading="lazy"></iframe>

## 推荐实验

| 操作 | 观察 | 断点与源码 |
| --- | --- | --- |
| 点击计数器的 +3 | 三次函数式更新依次计算，DOM 一次发布 | `useReducerImpl` → `commitHooks`；[状态队列](./source#hooks) |
| 启动定时器，再卸载计数器 | cleanup 取消计时器 | `runEffects`、`cleanupHooks`；[Effects](./source#effects) |
| 列表填写笔记后反转 | 同一 key 保留局部 state 和 DOM | `reconcileChildren`、`synchronizeChildren`；[Fiber](./source#fiber) |
| 切换 Context | memo 不会挡住自己读取的 Context 更新 | `contextChanged`；[Context](./source#context) |
| 点击聚焦输入框 | layout 阶段赋 handle，DOM ref 已连接 | `setRef`、`useImperativeHandle`；[Effects](./source#effects) |
| 更新外部 store | snapshot 与订阅更新触发重渲染 | `useSyncExternalStore`；[外部数据源](./source#context) |
| 加载学习卡片 | lazy 抛 Promise，提交 fallback，加载完成重新调度 | `readLazy`、`root.suspend`；[render/commit](./source#renderer) |
| 打开 Portal | Fiber 父链保持，DOM 放入另一个容器 | `hostChildren`；[DOM 与 Portal](./source#dom) |
| 搜索概念/反转结果 | deferred 和 pending 用任务队列演示 | `runTransition`；[简化的延后更新](./source#components) |

## 单独启动示例

```sh
pnpm dev:examples
```

这个命令沿用原生 ESM 服务器，默认 5173、占用时递增，也支持 `PORT`。正常阅读时只需运行 `pnpm dev`，无需再启动第二个服务。
