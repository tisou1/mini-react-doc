import { PORTAL } from '../shared/symbols.js';

export { flushSync } from '../reconciler/scheduler.js';

export function createPortal(children, container, key = null) {
  if (!container || ![1, 9, 11].includes(container.nodeType)) {
    throw new TypeError('Target container is not a DOM element.');
  }
  return {
    $$typeof: PORTAL,
    type: PORTAL,
    key: key == null ? null : String(key),
    props: { children, container },
  };
}
