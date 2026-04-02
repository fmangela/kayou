<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  CARD_RARITY_OPTIONS,
  DECK_LIMIT,
  getCardRarityRank,
  resourceHints,
  type CardRarity,
  type DeckPreset,
} from '@kayou/shared';
import { useRouter } from 'vue-router';
import { mountCardStage } from '@/pixi/cardStage';
import { useGameSessionStore } from '@/stores/session';
import BattleTrainingPanel from '@/components/tower/TowerBattlePanel.vue';

const router = useRouter();
const session = useGameSessionStore();
const pixiHost = ref<HTMLElement | null>(null);
const activeTab = ref<'overview' | 'status' | 'deck' | 'tower'>('overview');
const selectedSlot = ref(1);
const rarityFilter = ref<'all' | CardRarity>('all');
const ownershipFilter = ref<'all' | 'owned' | 'missing'>('owned');
const sortBy = ref<'rarity' | 'level' | 'time'>('rarity');
const resourceDialog = reactive({
  visible: false,
  title: '',
  content: '',
});
const deckEditor = reactive({
  presetName: '默认出战',
  cardIds: [] as number[],
});
const collection = computed(() => session.collection);
const deckPresets = computed(() => session.deckPresets);
const profile = computed(() => session.profile);
const tower = computed(() => session.tower);
const rarityOptions = CARD_RARITY_OPTIONS;
const filteredCollection = computed(() => {
  return [...collection.value]
    .filter((card) => {
      if (rarityFilter.value !== 'all' && card.rarity !== rarityFilter.value) {
        return false;
      }

      if (ownershipFilter.value === 'owned') {
        return card.owned;
      }

      if (ownershipFilter.value === 'missing') {
        return !card.owned;
      }

      return true;
    })
    .sort((left, right) => {
      if (sortBy.value === 'level') {
        return (
          right.level - left.level ||
          getCardRarityRank(right.rarity) - getCardRarityRank(left.rarity)
        );
      }

      if (sortBy.value === 'time') {
        return (right.obtainedAt ?? '').localeCompare(left.obtainedAt ?? '');
      }

      return getCardRarityRank(right.rarity) - getCardRarityRank(left.rarity);
    });
});
const selectedCards = computed(() =>
  deckEditor.cardIds
    .map((cardId) => collection.value.find((card) => card.id === cardId))
    .filter((card): card is NonNullable<typeof card> => Boolean(card)),
);
const stageTitle = computed(() =>
  profile.value ? `${profile.value.username} 的出战大厅` : 'Kayou 战场'
);
const stageSubtitle = computed(() => {
  if (selectedCards.value.length === 0) {
    return '当前还没有装载卡组';
  }

  return selectedCards.value.map((card) => card.name).join(' / ');
});

let disposePixi: (() => void) | undefined;

function loadPreset(preset: DeckPreset | null) {
  if (!preset) {
    return;
  }

  selectedSlot.value = preset.slotIndex;
  deckEditor.presetName = preset.presetName;
  deckEditor.cardIds = [...preset.cardIds];
  session.usePreset(preset);
}

function toggleCard(cardId: number) {
  const card = collection.value.find((item) => item.id === cardId);

  if (!card?.owned) {
    ElMessage.warning('未拥有的卡牌暂时不能加入出战卡组');
    return;
  }

  if (deckEditor.cardIds.includes(cardId)) {
    deckEditor.cardIds = deckEditor.cardIds.filter((item) => item !== cardId);
    return;
  }

  if (deckEditor.cardIds.length >= DECK_LIMIT) {
    ElMessage.warning('最多选择4张出战卡牌');
    return;
  }

  deckEditor.cardIds = [...deckEditor.cardIds, cardId];
}

function openResourceHint(key: keyof typeof resourceHints, title: string) {
  resourceDialog.title = title;
  resourceDialog.content = resourceHints[key];
  resourceDialog.visible = true;
}

async function handleSaveDeck() {
  if (!selectedSlot.value) {
    ElMessage.warning('请先选择一个卡组预设');
    return;
  }

  if (deckEditor.cardIds.length !== DECK_LIMIT) {
    ElMessage.warning('出战卡组必须保存 4 张卡牌');
    return;
  }

  try {
    await session.saveDeck({
      slotIndex: selectedSlot.value,
      presetName: deckEditor.presetName.trim() || `预设 ${selectedSlot.value}`,
      cardIds: deckEditor.cardIds,
    });
    loadPreset(
      session.deckPresets.find((preset) => preset.slotIndex === selectedSlot.value) ?? null,
    );
    ElMessage.success('出战卡组已同步到后端');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存卡组失败');
  }
}

async function handleRefresh() {
  try {
    await session.fetchBootstrap();
    loadPreset(session.deckPresets.find((preset) => preset.isActive) ?? session.deckPresets[0] ?? null);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '刷新数据失败');
  }
}

onMounted(async () => {
  await session.initialize();

  if (!session.isAuthenticated) {
    void router.replace('/');
    return;
  }

  if (!session.bootstrap) {
    await handleRefresh();
  } else {
    loadPreset(session.deckPresets.find((preset) => preset.isActive) ?? session.deckPresets[0] ?? null);
  }
});

onBeforeUnmount(() => {
  disposePixi?.();
});

watch(
  [pixiHost, stageTitle, stageSubtitle],
  async () => {
    if (!pixiHost.value) {
      return;
    }

    disposePixi?.();
    disposePixi = await mountCardStage(pixiHost.value, {
      title: stageTitle.value,
      subtitle: stageSubtitle.value,
    });
  },
  {
    immediate: true,
  },
);

function handleLogout() {
  session.signOut();
  void router.push('/');
}
</script>

<template>
  <main class="game-shell">
    <section v-if="profile" class="dashboard-card">
      <header class="dashboard-header">
        <div>
          <p class="eyebrow">主界面</p>
          <h1>{{ profile.username }} 的出战大厅</h1>
          <p class="dashboard-copy">
            当前进度已接入人物状态、卡牌包、爬塔概览，以及大厅里的单局战斗训练入口。
          </p>
        </div>

        <div class="header-actions">
          <el-button plain @click="handleRefresh">刷新数据</el-button>
          <el-button plain @click="handleLogout">退出登录</el-button>
        </div>
      </header>

      <section class="resource-strip">
        <button class="resource-chip" type="button" @click="openResourceHint('stamina', '体力')">
          <span>体力</span>
          <strong>{{ profile.stamina }}</strong>
        </button>
        <button class="resource-chip" type="button" @click="openResourceHint('gold', '金币')">
          <span>金币</span>
          <strong>{{ profile.gold }}</strong>
        </button>
        <button class="resource-chip" type="button" @click="openResourceHint('diamonds', '钻石')">
          <span>钻石</span>
          <strong>{{ profile.diamonds }}</strong>
        </button>
        <button class="resource-chip" type="button" @click="openResourceHint('cardDust', '卡牌粉尘')">
          <span>粉尘</span>
          <strong>{{ profile.cardDust }}</strong>
        </button>
      </section>

      <nav class="bottom-nav">
        <button
          v-for="item in [
            ['overview', '总览'],
            ['status', '人物状态'],
            ['deck', '卡牌包'],
            ['tower', '单人爬塔'],
          ]"
          :key="item[0]"
          class="nav-button"
          :class="{ active: activeTab === item[0] }"
          type="button"
          @click="activeTab = item[0] as typeof activeTab"
        >
          {{ item[1] }}
        </button>
      </nav>

      <section v-if="activeTab === 'overview'" class="panel-stack">
        <el-card shadow="never">
          <template #header>快速概览</template>
          <div class="overview-grid">
            <div>
              <span class="metric-label">当前等级</span>
              <strong class="metric-value">Lv.{{ profile.level }}</strong>
              <el-progress
                :percentage="Math.min(100, Math.round((profile.experience / profile.nextLevelExperience) * 100))"
              />
            </div>
            <div>
              <span class="metric-label">总战力</span>
              <strong class="metric-value">{{ profile.totalPower }}</strong>
            </div>
            <div>
              <span class="metric-label">已收集卡牌</span>
              <strong class="metric-value">{{ profile.ownedCardCount }}</strong>
            </div>
            <div>
              <span class="metric-label">当前塔层</span>
              <strong class="metric-value">{{ profile.towerFloor }} / 40</strong>
            </div>
          </div>
        </el-card>

        <BattleTrainingPanel :token="session.token" />

        <el-card class="pixi-card" shadow="never">
          <template #header>PixiJS 战场预览</template>
          <div ref="pixiHost" class="pixi-host" />
        </el-card>
      </section>

      <section v-else-if="activeTab === 'status'" class="panel-stack">
        <el-card shadow="never">
          <template #header>人物状态</template>
          <div class="status-grid">
            <div class="status-block">
              <span class="metric-label">对战战绩</span>
              <strong class="metric-value">{{ profile.pvpWins }} 胜 / {{ profile.pvpLosses }} 负</strong>
            </div>
            <div class="status-block">
              <span class="metric-label">当前出战卡组</span>
              <ul class="deck-list">
                <li v-for="card in profile.activeDeck" :key="card.id">
                  <strong>{{ card.name }}</strong>
                  <span>{{ card.rarity }} / {{ card.element }} / x{{ card.multiplier }}</span>
                </li>
              </ul>
            </div>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header>成就统计</template>
          <ul class="achievement-list">
            <li v-for="item in profile.achievements" :key="item.key">
              <div>
                <strong>{{ item.label }}</strong>
                <span>{{ item.progressText }}</span>
              </div>
              <el-tag :type="item.completed ? 'success' : 'info'">
                {{ item.completed ? '已完成' : '进行中' }}
              </el-tag>
            </li>
          </ul>
        </el-card>
      </section>

      <section v-else-if="activeTab === 'deck'" class="panel-stack">
        <el-card shadow="never">
          <template #header>卡组预设</template>
          <div class="preset-toolbar">
            <div class="preset-list">
              <button
                v-for="preset in deckPresets"
                :key="preset.id"
                class="preset-button"
                :class="{ active: selectedSlot === preset.slotIndex }"
                type="button"
                @click="loadPreset(preset)"
              >
                {{ preset.presetName }}
              </button>
            </div>
            <el-input v-model="deckEditor.presetName" maxlength="20" placeholder="请输入预设名称" />
          </div>

          <div class="selected-deck">
            <span class="metric-label">当前编辑中的 4 张卡牌</span>
            <div class="selected-card-list">
              <button
                v-for="card in selectedCards"
                :key="card.id"
                class="selected-card"
                type="button"
                @click="toggleCard(card.id)"
              >
                {{ card.name }}
              </button>
            </div>
            <el-button type="primary" @click="handleSaveDeck">保存出战卡组</el-button>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header>卡牌包</template>
          <div class="deck-filters">
            <el-select v-model="rarityFilter">
              <el-option label="全部稀有度" value="all" />
              <el-option
                v-for="item in rarityOptions"
                :key="item.code"
                :label="item.label"
                :value="item.code"
              />
            </el-select>
            <el-select v-model="ownershipFilter">
              <el-option label="仅已拥有" value="owned" />
              <el-option label="全部卡牌" value="all" />
              <el-option label="仅未拥有" value="missing" />
            </el-select>
            <el-select v-model="sortBy">
              <el-option label="按稀有度" value="rarity" />
              <el-option label="按等级" value="level" />
              <el-option label="按获取时间" value="time" />
            </el-select>
          </div>

          <div class="card-grid">
            <button
              v-for="card in filteredCollection"
              :key="card.id"
              class="card-tile"
              :class="{
                selected: deckEditor.cardIds.includes(card.id),
                muted: !card.owned,
              }"
              type="button"
              @click="toggleCard(card.id)"
            >
              <span class="card-series">{{ card.series }}</span>
              <strong>{{ card.name }}</strong>
              <span>{{ card.rarity }} / {{ card.element }}</span>
              <span>倍率 x{{ card.multiplier }}</span>
              <span>{{ card.owned ? `数量 ${card.quantity}` : '未获取' }}</span>
            </button>
          </div>
        </el-card>
      </section>

      <section v-else class="panel-stack">
        <el-card shadow="never">
          <template #header>单人爬塔概览</template>
          <div class="tower-grid">
            <div class="tower-metric">
              <span class="metric-label">当前层数</span>
              <strong class="metric-value">{{ tower?.currentFloor }} / {{ tower?.maxFloor }}</strong>
            </div>
            <div class="tower-metric">
              <span class="metric-label">难度层级</span>
              <strong class="metric-value">第 {{ tower?.difficultyTier }} 阶段</strong>
            </div>
            <div class="tower-metric">
              <span class="metric-label">体力消耗</span>
              <strong class="metric-value">{{ tower?.staminaCost }}</strong>
            </div>
          </div>

          <p class="tower-copy">{{ tower?.negativeEffect }}</p>

          <div class="room-strip">
            <span v-for="room in tower?.availableRooms ?? []" :key="room" class="room-chip">
              {{ room }}
            </span>
          </div>
        </el-card>
      </section>
    </section>

    <el-dialog v-model="resourceDialog.visible" :title="resourceDialog.title" width="92%">
      <p>{{ resourceDialog.content }}</p>
    </el-dialog>
  </main>
</template>
