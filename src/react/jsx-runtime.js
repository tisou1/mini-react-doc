// 自动 JSX 转译的目标入口；只生成 Element，JSX 语法本身仍由外部构建工具转译。
import { createElement, Fragment } from './element.js';

// automatic JSX transform 将 children 放在 props 中，并单独传入 key。
/** 将转译后的 type/props/key 转成与 createElement 相同形状的描述。 */
export function jsx(type, props, key) {
  return createElement(type, key === undefined ? props : { ...props, key });
}

// 编译器区分单/多个静态 children；学习版无需开发诊断，因此共用同一工厂。
export const jsxs = jsx;
export { Fragment };
