import { CONTEXT, CONSUMER } from '../shared/symbols.js';

export function createContext(defaultValue) {
  const context = {
    $$typeof: CONTEXT,
    _defaultValue: defaultValue,
    // 默认值只用于没有 Provider 的情况。每棵 Fiber 树保存自己的 context Map。
    _currentValue: defaultValue,
    Provider: null,
    Consumer: null,
  };

  // 支持 React 19 的 <Context value={...}>，同时保留 <Context.Provider>。
  context.Provider = context;
  context.Consumer = { $$typeof: CONSUMER, _context: context };
  return context;
}
