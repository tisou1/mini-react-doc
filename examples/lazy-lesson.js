import { createElement as h } from 'react';

export default function LazyLesson() {
  return h('div', { className: 'lesson' }, h('strong', null, '模块加载完成'),
    h('p', null, 'readLazy → 抛出 Promise → Suspense fallback → Promise 完成 → 重新调度 → commit。'));
}
