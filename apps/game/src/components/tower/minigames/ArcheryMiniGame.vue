<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { MiniGameGrade } from '@kayou/shared';

const props = defineProps<{
  title: string;
  difficulty: number;
  durationMs: number;
}>();

const emit = defineEmits<{
  complete: [payload: { score: number; grade: MiniGameGrade }];
}>();

const started = ref(false);
const completed = ref(false);
const markerPosition = ref(8);
const direction = ref(1);
const remainingMs = ref(props.durationMs);
const result = ref<{ score: number; grade: MiniGameGrade } | null>(null);

let movementTimer: number | null = null;
let countdownTimer: number | null = null;

const speedPerTick = computed(() => 1.6 + props.difficulty * 0.45);

function clearTimers() {
  if (movementTimer) {
    window.clearInterval(movementTimer);
    movementTimer = null;
  }

  if (countdownTimer) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function gradeFromScore(score: number): MiniGameGrade {
  if (score >= 90) {
    return 'perfect';
  }

  if (score >= 75) {
    return 'great';
  }

  if (score >= 55) {
    return 'good';
  }

  if (score >= 30) {
    return 'poor';
  }

  return 'miss';
}

function finish(score: number) {
  if (completed.value) {
    return;
  }

  clearTimers();
  completed.value = true;
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  result.value = {
    score: normalizedScore,
    grade: gradeFromScore(normalizedScore),
  };
  emit('complete', result.value);
}

function shoot() {
  if (!started.value || completed.value) {
    return;
  }

  const distanceFromCenter = Math.abs(markerPosition.value - 50);
  const difficultyPenalty = props.difficulty * 5;
  const score = 102 - distanceFromCenter * 2.1 - difficultyPenalty;

  finish(score);
}

function start() {
  if (started.value) {
    return;
  }

  started.value = true;
  remainingMs.value = props.durationMs;
  movementTimer = window.setInterval(() => {
    markerPosition.value += direction.value * speedPerTick.value;

    if (markerPosition.value >= 92) {
      markerPosition.value = 92;
      direction.value = -1;
    } else if (markerPosition.value <= 8) {
      markerPosition.value = 8;
      direction.value = 1;
    }
  }, 16);
  countdownTimer = window.setInterval(() => {
    remainingMs.value = Math.max(0, remainingMs.value - 100);

    if (remainingMs.value <= 0) {
      finish(0);
    }
  }, 100);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.code === 'Space') {
    event.preventDefault();

    if (!started.value) {
      start();
      return;
    }

    shoot();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleKeydown);
}

onBeforeUnmount(() => {
  clearTimers();

  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<template>
  <section class="mini-game-shell">
    <header class="mini-game-header">
      <div>
        <p class="eyebrow">射箭小游戏</p>
        <h4>{{ title }}</h4>
      </div>
      <strong>{{ (remainingMs / 1000).toFixed(1) }}s</strong>
    </header>

    <div class="archery-board">
      <div class="target target-outer" />
      <div class="target target-mid" />
      <div class="target target-inner" />
      <div class="target target-core" />
      <div class="marker" :style="{ left: `${markerPosition}%` }" />
    </div>

    <p class="mini-game-tip">
      难度 {{ difficulty }} 级。按空格或点击按钮在准星接近中心时出手。
    </p>

    <div class="mini-game-actions">
      <button v-if="!started" class="action-button primary" type="button" @click="start">
        开始瞄准
      </button>
      <button
        v-else-if="!completed"
        class="action-button primary"
        type="button"
        @click="shoot"
      >
        立刻射击
      </button>
      <div v-else class="mini-game-result">
        <strong>{{ result?.score }} 分</strong>
        <span>{{ result?.grade }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mini-game-shell {
  display: grid;
  gap: 16px;
}

.mini-game-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #7b5233;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h4 {
  margin: 0;
  font-size: 18px;
}

.archery-board {
  position: relative;
  overflow: hidden;
  min-height: 140px;
  border: 1px solid rgba(139, 79, 30, 0.16);
  border-radius: 24px;
  background:
    radial-gradient(circle at center, #fff5d7 0%, #ffe0b6 32%, #d36d2a 33%, #d36d2a 40%, #6b2f17 41%, #6b2f17 48%, #f8e8cb 49%, #f8e8cb 100%);
}

.target {
  position: absolute;
  inset: 50% auto auto 50%;
  translate: -50% -50%;
  border-radius: 999px;
}

.target-outer {
  width: 120px;
  height: 120px;
  background: rgba(255, 243, 220, 0.35);
}

.target-mid {
  width: 82px;
  height: 82px;
  background: rgba(215, 107, 44, 0.52);
}

.target-inner {
  width: 48px;
  height: 48px;
  background: rgba(107, 47, 23, 0.78);
}

.target-core {
  width: 18px;
  height: 18px;
  background: #fff6da;
}

.marker {
  position: absolute;
  top: 18px;
  bottom: 18px;
  width: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg, #17223b, #284166);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35);
}

.mini-game-tip {
  margin: 0;
  color: #5c4c42;
}

.mini-game-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.action-button {
  border: 0;
  border-radius: 999px;
  padding: 12px 18px;
  font: inherit;
  cursor: pointer;
}

.primary {
  background: #1e4d72;
  color: #fff8ea;
}

.mini-game-result {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #1e4d72;
}
</style>
