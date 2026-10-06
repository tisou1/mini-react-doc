/**
 * 客户端入口只公开 createRoot；返回的 render/unmount 由 reconciler 管理树的生命周期。
 * 本项目只有客户端挂载，不提供 hydrateRoot 或 SSR/hydration 流程。
 */
export { createRoot } from '../reconciler/renderer.js';
