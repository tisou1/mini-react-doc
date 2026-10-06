<script setup>
import { computed, ref } from 'vue';

// 这是对真实源码的分步推演，真实 mini-react 运行示例见交互实验页面。
const stages = [
  { name: 'Element', file: 'react/element.js', detail: 'createElement 生成 UI 描述，还没有创建或修改 DOM。', snapshot: 'element = { type: Counter, key: null, props: {} }' },
  { name: 'Schedule', file: 'reconciler/scheduler.js', detail: 'dispatch 把更新加入共享队列，同一事件中的三次请求合并调度。', snapshot: 'queue.pending = [n => n + 1, n => n + 1, n => n + 1]' },
  { name: 'Render', file: 'react/hooks/state.js', detail: '从已提交的 state 开始计算候选状态，记录已读取数量，尚不消费队列。', snapshot: 'candidate: 0 → 1 → 2 → 3; processedCount = 3' },
  { name: 'Reconcile', file: 'reconciler/fiber.js', detail: '用 type 与 key 匹配旧 Fiber，复用对应 DOM，把未匹配节点登记为删除。', snapshot: 'work.child.alternate → current.child; work.child.dom = old.dom' },
  { name: 'Commit', file: 'reconciler/renderer.js', detail: '候选树完成后发布 DOM 和 state，再消费更新队列，并连接 refs。', snapshot: 'DOM.text = "3"; state = 3; queue.pending = []' },
  { name: 'Effects', file: 'react/hooks/effect.js', detail: 'layout 同步执行；passive 延后执行。依赖变化时先调用旧 cleanup。', snapshot: 'old cleanup() → new create(); 保存新的 cleanup' },
];
const active = ref(0);
const stage = computed(() => stages[active.value]);
</script>

<template>
  <section class="render-walkthrough" aria-label="一次批量更新的分步推演">
    <div class="walkthrough-heading">
      <span>从 UI 描述到 +3 更新</span>
      <span class="walkthrough-caption">按源码顺序推演</span>
    </div>
    <div class="walkthrough-stages" role="group" aria-label="选择更新阶段">
      <button v-for="(item, index) in stages" :key="item.name" type="button"
        :aria-pressed="active === index" :class="{ active: active === index }" @click="active = index">
        <span class="stage-number">{{ index + 1 }}</span>{{ item.name }}
      </button>
    </div>
    <div class="walkthrough-detail" aria-live="polite" aria-atomic="true">
      <p class="walkthrough-file">src/{{ stage.file }}</p>
      <p>{{ stage.detail }}</p>
      <pre><code>{{ stage.snapshot }}</code></pre>
    </div>
    <div class="walkthrough-controls">
      <button type="button" :disabled="active === 0" @click="active--">上一步</button>
      <span>{{ active + 1 }} / {{ stages.length }}</span>
      <button type="button" :disabled="active === stages.length - 1" @click="active++">下一步</button>
    </div>
  </section>
</template>
