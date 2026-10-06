# mini-react 工作约定

## 目标与实现原则

- 这是解释 React 原理的学习项目。可读性优先，保持 Element → Fiber → render → commit 的职责清晰。
- 公共 API 的名称、参数和常见行为参照 [React 官方文档](https://react.dev/reference/react)。存在简化时，在 README 的兼容性表中明确写出。
- 使用原生 JavaScript ESM 和中文原理注释，不引入 React 本身作为实现，不为缩短代码隐藏核心机制。
- 修改前阅读相关源码和 GOAL.md；只做目标内的最小修改，保留用户已有工作。

## 模块边界

- `src/react/`：Element、组件、Context 与 Hooks；不直接操作 DOM。
- `src/reconciler/`：Fiber、协调、调度和提交；render 阶段不修改已经挂载的 DOM，也不执行 Effects。
- `src/react-dom/`：DOM 属性、事件、refs、Portal 和客户端入口。
- `src/shared/`：类型标记和共享比较工具。
- `examples/`：可交互的学习示例；`docs/`：架构与实现说明。
- Hooks 按调用顺序保存；状态队列在 commit 后消费；Effects 更新前和卸载时必须清理。
- 协调使用 type 与 key 匹配身份，不能为列表更新重新创建全部 DOM。
- 保持模块无运行时依赖。需要包管理器时直接使用 `pnpm`，不切换锁文件、不默认使用 Corepack 包装命令。

## 验证

- 默认执行 `node scripts/check.js` 或 `pnpm check`，仅检查语法和公共入口导入。
- 必要时做针对性的 Node smoke check 或人工操作示例；不默认添加测试框架、全量构建、E2E 或浏览器视觉测试。
- 对完成 API 做最小有意义的验证，记录实际执行的检查；不能将未运行的检查写成通过。
- 测试套件、复杂边界检查、生产级兼容性暂不作为本轮目标。

## 目标记录与版本控制

- `GOAL.md` 是目标、验收范围和完成记录的唯一进度来源。每个逻辑功能完成后更新相应 API、实现要点和验证结果。
- 使用 `jj` 提交，仓库以 `jj git init --colocate` 初始化，Git 和 jj 共用 `.git`。
- 每个逻辑功能单独提交，相关 API 在该功能的记录中逐项列出；文档随对应实现一起提交。
- 使用 `jj commit -m "feat: ..." <paths...>` 选择本次功能文件，避免把其他尚未完成的修改放入提交。
- 提交后执行 `jj bookmark set main -r @-`，让 `git log main` 能看到相同历史。
- 不使用 `git commit` 替代用户要求的 jj，不 amend、rebase、reset 或重写已经完成的提交，不自行 push。
- 无法运行 jj 时先诊断，并报告实际阻碍；不能声称已经提交。不要删除缓存或重新安装依赖来代替诊断。
- 不提交 secrets；破坏性或不可逆操作需用户确认。
