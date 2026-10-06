import { jsx, Fragment } from './jsx-runtime.js';

// 保持开发版 JSX 的调用签名；学习版暂不生成 source/self 等开发期诊断。
export function jsxDEV(type, props, key, isStaticChildren, source, self) {
  return jsx(type, props, key);
}

export { Fragment };
