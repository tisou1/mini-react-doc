/**
 * react-dom 公共入口：Portal 返回一段渲染描述，flushSync 委托给调度器。
 * 创建描述不会插入 DOM；renderer 到 commit 阶段才把子节点放进目标容器。
 */
import { PORTAL } from '../shared/symbols.js';

export { flushSync } from '../reconciler/scheduler.js';

export function createPortal(children, container, key = null) {
  if (!container || ![1, 9, 11].includes(container.nodeType)) {
    throw new TypeError('Target container is not a DOM element.');
  }
  // Portal 保留 Fiber 的父链，因此仍能读取原树的 Context；只切换 DOM 挂载位置。
  // 本版本使用原生事件，冒泡沿实际 DOM，而非 React 的组件树事件传播机制。
  return {
    $$typeof: PORTAL,
    type: PORTAL,
    key: key == null ? null : String(key),
    props: { children, container },
  };
}
