# Fiber 专题：现代 React 的工作模型与 mini-react 对照

Fiber 让 React 把组件树的计算组织成可恢复的工作单元，并保存状态、更新优先级与提交计划。理解它，需要把树结构、协调、调度与提交连起来看。

本文以 **2026-10-07 核对的当前稳定版 React 19.3.0** 为参照，固定链接到官方仓库 `v19.3.0` tag，便于重复核对。版本依据见[官方版本列表](https://react.dev/versions)与[19.3.0 Release](https://github.com/facebook/react/releases/tag/v19.3.0)。它不是对持续变化的主分支的描述，也不是稳定的公共 API 契约；内部字段与分支会随版本、renderer 和 feature flags 改变。

本项目的整体更新过程见[技术原理](./principles)。本文每一节都会指出 mini-react 实际保留了什么、简化了什么；示意图与队列例子是教学模型。

## 1. Element、Fiber 与 DOM 各自是什么

| 对象 | 回答的问题 | 典型内容 | 生命周期 |
| --- | --- | --- | --- |
| Element | 希望显示什么？ | type、key、props | 组件执行可以产生新的描述 |
| Fiber | 这个位置如何计算、复用与提交？ | 树指针、状态、队列、优先级、标记 | 同一身份跨更新保留逻辑关联 |
| DOM | 浏览器实际展示什么？ | Element/Text 节点、属性、事件 | 在 commit 中挂载、更新、移动或移除 |

Element 不是 DOM，Fiber 也不等于一个 DOM 节点。函数组件、Fragment 与 Context 等 Fiber 可以没有自己的 DOM；它们的孩子才产生宿主节点。

```text
Element：h(Counter, { key: 'a' })
                 |
                 v
Fiber：Counter 的位置、状态与输出
                 |
               child
                 v
Fiber：button  ------ stateNode/dom ------> HTMLButtonElement
                 |
               child
                 v
Fiber：文本    ------ stateNode/dom ------> Text
```

React Fiber 的 `stateNode` 根据 tag 保存不同对象，可能是宿主节点、类实例或根信息；函数组件通常没有类实例。mini-react 分开使用 `dom` 与 `instance`，Element 则由 `src/react/element.js` 创建。

字段定义可核对 [ReactInternalTypes.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactInternalTypes.js)。本项目的描述对象与 Fiber 可从[Element 源码](./source#element)和[Fiber 源码](./source#fiber)对照。

## 2. Fiber 把树转换成可恢复的遍历

### 2.1 child、sibling、return

现代 React 的 `child` 指向第一个孩子，`sibling` 指向下一个兄弟，`return` 指向父 Fiber。这里的 return 是字段名，与 JavaScript 的 `return` 语句不同。

mini-react 使用 `parent` 表达同样的向上关系；没有把 React 全部字段照搬进来。

| React 字段 | 本项目的对应内容 | 需要注意的差异 |
| --- | --- | --- |
| tag、elementType、type、key | type、key 与共享 Symbol | 没有完整 WorkTag 分类 |
| return、child、sibling | parent、child、sibling | 父指针名称不同 |
| pendingProps、memoizedProps | props、alternate.props | 候选输入与旧输入分在两份 Fiber |
| memoizedState、updateQueue | hooks、类状态和各自 queue | 不是同一套数据结构 |
| stateNode | dom、instance | 宿主节点与类实例分开 |
| lanes、childLanes | 无 | version 不能替代优先级位集 |
| flags、subtreeFlags、deletions | 根 deletions 与整树提交遍历 | 无 Fiber flags 汇总 |
| alternate | 指向旧 Fiber 的 alternate | 本项目不是复用成对 Fiber 的双缓冲池 |

这些字段在 React 中让“输入是什么、状态是什么、还有哪些工作、需要提交什么”共存于一个工作节点。定义与初始化见 [ReactFiber.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiber.js)。

### 2.2 遍历不必一直占据递归调用栈

```text
           A
           |
         child
           v
           B ----- sibling -----> C
           |
         child
           v
           D

B.return = A；C.return = A；D.return = B
mini-react 用 parent 保存上述向上关系
```

保存一个当前 Fiber，就能进入孩子、转到兄弟或沿父链返回。调度器可以在合适的工作单元边界让出控制权，之后从保存的位置继续。

这不会让 JavaScript 函数内部变得可抢占。如果一个组件执行了很慢的同步计算，Fiber 无法在那段函数的任意一行强制暂停它。

## 3. current、workInProgress 与 alternate 双缓冲 {#double-buffer}

### 3.1 两种角色，不是两份 DOM

current 表示已提交结果；workInProgress 表示正在计算的候选结果。匹配到旧位置时，alternate 关联这两个版本。

在参照版本的 `createWorkInProgress` 中，首次需要另一份 Fiber 时才创建它，并建立双向 alternate。后续更新可复用已存在的另一份对象，并重新设置候选字段。

```text
本次 render：
root.current -> Fiber A <------ alternate ------> Fiber B
               已提交                             候选

成功 commit 后：
root.current -> Fiber B <------ alternate ------> Fiber A
               已提交                             下次可复用
```

这是成对 Fiber 的复用思路，不要求每次复制两棵完整、互不共享的树。新身份会新建节点，部分未更新分支也可以复用。

已有宿主 Fiber 的两份版本通常引用同一个 DOM；render 计算下一版输入和状态，commit 才修改已挂载节点。双缓冲不是把页面复制成两份再切换。

上述对象复用可直接核对 [createWorkInProgress 所在文件](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiber.js)。

### 3.2 mini-react 每轮新建候选 Fiber

本项目 `createFiber` 总返回新对象，匹配成功时只把旧 Fiber 写入新对象的 alternate。不会给旧 Fiber 建立可反复交换的另一份对象。

`beginWork` 从 `root.current` 建候选根，`commitRoot` 发布 `root.current = finished`，最后清除新树的 alternate，避免保留整条历史。

所以本项目保留了“已提交结果与候选结果分开”的核心边界，但没有实现 React 的 Fiber 双缓冲复用方式。代码中的同名 alternate 不能作为两者完全相同的证据。

## 4. beginWork 与 completeWork 都属于 render {#work-loop}

### 4.1 向下计算，向上完成

现代 React 的工作循环先对一个 Fiber 调用 beginWork：依据 tag、输入、状态与本轮 lanes 计算，必要时执行组件并协调孩子，也可能跳过没有相关工作的分支。

孩子完成后，completeWork 处理当前节点的完成工作。普通新宿主节点的挂载路径可以在这里创建脱离文档的节点、组装其孩子，并向上汇总信息；更新路径则按 renderer 记录后续工作。

```text
上节 A/B/C/D 的正常完成顺序：

begin A
  begin B
    begin D
    complete D
  complete B
  begin C
  complete C
complete A
```

completeWork 不是 commit。它仍在计算候选结果；创建脱离文档的宿主对象，也不等于把新结果展示到页面。

向下分派与完成行为分别见 [ReactFiberBeginWork.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberBeginWork.js) 和 [ReactFiberCompleteWork.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberCompleteWork.js)。

### 4.2 mini-react 没有独立 completeWork

本项目 `performUnit` 在一个函数中完成类型分派、组件执行、必要的新 DOM 创建与孩子协调。`nextFiber` 再找下一个节点；沿 parent 向上时，不执行另一套完成函数。

```text
mini render：perform A -> perform B -> perform D -> perform C
mini commit：visitTree(..., postOrder=true) 等遍历连接与排序 DOM
```

不能因为 commit 中有后序遍历，就把它称为 React 的 completeWork：两者所在阶段与职责不同。实现位置见[renderer 源码](./source#renderer)中的 `performUnit`，以及[Fiber 源码](./source#fiber)中的 `nextFiber`。

## 5. flags 与 subtreeFlags：把提交意图汇总起来

现代 React 用 flags 表达该 Fiber 的工作标记；其中有提交相关标记，也有 render 控制和静态标记，并非每一位都表示 DOM 改动。

| 标记概念 | 可以表达的意图 |
| --- | --- |
| Placement | 宿主位置需要插入或移动 |
| Update | 对应节点有更新工作，具体动作取决于类型 |
| ChildDeletion 与 deletions | 需要处理被删除孩子 |
| Ref、Snapshot | ref 工作、类组件 mutation 前快照 |
| Passive | 后续 passive Effect 工作 |

subtreeFlags 汇总后代标记。完成路径的 `bubbleProperties` 会汇总孩子的 flags/subtreeFlags，也汇总孩子的 lanes/childLanes；某些 bailout 路径有额外处理。

```text
Root：subtreeFlags 含 Update
  |
Panel：subtreeFlags 含 Update
  |
Text：flags 含 Update

提交阶段结合 phase mask 判断哪些分支需要继续访问
```

这是参照版本的 flags/subtreeFlags 模型；不要用早期 Fiber 教程中的 nextEffect 链表概括所有现代提交实现。标记与阶段 mask 见 [ReactFiberFlags.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberFlags.js)，汇总见 [bubbleProperties 所在文件](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberCompleteWork.js)。

这里区分跨 Fiber 的提交遍历与单个函数组件的 Hook Effects：后者仍保存在 `updateQueue.lastEffect` 指向的环形链表中，Effect 的 next 连接同组件的 Effects。不能把旧 nextEffect 模型的变化理解成“现代 React 不再有 Effect 链表”，见 [ReactFiberHooks.js 的 pushEffectImpl](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberHooks.js)。

mini-react 没有这些标记：删除记录在根的数组，属性更新与 refs/Effects 通过多轮 visitTree 完成，DOM 顺序由 synchronizeChildren 同步。它更直观，但不能利用相同的汇总信息跳过无工作的分支。

## 6. type 与 key 决定身份，移动与重建分开

React 在同一父节点的协调范围内，根据 key/位置与组件类型判断可复用身份；key 不是全局查找索引。状态与位置的关系见[官方状态保留说明](https://react.dev/learn/preserving-and-resetting-state)。

mini-react 先按 key 或 index 建旧孩子 Map，再严格比较 type；Portal 还比较 container。匹配成功，新 Fiber 复用旧 DOM、Hook queue 或类实例；未匹配旧节点只记录到 deletions。

```text
旧：[A(key=a), B(key=b), C(key=c)]
新：[C(key=c), A(key=a), B(key=b)]

候选 C -> alternate 旧 C；DOM C 保留
候选 A -> alternate 旧 A；DOM A 保留
候选 B -> alternate 旧 B；DOM B 保留
```

在 React 参照版本的列表放置逻辑中，复用节点的旧 index 与 lastPlacedIndex 参与移动判断，插入或移动会记录 Placement。该规则不是全局最少 DOM 移动算法，见 [ReactChildFiber.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactChildFiber.js)。

本项目直接在 commit 遍历目标顺序，调用 insertBefore 移动已有节点；不会给 Fiber 设置 Placement。组件如果返回多个顶层 DOM，hostChildren 会把这一组节点收集起来。

type 改变或 key 改变时，旧身份不能沿用；无稳定 key 的列表重排则可能把状态复用到错误的数据行。复用身份、计算候选输出与执行 DOM 移动，是三件相关但独立的事。

## 7. Lanes：本轮处理哪些更新 {#lanes}

### 7.1 lanes 与 flags 回答不同问题

Lanes 是更新工作的位集合。Fiber 的 lanes 记录自身相关工作，childLanes 汇总后代；根还记录待处理、挂起、被唤醒等 lane 信息，调度时选择本轮 render 的集合。

flags 更接近“这个候选结果需要做什么”，lanes 更接近“本轮该处理哪些工作”。优先级选择还涉及挂起、过期与关联更新等规则，并不是简单给每个组件排一个固定等级。

```text
仅作教学的位值，不是 React 的真实常量：
Urgent     = 0001
Background = 0010

pendingLanes = 0011
本轮 renderLanes = 0001：先处理 Urgent
下一轮再处理仍保留的 Background 工作
```

参照版本的位集与选择逻辑见 [ReactFiberLane.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberLane.js)；根调度入口见 [ReactFiberRootScheduler.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberRootScheduler.js)。

Lanes 也不等于 Scheduler 的任务等级。需要 Scheduler 回调的路径，会用 `lanesToEventPriority(nextLanes)` 归类，再映射到 UserBlocking、Normal 或 Idle 等较粗等级；多个 lanes 可以映射到同一级。同步工作还有微任务直接 flush 的路径，因此不是每个 lane 都对应一个独立 Scheduler 任务，见同一根调度文件。

mini-react 没有 lanes/childLanes。一个根排进 Set 后，render 按顺序处理当时已在队列中的 action；version 仅表示输入变新，需要重算，不能挑选某种优先级 action。

### 7.2 跳过更新以后，为什么还要 rebase

假设已提交 state 为 1，同一个状态队列按顺序加入两项纯函数更新：

| 队列项 | 教学优先级 | 操作 |
| --- | --- | --- |
| A | Background | `n => n + 10` |
| B | Urgent | `n => n * 2` |

若先只 render Urgent，A 被跳过，B 从 1 算到 2，页面可以先显示 2。但稍后处理 A 时不能简单从 2 加 10 得到 12；按原队列顺序应为 `(1 + 10) * 2 = 22`。

为保持顺序，第一次跳过处保存 baseState，并保留从此处开始的可重放队列。后面的 B 即使本轮已经处理，也需要留一份用于后续重算。

```text
第一次 render：只处理 Urgent
  baseState = 1
  A：跳过，保留 Background 标记
  B：执行，候选 state = 2；另保留无需再次筛掉的重放副本
  commit 显示 2

稍后 render：处理 Background，并重放保留队列
  从 baseState 1 开始
  A：1 + 10 = 11
  B：11 * 2 = 22
  commit 显示 22，队列处理完成
```

这解释了 rebase 的目的：保留低优先级工作，同时维持同一状态队列的顺序。类/root 队列文件对这一动机有专门说明，见 [ReactFiberClassUpdateQueue.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js)。示例省略了 optimistic、hidden tree 与关联异步 action 等分支，也不保证两次 commit 必然发生。

### 7.3 Hook 队列不能等同于 mini 的 pending 数组

参照版本的 state/reducer Hook 含 memoizedState、baseState、baseQueue、queue、next。updateReducerImpl 根据 renderLanes 判断是否跳过普通更新；跳过后的已处理普通更新会保留 NoLane 副本，以便重放。

共享 pending 更新在 render 中可以合并到 baseQueue 并清空 pending；可重算性靠队列结构保留，不能笼统说真实 React 的队列只在 commit 才消费。实现见 [ReactFiberHooks.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberHooks.js)。

mini-react 的 state Hook 没有 baseState/baseQueue；候选 Hook 从旧 state 折叠 pending 数组，commitHooks 才 splice 掉 processedCount 前缀。上例的两项 action 在一次计算中会直接得到 22，不会因 lanes 跳过 A。

## 8. render 可以让出或重算，commit 发布结果

React 的工作循环区分同步与并发路径；并发路径可以根据 Scheduler 的让出判断或相应时间预算继续工作。恢复与重启取决于根、lanes 和挂起等状态，不能写成每次来新更新都固定重建整棵树。

begin/complete 均为 render 工作；候选未成为已提交结果前可以被放弃。mutation 后、layout 前切换 root.current，是参照版本发布完成树的关键位置。工作循环见 [ReactFiberWorkLoop.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberWorkLoop.js)。

常规 DOM mutation 与 layout 提交不能按 render Fiber 时间片随意拆开；passive 后续处理。内部还有可推迟提交等分支，因此这里只使用阶段模型，不把所有版本的提交调度简化成一条固定规则。

### 8.1 mini-react 的调度与提交差异 {#comparison}

| mini-react 环节 | 实际行为 | 与现代 React 的差异 |
| --- | --- | --- |
| 普通调度 | queueMicrotask 合并请求，根进入 Set | 无完整根调度优先级 |
| 工作预算 | 一轮 flush 共享约 5ms deadline | 5ms 是本项目常数，不是 React 公共保证 |
| 让出位置 | performUnit 之后检查时间，timer 续做 | 没有独立 begin/complete 工作循环 |
| 新请求 | version 与 workVersion 不同就从 current 重算 | 无 lanes 下的选择、复用与重放策略 |
| commit | snapshot、删除、属性/顺序、发布、ref/layout | 无 flags/subtreeFlags 引导遍历 |
| passive | timer 或下轮 beginWork 前 flush | 不保证精确浏览器 paint 时机 |

本项目的 5ms 检查也无法抢占单个慢组件，commit 不分片；详见[调度源码](./source#scheduler)。render 纯净性的公共要求见[Render and Commit](https://react.dev/learn/render-and-commit)。

## 9. Hooks、Context 与 Suspense 如何放入 Fiber 模型

### 9.1 状态属于组件位置，调用顺序定位 Hook

现代 React 的 stateful Hook 链表挂在函数 Fiber 的 memoizedState 上，通过调用顺序关联 current 与候选 Hook。本项目使用 hooks 数组和 hookIndex，nextHook 浅克隆旧对象，queue 和 ref 仍共享。

它们都需要区分当前计算的状态与对外已提交结果。并非每个公开 Hook 都分配一个 stateful Hook 节点；本项目 useContext/useDebugValue 不占 nextHook slot，复合 Hook 则可能调用多个基础 Hook。对照[Hooks 源码](./source#hooks)。

本项目 Provider 复制分支 Context Map，useContext 记录依赖；memo 除 props 外还检查自身队列和读过的 Context。memo 复用旧输出后仍协调孩子，不能跳过整个无工作的子树。

React 的相应 bailout 也不只比较父组件 props：还会结合 childLanes、renderLanes 与 Context 传播判断后代有没有本轮工作。若当前组件可复用但孩子仍有工作，`bailoutOnAlreadyFinishedWork` 会调用 cloneChildFibers 并继续进入孩子，见 [ReactFiberBeginWork.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberBeginWork.js)。

### 9.2 Suspense 的隐藏主树与首次挂载要区分

参照版本的 Suspense 分支会维护 primary 与 fallback，并利用 Offscreen 相关结构管理隐藏主树；相关路径见 [ReactFiberBeginWork.js](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberBeginWork.js)。因此显示 fallback 不能普遍解释为把已挂载主树正常卸载。

但首次挂载之前就 suspended 的状态，React 不保证保留；内容已显示后再次挂起，也要考虑 transition/deferred 更新。隐藏内容的 layout Effect 有相应清理与重建行为，参见[官方 Suspense 契约](https://react.dev/reference/react/Suspense)。

```text
React 的概念结构：                 mini-react 的边界输出：
Suspense                          Suspense
  primary（可隐藏/重试）             当前只选择 primary 或 fallback
  fallback                        不维护另一份隐藏 primary 树
```

本项目 lazy 等待时抛 Promise，root.suspend 找最近可用边界、记录 path、丢弃候选树并重算 fallback。被不同身份 fallback 替换的 primary 会正常卸载，原 state 与资源生命周期结束；Promise 完成后再调度。

### 9.3 transition 不是 setTimeout 的别名

React 的 startTransition 同步调用 action，标记相应更新以支持可被其他更新打断的后台工作；公共行为见[startTransition](https://react.dev/reference/react/startTransition)。其内部优先级与重放机制不能由“延后执行函数”替代。

mini-react 的 runTransition 同样同步执行 scope，但只把根入队请求放到 timer。action 已在共享 queue 中，同根普通更新可能把它一起算完；useTransition 的 pending 也只是 timer/Promise 模拟，不代表后台 Fiber 或 Suspense 精确完成。

## 10. 从本项目继续读官方源码

| 本项目入口 | 官方参照文件 | 第一遍只追什么 |
| --- | --- | --- |
| createFiber | ReactFiber.js | createWorkInProgress 如何获得 alternate |
| reconcileChildren | ReactChildFiber.js | 身份复用与 Placement 的区别 |
| performUnit、nextFiber | ReactFiberWorkLoop.js、BeginWork、CompleteWork | 向下 begin 与向上 complete |
| scheduler、root.version | ReactFiberRootScheduler.js、ReactFiberLane.js | 根何时调度、本轮选哪些 lanes |
| useReducerImpl、commitHooks | ReactFiberHooks.js | pending、baseQueue 与候选 state |
| commitRoot、visitTree | ReactFiberFlags.js、ReactFiberWorkLoop.js | 标记汇总与阶段发布 |

先手算本项目的 key 重排与 state 队列，再读双缓冲，最后加入 lanes/rebase；每次只加入一个差异，避免把字段名相似误认成行为一致。

可用断点依次观察 `reconcileChildren` 的 same、`performUnit` 的组件输出、`root.version/workVersion`、`commitHooks` 的队列前缀与 `commitRoot` 的 current 发布。完整按钮更新时间线见[技术原理第 13 节](./principles)。

现代 React 的主要额外能力不是“更多 Fiber 字段”，而是让身份、工作选择、跳过后的重放、隐藏树与提交阶段协同运行。本项目保留这套学习路径的骨架，没有实现 flags、Lanes、完整 subtree bailout、主树保活或生产级错误恢复。

继续扩展前，应先记录目标和验证范围。不要只给队列加一个 priority 字段就宣称实现并发：还必须说明被跳过更新在哪里保存、已处理更新怎样重放、候选失败怎样恢复，以及旧 DOM 何时仍然保持可见。
