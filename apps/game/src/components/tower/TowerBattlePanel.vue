<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type {
  MiniGameGrade,
  TowerBattleCardSnapshot,
  TowerBattleSnapshot,
  TowerBattleTurnResultInput,
} from '@kayou/shared';
import { apiRequest } from '@/api/client';
import ArcheryMiniGame from './minigames/ArcheryMiniGame.vue';
import CatchMiniGame from './minigames/CatchMiniGame.vue';

const props = defineProps<{
  token: string;
}>();

const battle = ref<TowerBattleSnapshot | null>(null);
const loading = ref(false);
const currentTaskIndex = ref(0);
const stagedResults = ref<TowerBattleTurnResultInput[]>([]);
const taskRunKey = ref(0);

const currentTask = computed(() => battle.value?.nextTasks[currentTaskIndex.value] ?? null);
const currentMiniGame = computed(() => {
  if (!currentTask.value) {
    return null;
  }

  return currentTask.value.miniGameType === 'archery' ? ArcheryMiniGame : CatchMiniGame;
});
const phaseReady = computed(() => {
  return (
    battle.value?.status === 'in_progress' &&
    stagedResults.value.length === (battle.value.nextTasks.length || 0) &&
    battle.value.nextTasks.length > 0
  );
});

function roleLabel(value: TowerBattleSnapshot['playerRole']) {
  if (value === 'attack') {
    return '我方进攻';
  }

  if (value === 'defense') {
    return '我方防守';
  }

  return '已结束';
}

function miniGameLabel(value: TowerBattleSnapshot['nextMiniGameType']) {
  if (value === 'archery') {
    return '射箭';
  }

  if (value === 'catch') {
    return '接球';
  }

  return '无';
}

function gradeLabel(value: MiniGameGrade) {
  return {
    miss: '失误',
    poor: '一般',
    good: '良好',
    great: '很棒',
    perfect: '完美',
  }[value];
}

function getStagedResult(slotIndex: number) {
  return stagedResults.value.find((item) => item.slotIndex === slotIndex) ?? null;
}

function hpRatio(card: TowerBattleCardSnapshot) {
  if (card.maxHp <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((card.currentHp / card.maxHp) * 100)));
}

function resetPhaseProgress() {
  stagedResults.value = [];
  currentTaskIndex.value = 0;
  taskRunKey.value += 1;
}

async function startBattle() {
  if (!props.token) {
    ElMessage.warning('登录状态已失效，请重新登录');
    return;
  }

  loading.value = true;

  try {
    battle.value = await apiRequest<TowerBattleSnapshot>('/battle/tower/start', {
      method: 'POST',
      token: props.token,
      body: {},
    });
    resetPhaseProgress();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '开始测试战斗失败');
  } finally {
    loading.value = false;
  }
}

async function submitTurn() {
  if (!battle.value || battle.value.status !== 'in_progress') {
    return;
  }

  if (!phaseReady.value) {
    ElMessage.warning('请先完成当前阶段的 4 个小游戏');
    return;
  }

  loading.value = true;

  try {
    battle.value = await apiRequest<TowerBattleSnapshot>('/battle/tower/turn', {
      method: 'POST',
      token: props.token,
      body: {
        battleId: battle.value.battleId,
        results: stagedResults.value,
      },
    });
    resetPhaseProgress();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '提交阶段结算失败');
  } finally {
    loading.value = false;
  }
}

function recordMiniGameResult(payload: { score: number; grade: MiniGameGrade }) {
  if (!currentTask.value) {
    return;
  }

  stagedResults.value = [
    ...stagedResults.value.filter((item) => item.slotIndex !== currentTask.value!.slotIndex),
    {
      slotIndex: currentTask.value.slotIndex,
      score: payload.score,
      grade: payload.grade,
    },
  ].sort((left, right) => left.slotIndex - right.slotIndex);

  const nextIndex = battle.value?.nextTasks.findIndex(
    (task) => !stagedResults.value.some((item) => item.slotIndex === task.slotIndex),
  );

  if (typeof nextIndex === 'number' && nextIndex >= 0) {
    currentTaskIndex.value = nextIndex;
  }

  taskRunKey.value += 1;
}
</script>

<template>
  <section class="tower-battle-panel">
    <header class="battle-header">
      <div>
        <p class="eyebrow">测试战斗</p>
        <h3>四槽位爬塔对局</h3>
        <p class="battle-copy">
          当前版本已接上 4 张测试卡、4 槽位代理判定、攻守互换和射箭/接球小游戏。
          这里是开发测试模式，不消耗体力，也不会推进真实塔层。
        </p>
      </div>

      <div class="battle-actions">
        <el-button type="primary" :loading="loading" @click="startBattle">
          {{ battle ? '重新开始测试战斗' : '开始测试战斗' }}
        </el-button>
        <el-button
          v-if="battle?.status === 'in_progress' && stagedResults.length > 0"
          plain
          @click="resetPhaseProgress"
        >
          重置本阶段
        </el-button>
      </div>
    </header>

    <div v-if="battle" class="battle-layout">
      <div class="battle-status">
        <el-tag type="warning">第 {{ battle.floor }} 层测试</el-tag>
        <el-tag>{{ roleLabel(battle.playerRole) }}</el-tag>
        <el-tag type="success">第 {{ battle.round }} 回合 / 第 {{ battle.phase }} 阶段</el-tag>
        <el-tag type="info">小游戏：{{ miniGameLabel(battle.nextMiniGameType) }}</el-tag>
      </div>

      <div class="battle-teams">
        <section class="team-panel">
          <header>
            <strong>我方阵容</strong>
            <span>总生命 {{ battle.player.totalHp }} / 存活 {{ battle.player.aliveCount }}</span>
          </header>
          <article
            v-for="card in battle.player.cards"
            :key="`player-${card.slotIndex}`"
            class="slot-card"
            :class="{ defeated: card.isKnockedOut }"
          >
            <div class="slot-head">
              <strong>槽位 {{ card.slotIndex }} · {{ card.name }}</strong>
              <span>{{ card.rarity }} / {{ card.primarySkillName }}</span>
            </div>
            <div class="hp-track">
              <span class="hp-fill" :style="{ width: `${hpRatio(card)}%` }" />
            </div>
            <div class="slot-meta">
              <span>HP {{ card.currentHp }} / {{ card.maxHp }}</span>
              <span>护盾 {{ card.shield }}</span>
              <span>{{ card.isKnockedOut ? '已倒下' : '可战斗' }}</span>
            </div>
            <div v-if="card.statuses.length > 0" class="status-strip">
              <span v-for="status in card.statuses" :key="status.key" class="status-chip">
                {{ status.label }} {{ status.remainingPhases }}
              </span>
            </div>
          </article>
        </section>

        <section class="team-panel enemy">
          <header>
            <strong>敌方阵容</strong>
            <span>总生命 {{ battle.enemy.totalHp }} / 存活 {{ battle.enemy.aliveCount }}</span>
          </header>
          <article
            v-for="card in battle.enemy.cards"
            :key="`enemy-${card.slotIndex}`"
            class="slot-card"
            :class="{ defeated: card.isKnockedOut }"
          >
            <div class="slot-head">
              <strong>槽位 {{ card.slotIndex }} · {{ card.name }}</strong>
              <span>{{ card.rarity }} / {{ card.primarySkillName }}</span>
            </div>
            <div class="hp-track enemy-track">
              <span class="hp-fill" :style="{ width: `${hpRatio(card)}%` }" />
            </div>
            <div class="slot-meta">
              <span>HP {{ card.currentHp }} / {{ card.maxHp }}</span>
              <span>护盾 {{ card.shield }}</span>
              <span>{{ card.isKnockedOut ? '已倒下' : '可战斗' }}</span>
            </div>
            <div v-if="card.statuses.length > 0" class="status-strip">
              <span v-for="status in card.statuses" :key="status.key" class="status-chip enemy-chip">
                {{ status.label }} {{ status.remainingPhases }}
              </span>
            </div>
          </article>
        </section>
      </div>

      <section v-if="battle.status === 'in_progress'" class="phase-panel">
        <header class="phase-header">
          <div>
            <strong>当前阶段小游戏</strong>
            <p>{{ currentTask?.instruction }}</p>
          </div>
          <span>
            已完成 {{ stagedResults.length }} / {{ battle.nextTasks.length }}
          </span>
        </header>

        <div class="task-strip">
          <button
            v-for="(task, index) in battle.nextTasks"
            :key="task.slotIndex"
            class="task-chip"
            :class="{
              active: currentTaskIndex === index,
              done: Boolean(getStagedResult(task.slotIndex)),
            }"
            type="button"
            :disabled="loading || (index > currentTaskIndex && !getStagedResult(task.slotIndex))"
            @click="
              currentTaskIndex = index;
              taskRunKey += 1;
            "
          >
            {{ task.slotIndex }} 号槽
          </button>
        </div>

        <div v-if="currentTask && currentMiniGame" class="current-task">
          <div class="task-meta">
            <span>代理槽位：{{ currentTask.actingSlotIndex ?? '无' }}</span>
            <span>对位槽位：{{ currentTask.targetSlotIndex ?? '无' }}</span>
            <span>难度 {{ currentTask.difficulty }}</span>
            <span>{{ currentTask.actorCardName ?? '无人可代理' }}</span>
          </div>

          <component
            :is="currentMiniGame"
            :key="`${battle.battleId}-${battle.round}-${battle.phase}-${currentTask.slotIndex}-${taskRunKey}`"
            :title="`${miniGameLabel(currentTask.miniGameType)} · ${currentTask.actorCardName ?? '空位判定'}`"
            :difficulty="currentTask.difficulty"
            :duration-ms="currentTask.durationMs"
            @complete="recordMiniGameResult"
          />
        </div>

        <div class="staged-grid">
          <article v-for="task in battle.nextTasks" :key="`stage-${task.slotIndex}`" class="staged-card">
            <strong>槽位 {{ task.slotIndex }}</strong>
            <template v-if="getStagedResult(task.slotIndex)">
              <span>{{ getStagedResult(task.slotIndex)?.score }} 分</span>
              <span>{{ gradeLabel(getStagedResult(task.slotIndex)!.grade) }}</span>
            </template>
            <span v-else>等待游玩</span>
          </article>
        </div>

        <el-button type="primary" :loading="loading" :disabled="!phaseReady" @click="submitTurn">
          提交本阶段判定
        </el-button>
      </section>

      <section v-else class="battle-finished" :class="battle.status">
        <strong>{{ battle.status === 'won' ? '测试战斗胜利' : '测试战斗结束' }}</strong>
        <p>
          {{ battle.status === 'won'
            ? '这一版会保留战斗过程，但不会改动真实塔层和体力。'
            : '可以直接重新开始，再继续调试卡组、技能和小游戏手感。' }}
        </p>
      </section>

      <section v-if="battle.recentSummary" class="settlement-panel">
        <header>
          <strong>最近一次阶段结算</strong>
          <span>
            第 {{ battle.recentSummary.round }} 回合 / {{ battle.recentSummary.phase }} 阶段
          </span>
        </header>

        <article
          v-for="slot in battle.recentSummary.slotResults"
          :key="`summary-${slot.slotIndex}`"
          class="summary-card"
        >
          <div class="summary-head">
            <strong>槽位 {{ slot.slotIndex }}</strong>
            <span>{{ gradeLabel(slot.grade) }} / {{ slot.score }} 分</span>
          </div>
          <p>{{ slot.note }}</p>
          <div class="summary-meta">
            <span>伤害 {{ slot.damage }}</span>
            <span>目标剩余 {{ slot.targetRemainingHp ?? '-' }}</span>
            <span v-if="slot.specialEvent">{{ slot.specialEvent }}</span>
          </div>
        </article>
      </section>

      <section class="feed-panel">
        <header>
          <strong>战斗播报</strong>
        </header>
        <p v-for="(line, index) in battle.feed" :key="`${index}-${line}`" class="feed-line">
          {{ line }}
        </p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.tower-battle-panel {
  display: grid;
  gap: 18px;
}

.battle-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #7b5233;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h3 {
  margin: 0;
  font-size: 24px;
}

.battle-copy {
  max-width: 680px;
  margin: 8px 0 0;
  color: #5f5449;
  line-height: 1.65;
}

.battle-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.battle-layout {
  display: grid;
  gap: 18px;
}

.battle-status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.battle-teams {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.team-panel,
.phase-panel,
.settlement-panel,
.feed-panel,
.battle-finished {
  border: 1px solid rgba(42, 39, 37, 0.08);
  border-radius: 24px;
  background: rgba(255, 252, 246, 0.94);
  padding: 18px;
}

.team-panel header,
.phase-header,
.settlement-panel header,
.feed-panel header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.team-panel header span,
.phase-header p,
.settlement-panel header span {
  color: #655b51;
}

.enemy {
  background:
    linear-gradient(180deg, rgba(253, 248, 246, 0.98), rgba(253, 243, 240, 0.98));
}

.slot-card {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(42, 39, 37, 0.08);
  border-radius: 18px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.8);
}

.slot-card + .slot-card {
  margin-top: 10px;
}

.slot-card.defeated {
  opacity: 0.62;
}

.slot-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
}

.hp-track {
  overflow: hidden;
  height: 10px;
  border-radius: 999px;
  background: rgba(28, 93, 53, 0.12);
}

.enemy-track {
  background: rgba(143, 54, 44, 0.12);
}

.hp-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #1f7a45, #5dc56d);
}

.slot-meta,
.task-meta,
.summary-meta,
.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: #5f5449;
}

.status-chip {
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(243, 183, 71, 0.16);
  color: #7a5319;
  font-size: 13px;
}

.enemy-chip {
  background: rgba(201, 87, 53, 0.14);
  color: #933d20;
}

.task-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.task-chip {
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  background: rgba(32, 85, 121, 0.1);
  color: #1e4d72;
  cursor: pointer;
}

.task-chip.active {
  background: #1e4d72;
  color: #fff8ea;
}

.task-chip.done {
  background: rgba(44, 132, 83, 0.14);
  color: #1f7a45;
}

.task-chip:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.current-task {
  display: grid;
  gap: 14px;
}

.staged-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 16px 0;
}

.staged-card,
.summary-card {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(42, 39, 37, 0.08);
  border-radius: 18px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.82);
}

.summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.summary-card p {
  margin: 0;
  line-height: 1.6;
  color: #50473f;
}

.battle-finished {
  background:
    linear-gradient(135deg, rgba(255, 248, 232, 0.96), rgba(250, 236, 215, 0.96));
}

.battle-finished.won {
  background:
    linear-gradient(135deg, rgba(241, 255, 244, 0.96), rgba(224, 248, 232, 0.96));
}

.battle-finished p {
  margin: 8px 0 0;
  color: #5c4f47;
}

.feed-line {
  margin: 0;
  line-height: 1.65;
  color: #4f4640;
}

.feed-line + .feed-line {
  margin-top: 8px;
}

@media (max-width: 900px) {
  .battle-header,
  .battle-teams,
  .phase-header,
  .settlement-panel header {
    grid-template-columns: 1fr;
  }

  .battle-header,
  .phase-header,
  .settlement-panel header {
    display: grid;
  }

  .battle-teams,
  .staged-grid {
    grid-template-columns: 1fr;
  }

  .battle-actions {
    justify-content: flex-start;
  }
}
</style>
