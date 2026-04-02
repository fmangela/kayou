<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { MiniGameGrade } from '@kayou/shared';

interface FallingBall {
  id: number;
  x: number;
  y: number;
  speed: number;
}

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
const remainingMs = ref(props.durationMs);
const basketX = ref(50);
const catches = ref(0);
const misses = ref(0);
const balls = ref<FallingBall[]>([]);
const result = ref<{ score: number; grade: MiniGameGrade } | null>(null);

let spawnTimer: number | null = null;
let tickTimer: number | null = null;
let countdownTimer: number | null = null;
let nextBallId = 1;

const basketWidth = computed(() => Math.max(16, 30 - props.difficulty * 3));

function clearTimers() {
  if (spawnTimer) {
    window.clearInterval(spawnTimer);
    spawnTimer = null;
  }

  if (tickTimer) {
    window.clearInterval(tickTimer);
    tickTimer = null;
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

function finish() {
  if (completed.value) {
    return;
  }

  clearTimers();
  completed.value = true;
  const score = Math.max(
    0,
    Math.min(100, Math.round(catches.value * 20 - misses.value * 6 + 28 - props.difficulty * 4)),
  );

  result.value = {
    score,
    grade: gradeFromScore(score),
  };
  emit('complete', result.value);
}

function moveBasket(nextX: number) {
  basketX.value = Math.max(10, Math.min(90, nextX));
}

function handleBoardMove(event: PointerEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null;

  if (!currentTarget) {
    return;
  }

  const rect = currentTarget.getBoundingClientRect();
  const relativeX = ((event.clientX - rect.left) / rect.width) * 100;
  moveBasket(relativeX);
}

function start() {
  if (started.value) {
    return;
  }

  started.value = true;
  remainingMs.value = props.durationMs;
  catches.value = 0;
  misses.value = 0;
  balls.value = [];
  spawnTimer = window.setInterval(() => {
    balls.value = [
      ...balls.value,
      {
        id: nextBallId,
        x: Math.round(12 + Math.random() * 76),
        y: 0,
        speed: 2 + props.difficulty * 0.6 + Math.random() * 1.2,
      },
    ];
    nextBallId += 1;
  }, Math.max(260, 760 - props.difficulty * 90));
  tickTimer = window.setInterval(() => {
    const nextBalls: FallingBall[] = [];

    for (const ball of balls.value) {
      const nextY = ball.y + ball.speed;

      if (nextY >= 88) {
        const isCaught = Math.abs(ball.x - basketX.value) <= basketWidth.value / 2;

        if (isCaught) {
          catches.value += 1;
        } else {
          misses.value += 1;
        }

        continue;
      }

      nextBalls.push({
        ...ball,
        y: nextY,
      });
    }

    balls.value = nextBalls;
  }, 40);
  countdownTimer = window.setInterval(() => {
    remainingMs.value = Math.max(0, remainingMs.value - 100);

    if (remainingMs.value <= 0) {
      finish();
    }
  }, 100);
}

onBeforeUnmount(() => {
  clearTimers();
});
</script>

<template>
  <section class="mini-game-shell">
    <header class="mini-game-header">
      <div>
        <p class="eyebrow">接球小游戏</p>
        <h4>{{ title }}</h4>
      </div>
      <strong>{{ (remainingMs / 1000).toFixed(1) }}s</strong>
    </header>

    <div class="catch-board" @pointermove="handleBoardMove" @pointerdown="handleBoardMove">
      <div
        v-for="ball in balls"
        :key="ball.id"
        class="ball"
        :style="{ left: `${ball.x}%`, top: `${ball.y}%` }"
      />
      <div class="basket" :style="{ left: `${basketX}%`, width: `${basketWidth}%` }" />
    </div>

    <div class="mini-game-stats">
      <span>接住 {{ catches }}</span>
      <span>漏掉 {{ misses }}</span>
      <span>难度 {{ difficulty }}</span>
    </div>

    <div class="mini-game-actions">
      <button v-if="!started" class="action-button primary" type="button" @click="start">
        开始接球
      </button>
      <div v-else-if="!completed" class="adjuster-row">
        <button class="action-button plain" type="button" @click="moveBasket(basketX - 10)">
          向左
        </button>
        <button class="action-button plain" type="button" @click="moveBasket(basketX + 10)">
          向右
        </button>
      </div>
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
  color: #28546c;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h4 {
  margin: 0;
  font-size: 18px;
}

.catch-board {
  position: relative;
  overflow: hidden;
  min-height: 170px;
  border: 1px solid rgba(25, 86, 119, 0.16);
  border-radius: 24px;
  background:
    linear-gradient(180deg, #e8f7ff 0%, #ccecff 45%, #9ed7e7 46%, #8bc3d3 100%);
}

.ball {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, #fffef9, #d66c2a 68%, #8d3d18 100%);
  transform: translate(-50%, -50%);
}

.basket {
  position: absolute;
  bottom: 12px;
  height: 14px;
  border-radius: 999px;
  background: #174c6f;
  transform: translateX(-50%);
}

.mini-game-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: #4b5b66;
}

.mini-game-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.adjuster-row {
  display: flex;
  gap: 10px;
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

.plain {
  background: rgba(23, 76, 111, 0.12);
  color: #1e4d72;
}

.mini-game-result {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #1e4d72;
}
</style>
