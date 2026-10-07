<script setup>
import { computed, ref } from 'vue';

// 固定示例的深度优先顺序，对应 performUnit → nextFiber；不模拟 React completeWork。
const units = [
  { id: 'root', name: 'Root', depth: 0, detail: '读取根 Element，协调出 Counter；下一步沿 child 向下。' },
  { id: 'counter', name: 'Counter', depth: 1, detail: '从 current 的 state 和尚未消费的更新队列计算候选计数，返回 section。' },
  { id: 'section', name: 'section', depth: 2, detail: '复用旧 section 的 DOM 引用，协调出 p 与它的 sibling button。' },
  { id: 'paragraph', name: 'p', depth: 3, detail: '复用旧 p 的 DOM 引用，协调出用于显示计数的 TEXT。' },
  { id: 'count-text', name: 'TEXT（计数）', depth: 4, detail: '保存候选文本，不改已挂载 DOM；没有 child/sibling，回到 parent p，找到 sibling button。' },
  { id: 'button', name: 'button', depth: 3, detail: '复用旧 button 的 DOM 引用；下一步沿 child 处理按钮里的 TEXT。' },
  { id: 'button-text', name: 'TEXT（按钮）', depth: 4, detail: '保存按钮文本 +1；没有后续 sibling，沿 parent 回到根，nextUnit 变为 null。' },
];

const currentCount = ref(0);
const targetCount = ref(1);
const processed = ref(0);
const isPaused = ref(false);
const isCommitted = ref(false);
const notice = ref('已排队一次 +1 更新：current 和屏幕计数仍为 0，候选目标为 1；下一单元是 Root。');

const pendingCount = computed(() => targetCount.value - currentCount.value);
const nextUnit = computed(() => units[processed.value] ?? null);
const canAdvance = computed(() => !isCommitted.value && nextUnit.value !== null);
const canCommit = computed(() => !isCommitted.value && processed.value === units.length);

function labelFor(unit, count) {
  if (unit.id === 'counter') return `Counter · state = ${count}`;
  if (unit.id === 'count-text') return `TEXT（计数）· "${count}"`;
  if (unit.id === 'button-text') return 'TEXT（按钮）· "+1"';
  return unit.name;
}

const currentNodes = computed(() => units.map(unit => ({
  ...unit,
  label: labelFor(unit, currentCount.value),
})));
const workNodes = computed(() => units.map((unit, index) => ({
  ...unit,
  label: labelFor(unit, targetCount.value),
  state: index < processed.value ? 'processed' : index === processed.value ? 'next' : 'pending',
  status: index < processed.value ? '已处理' : index === processed.value ? '下一单元' : '待处理',
})));

function advance() {
  if (!canAdvance.value) return;
  const unit = nextUnit.value;
  isPaused.value = false;
  processed.value++;
  const following = nextUnit.value
    ? `下一单元是 ${nextUnit.value.name}。`
    : '7 个单元全部处理完，等待手动 commit。';
  notice.value = `已处理 ${unit.name}。${unit.detail} ${following} current 和屏幕计数仍为 ${currentCount.value}。`;
}

function yieldWork() {
  if (!canAdvance.value || isPaused.value) return;
  isPaused.value = true;
  notice.value = `已让出主线程：保留 ${processed.value} / ${units.length} 的进度与下一单元 ${nextUnit.value.name}。current 和屏幕计数仍为 ${currentCount.value}；点击“处理下一个 Fiber”从这里继续，不重新计算。`;
}

function enqueueAndRestart() {
  const previousWasCommitted = isCommitted.value;
  // 新更新追加在原队列之后，目标不能从尚未变化的 current 简单重置为 current + 1。
  targetCount.value++;
  processed.value = 0;
  isPaused.value = false;
  isCommitted.value = false;
  const restart = previousWasCommitted ? '创建新候选树' : '放弃旧候选树并重新开始';
  notice.value = `追加一次 +1，pending 目标变为 ${targetCount.value}。${restart}：从已提交的 current = ${currentCount.value} 重算 ${pendingCount.value} 次更新，队列尚未消费；下一单元回到 Root，屏幕计数保持 ${currentCount.value}。`;
}

function commit() {
  if (!canCommit.value) return;
  const consumed = pendingCount.value;
  currentCount.value = targetCount.value;
  isCommitted.value = true;
  isPaused.value = false;
  notice.value = `commit 完成：候选树发布为 current，屏幕计数更新到 ${currentCount.value}；消费 ${consumed} 次 +1 更新，work 清空。可以追加新更新，或重置再次推演。`;
}

function reset() {
  currentCount.value = 0;
  targetCount.value = 1;
  processed.value = 0;
  isPaused.value = false;
  isCommitted.value = false;
  notice.value = '已重置：current 和屏幕计数为 0，已排队一次 +1，候选目标为 1；下一单元是 Root。';
}
</script>

<template>
  <section class="render-walkthrough fiber-walkthrough" aria-label="mini-react Fiber 工作循环的手动推演">
    <div class="walkthrough-heading">
      <span>一次 +1 更新，逐个处理 Fiber</span>
      <span class="walkthrough-caption">按 mini-react 源码手动推演</span>
    </div>
    <div class="fiber-intro">
      <p>这是教学状态机，不是实时监控或真实调度器。每次点击对应一次 <code>performUnit</code>；“已处理”表示该单元已执行，不代表真实 React 的 <code>completeWork</code>。推演将 commit 留给按钮观察，实际源码由 <code>performWork</code> 在整树完成后调用 <code>commitRoot</code>。</p>
      <p><code>child</code> 优先向下；没有子节点时找 <code>sibling</code>，找不到就沿 <code>parent</code> 返回，直到找到兄弟或回到根。</p>
    </div>
    <div class="fiber-toolbar">
      <dl class="fiber-metrics">
        <div><dt>current / DOM 计数</dt><dd>{{ currentCount }}</dd></div>
        <div><dt>pending 队列</dt><dd>{{ pendingCount }} 次 +1</dd></div>
        <div><dt>候选目标</dt><dd>{{ targetCount }}</dd></div>
        <div><dt>工作进度</dt><dd>{{ isCommitted ? '已提交' : `${processed} / ${units.length}` }}{{ isPaused ? ' · 已暂停' : '' }}</dd></div>
      </dl>
      <div class="walkthrough-controls fiber-controls" role="group" aria-label="控制 Fiber 推演">
        <button type="button" :disabled="!canAdvance" @click="advance">处理下一个 Fiber</button>
        <button type="button" :disabled="!canAdvance || isPaused" @click="yieldWork">让出主线程</button>
        <button type="button" @click="enqueueAndRestart">追加更新并重启</button>
        <button type="button" :disabled="!canCommit" @click="commit">commit · 发布 DOM</button>
        <button type="button" @click="reset">重置</button>
      </div>
    </div>
    <div class="fiber-board">
      <article class="fiber-tree fiber-tree-current" aria-label="current 已提交树">
        <h3>current · 已提交完整树</h3>
        <p class="fiber-tree-caption">render 和让出期间不变，只有 commit 才发布新值。</p>
        <ol class="fiber-nodes">
          <li v-for="unit in currentNodes" :key="unit.id" class="fiber-node" data-state="current"
            :style="{ '--fiber-depth': unit.depth }">
            <span class="fiber-node-label">{{ unit.label }}</span>
            <span class="fiber-node-state">已提交</span>
          </li>
        </ol>
      </article>
      <article class="fiber-tree" aria-label="work 候选树">
        <h3>work · {{ isCommitted ? '已清空' : '候选树' }}</h3>
        <p class="fiber-tree-caption">待处理行仅是固定示例的结构占位，并不表示整棵候选树已创建。</p>
        <p v-if="isCommitted" class="fiber-empty"><code>work = null</code>；等待下一次更新。</p>
        <ol v-else class="fiber-nodes">
          <li v-for="unit in workNodes" :key="unit.id" class="fiber-node" :data-state="unit.state"
            :style="{ '--fiber-depth': unit.depth }">
            <span class="fiber-node-label">{{ unit.label }}</span>
            <span class="fiber-node-state">{{ unit.status }}</span>
          </li>
        </ol>
      </article>
    </div>
    <p class="fiber-status" role="status" aria-live="polite" aria-atomic="true">{{ notice }}</p>
  </section>
</template>
