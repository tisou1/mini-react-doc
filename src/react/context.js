/**
 * Context 对象只描述通信通道；值的作用域由 renderer 的 Fiber.context Map 决定。
 * Provider 派生子树的 Map，Consumer/useContext 读取它，不依赖全局可变当前值。
 */
import { CONTEXT, CONSUMER } from '../shared/symbols.js';

/** 创建 Provider/Consumer 类型；defaultValue 只在对应树路径上没有 Provider 时使用。 */
export function createContext(defaultValue) {
  const context = {
    $$typeof: CONTEXT,
    _defaultValue: defaultValue,
    // 默认值只用于没有 Provider 的情况。每棵 Fiber 树保存自己的 context Map。
    // 保留类似 React 的对象形状；本 renderer 不用它在多棵树之间传播值。
    _currentValue: defaultValue,
    Provider: null,
    Consumer: null,
  };

  // 支持 React 19 的 <Context value={...}>，同时保留 <Context.Provider>。
  context.Provider = context;
  context.Consumer = { $$typeof: CONSUMER, _context: context };
  return context;
}
