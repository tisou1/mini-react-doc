import { createElement, Fragment } from './element.js';

// automatic JSX transform 将 children 放在 props 中，并单独传入 key。
export function jsx(type, props, key) {
  return createElement(type, key === undefined ? props : { ...props, key });
}

export const jsxs = jsx;
export { Fragment };
