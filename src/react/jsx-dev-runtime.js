// 开发 JSX 的目标入口；复用标准 Element 工厂，不额外影响 renderer。
import { jsx, Fragment } from './jsx-runtime.js';

// 保持开发版 JSX 的调用签名；学习版暂不生成 source/self 等开发期诊断。
/** 接收 JSX 开发转译器的完整参数，将用于渲染的 type/props/key 交给 jsx。 */
export function jsxDEV(type, props, key, isStaticChildren, source, self) {
  return jsx(type, props, key);
}

export { Fragment };
