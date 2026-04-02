<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  CARD_RARITY_OPTIONS,
  CARD_RELATION_EFFECT_OPTIONS,
  CARD_RELATION_TRIGGER_OPTIONS,
  CARD_SKILL_TYPE_OPTIONS,
  type CardCatalogItem,
  type CardRelationEffectType,
  type CardRelationTriggerType,
  type CardSkillType,
  type JsonValue,
} from '@kayou/shared';
import { useRouter } from 'vue-router';
import {
  type CardBatchImportReport,
  type CardImageConversionReport,
  useAdminSessionStore,
} from '@/stores/session';

interface EditableSkill {
  skillCode: string;
  sortIndex: number;
  name: string;
  type: CardSkillType;
  description: string;
  valueText: string;
  triggerCondition: string;
  targetSkillCode: string | null;
  isHidden: boolean;
  isEnabled: boolean;
}

interface EditableRelation {
  relationCode: string;
  name: string;
  triggerType: CardRelationTriggerType;
  triggerDescription: string;
  effectType: CardRelationEffectType;
  effectDescription: string;
  effectPayload: JsonValue | null;
  targetSkillCode: string | null;
  memberCardCodes: string[];
  canStack: boolean;
  isEnabled: boolean;
}

const router = useRouter();
const session = useAdminSessionStore();
const keyword = ref('');
const cardKeyword = ref('');
const cardImportInput = ref<HTMLInputElement | null>(null);
const metrics = computed(() => [
  {
    label: '玩家账号',
    value: session.players.length,
    copy: '当前后台可直接检索玩家账号并查看基础数值。',
  },
  {
    label: '基础配置',
    value: session.configs.length,
    copy: '基础数值已支持读取与写回数据库。',
  },
  {
    label: '卡牌模板',
    value: session.cards.length,
    copy: '卡牌基础属性、技能和关系技能已归档到统一框架。',
  },
]);
const filteredCards = computed(() => {
  const search = cardKeyword.value.trim().toLowerCase();

  if (!search) {
    return session.cards;
  }

  return session.cards.filter((card) =>
    [card.code, card.name, card.series, card.camp, card.attribute]
      .join(' ')
      .toLowerCase()
      .includes(search),
  );
});
const configDialog = reactive({
  visible: false,
  key: '',
  description: '',
  valueText: '',
});
const imageTool = reactive<{
  running: boolean;
  lastReport: CardImageConversionReport | null;
}>({
  running: false,
  lastReport: null,
});
const cardImportTool = reactive<{
  running: boolean;
  lastReport: CardBatchImportReport | null;
}>({
  running: false,
  lastReport: null,
});
const cardDialog = reactive({
  visible: false,
  mode: 'create' as 'create' | 'update',
  cardId: 0,
  code: '',
  name: '',
  rarity: 'N' as CardCatalogItem['rarity'],
  series: '',
  camp: '中立',
  attribute: '无',
  story: '',
  imageUrl: '',
  multiplier: 1,
  enabled: true,
  stats: {
    force: 60,
    intelligence: 60,
    defense: 60,
    speed: 60,
    spirit: 60,
    vitality: 60,
  },
  skillsText: '[]',
  relationsText: '[]',
});

function createDefaultSkills() {
  return [
    {
      skillCode: '',
      sortIndex: 1,
      name: '待配置技能',
      type: 'active' as CardSkillType,
      description: '当前卡牌尚未配置具体技能效果。',
      valueText: '待补充',
      triggerCondition: '',
      targetSkillCode: null,
      isHidden: false,
      isEnabled: true,
    },
  ];
}

function resetCardDialog() {
  cardDialog.mode = 'create';
  cardDialog.cardId = 0;
  cardDialog.code = '';
  cardDialog.name = '';
  cardDialog.rarity = 'N';
  cardDialog.series = '';
  cardDialog.camp = '中立';
  cardDialog.attribute = '无';
  cardDialog.story = '';
  cardDialog.imageUrl = '';
  cardDialog.multiplier = 1;
  cardDialog.enabled = true;
  cardDialog.stats = {
    force: 60,
    intelligence: 60,
    defense: 60,
    speed: 60,
    spirit: 60,
    vitality: 60,
  };
  cardDialog.skillsText = JSON.stringify(createDefaultSkills(), null, 2);
  cardDialog.relationsText = JSON.stringify([], null, 2);
}

function mapSkillsForEditor(card: CardCatalogItem): EditableSkill[] {
  return card.skills.map((skill) => ({
    skillCode: skill.skillCode,
    sortIndex: skill.sortIndex,
    name: skill.name,
    type: skill.type,
    description: skill.description,
    valueText: skill.valueText,
    triggerCondition: skill.triggerCondition,
    targetSkillCode: skill.targetSkillCode,
    isHidden: skill.isHidden,
    isEnabled: skill.isEnabled,
  }));
}

function mapRelationsForEditor(card: CardCatalogItem): EditableRelation[] {
  return card.relations.map((relation) => ({
    relationCode: relation.relationCode,
    name: relation.name,
    triggerType: relation.triggerType,
    triggerDescription: relation.triggerDescription,
    effectType: relation.effectType,
    effectDescription: relation.effectDescription,
    effectPayload: relation.effectPayload,
    targetSkillCode: relation.targetSkillCode,
    memberCardCodes: relation.members.map((member) => member.code),
    canStack: relation.canStack,
    isEnabled: relation.isEnabled,
  }));
}

onMounted(async () => {
  await session.initialize();

  if (!session.isAuthenticated) {
    void router.replace('/');
    return;
  }

  if (!session.bootstrap) {
    await session.fetchBootstrap();
  }

  resetCardDialog();
});

async function handleSearch() {
  try {
    await session.searchPlayers(keyword.value.trim());
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '玩家检索失败');
  }
}

function openConfigEditor(config: (typeof session.configs)[number]) {
  configDialog.key = config.key;
  configDialog.description = config.description;
  configDialog.valueText = JSON.stringify(config.value, null, 2);
  configDialog.visible = true;
}

async function handleConfigSave() {
  try {
    await session.updateConfig({
      key: configDialog.key,
      description: configDialog.description,
      value: JSON.parse(configDialog.valueText),
    });
    configDialog.visible = false;
    ElMessage.success('基础配置已更新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '配置保存失败');
  }
}

function openCreateCard() {
  resetCardDialog();
  cardDialog.visible = true;
}

function openCardEditor(card: CardCatalogItem) {
  cardDialog.mode = 'update';
  cardDialog.cardId = card.id;
  cardDialog.code = card.code;
  cardDialog.name = card.name;
  cardDialog.rarity = card.rarity;
  cardDialog.series = card.series;
  cardDialog.camp = card.camp;
  cardDialog.attribute = card.attribute;
  cardDialog.story = card.story;
  cardDialog.imageUrl = card.imageUrl;
  cardDialog.multiplier = card.multiplier;
  cardDialog.enabled = card.enabled;
  cardDialog.stats = { ...card.stats };
  cardDialog.skillsText = JSON.stringify(mapSkillsForEditor(card), null, 2);
  cardDialog.relationsText = JSON.stringify(mapRelationsForEditor(card), null, 2);
  cardDialog.visible = true;
}

function parseEditorArray<T>(raw: string, fallbackLabel: string): T[] {
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`${fallbackLabel}必须是 JSON 数组`);
  }

  return parsed as T[];
}

function escapeCsvCell(value: string) {
  if (/["\r\n,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function buildCardImportTemplateCsv() {
  const headers = [
    'code',
    'name',
    'rarity',
    'series',
    'camp',
    'attribute',
    'force',
    'intelligence',
    'defense',
    'speed',
    'spirit',
    'vitality',
    'story',
    'imageUrl',
    'multiplier',
    'enabled',
    'skillsJson',
    'relationsJson',
  ];
  const sampleSkills = JSON.stringify([
    {
      skillCode: '',
      sortIndex: 1,
      name: '待配置技能',
      type: 'active',
      description: '当前卡牌尚未配置具体技能效果。',
      valueText:
        '{"effects":[{"type":"modify_damage","target":"self","mode":"multiply","value":1.15}]}',
      triggerCondition:
        '{"phases":["after_minigame"],"maxTriggersPerRound":1}',
      targetSkillCode: null,
      isHidden: false,
      isEnabled: true,
    },
  ]);
  const sampleRelations = JSON.stringify([]);
  const sampleRow = [
    'SG-1-0001',
    '诸葛亮',
    'SSR',
    '三国系列',
    '蜀国',
    '火',
    '82',
    '98',
    '71',
    '88',
    '95',
    '84',
    '蜀汉丞相，善于谋略与控场，作为模板示例保留。',
    '/assets/cards/zhuge-liang.webp',
    '1.35',
    '1',
    sampleSkills,
    sampleRelations,
  ];

  return [headers, sampleRow]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\r\n');
}

function downloadCardImportTemplate() {
  const blob = new Blob([`\uFEFF${buildCardImportTemplateCsv()}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = 'card_import_template.csv';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openCardImportPicker() {
  cardImportInput.value?.click();
}

async function handleCardSave() {
  try {
    const skills = parseEditorArray<EditableSkill>(cardDialog.skillsText, '技能列表');
    const relations = parseEditorArray<EditableRelation>(cardDialog.relationsText, '关系技能列表');
    const primarySkill = skills[0];
    const payload: CardCatalogItem = {
      id: cardDialog.cardId,
      code: cardDialog.code.trim(),
      name: cardDialog.name.trim(),
      rarity: cardDialog.rarity,
      series: cardDialog.series.trim(),
      camp: cardDialog.camp.trim(),
      attribute: cardDialog.attribute.trim(),
      element: cardDialog.attribute.trim(),
      stats: { ...cardDialog.stats },
      story: cardDialog.story.trim(),
      imageUrl: cardDialog.imageUrl.trim(),
      multiplier: Number(cardDialog.multiplier),
      enabled: cardDialog.enabled,
      primarySkillName: primarySkill?.name ?? '待配置技能',
      primarySkillDescription:
        primarySkill?.description ?? '当前卡牌尚未配置具体技能效果。',
      skills: skills.map((skill, index) => ({
        id: index + 1,
        skillCode: skill.skillCode?.trim() || `${cardDialog.code.trim()}-S${skill.sortIndex}`,
        sortIndex: skill.sortIndex,
        name: skill.name.trim(),
        type: skill.type,
        description: skill.description.trim(),
        valueText: skill.valueText?.trim() ?? '',
        triggerCondition: skill.triggerCondition?.trim() ?? '',
        targetSkillCode: skill.targetSkillCode?.trim() || null,
        isHidden: Boolean(skill.isHidden),
        isEnabled: skill.isEnabled ?? true,
      })),
      relations: relations.map((relation, index) => ({
        id: index + 1,
        relationCode:
          relation.relationCode?.trim() || `${cardDialog.code.trim()}-R${index + 1}`,
        name: relation.name.trim(),
        triggerType: relation.triggerType,
        triggerDescription: relation.triggerDescription.trim(),
        effectType: relation.effectType,
        effectDescription: relation.effectDescription.trim(),
        effectPayload: relation.effectPayload ?? null,
        targetSkillCode: relation.targetSkillCode?.trim() || null,
        canStack: relation.canStack ?? true,
        isEnabled: relation.isEnabled ?? true,
        members: relation.memberCardCodes.map((code) => ({
          id: 0,
          code: code.trim(),
          name: code.trim(),
        })),
      })),
      createdAt: '',
      updatedAt: '',
    };

    await session.saveCard(payload, cardDialog.mode);
    cardDialog.visible = false;
    ElMessage.success(cardDialog.mode === 'create' ? '卡牌框架已创建' : '卡牌配置已更新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '卡牌保存失败');
  }
}

async function handleConvertCardImages() {
  imageTool.running = true;

  try {
    const report = await session.convertCardImages();
    imageTool.lastReport = report;

    if (!report) {
      ElMessage.error('当前未登录，无法执行转换');
      return;
    }

    if (report.failures.length > 0) {
      ElMessage.warning(
        `转换完成，成功 ${report.convertedCount} 张，失败 ${report.failures.length} 张`,
      );
      return;
    }

    ElMessage.success(
      report.scannedPngCount > 0
        ? `已转换 ${report.convertedCount} 张卡牌图片`
        : '源目录中没有待转换的 PNG 图片',
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量转换失败');
  } finally {
    imageTool.running = false;
  }
}

async function handleCardImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  cardImportTool.running = true;

  try {
    const csvText = await file.text();
    const report = await session.importCardsFromCsv(csvText);
    cardImportTool.lastReport = report;

    if (!report) {
      ElMessage.error('当前未登录，无法执行导入');
      return;
    }

    if (report.failureCount > 0) {
      ElMessage.warning(
        `导入完成，成功 ${report.successCount} 行，失败 ${report.failureCount} 行`,
      );
      return;
    }

    ElMessage.success(
      `批量导入完成，新增 ${report.createdCount} 张，更新 ${report.updatedCount} 张`,
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'CSV 导入失败');
  } finally {
    cardImportTool.running = false;
    input.value = '';
  }
}

function handleLogout() {
  session.signOut();
  void router.push('/');
}
</script>

<template>
  <main class="admin-shell">
    <section class="admin-dashboard">
      <header class="admin-header">
        <div>
          <p class="eyebrow">管理总览</p>
          <h1>{{ session.user?.account || 'admin' }} 的工作台</h1>
        </div>

        <el-button plain @click="handleLogout">退出登录</el-button>
      </header>

      <el-row :gutter="16">
        <el-col v-for="item in metrics" :key="item.label" :span="8">
          <el-card shadow="never" class="metric-card">
            <p class="metric-label">{{ item.label }}</p>
            <strong class="metric-value">{{ item.value }}</strong>
            <span class="metric-copy">{{ item.copy }}</span>
          </el-card>
        </el-col>
      </el-row>

      <el-card shadow="never" class="table-card">
        <template #header>
          <div class="table-header">
            <span>玩家账号管理</span>
            <div class="table-actions">
              <el-input v-model="keyword" placeholder="输入用户名或 ID" clearable />
              <el-button type="primary" @click="handleSearch">检索</el-button>
            </div>
          </div>
        </template>
        <el-table :data="session.players" stripe>
          <el-table-column prop="id" label="ID" width="90" />
          <el-table-column prop="username" label="用户名" />
          <el-table-column prop="level" label="等级" width="90" />
          <el-table-column prop="stamina" label="体力" width="90" />
          <el-table-column prop="gold" label="金币" width="100" />
          <el-table-column prop="towerFloor" label="塔层" width="100" />
          <el-table-column prop="collectionCount" label="卡牌数" width="100" />
        </el-table>
      </el-card>

      <el-card shadow="never" class="table-card">
        <template #header>基础数值配置</template>
        <el-table :data="session.configs" stripe>
          <el-table-column prop="key" label="配置键" min-width="220" />
          <el-table-column prop="description" label="说明" min-width="200" />
          <el-table-column label="值" min-width="260">
            <template #default="{ row }">
              <code>{{ JSON.stringify(row.value) }}</code>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button link type="primary" @click="openConfigEditor(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never" class="table-card">
        <template #header>
          <div class="table-header">
            <div>
              <span>卡牌图片工具</span>
              <p class="table-subcopy">
                固定扫描 `/assets/card_original_image` 下全部 PNG，输出到
                `/assets/cards`，同名 WebP 会覆盖，成功后自动删除原 PNG。
              </p>
            </div>
            <div class="table-actions">
              <el-button
                type="primary"
                :loading="imageTool.running"
                @click="handleConvertCardImages"
              >
                批量 PNG 转 WebP
              </el-button>
            </div>
          </div>
        </template>
        <div class="image-tool-copy">
          <span>源目录：`/assets/card_original_image/`</span>
          <span>输出目录：`/assets/cards/`</span>
        </div>
        <div v-if="imageTool.lastReport" class="image-report-grid">
          <div class="image-report-item">
            <span class="metric-label">扫描到 PNG</span>
            <strong class="metric-value">{{ imageTool.lastReport.scannedPngCount }}</strong>
          </div>
          <div class="image-report-item">
            <span class="metric-label">成功转换</span>
            <strong class="metric-value">{{ imageTool.lastReport.convertedCount }}</strong>
          </div>
          <div class="image-report-item">
            <span class="metric-label">已删原图</span>
            <strong class="metric-value">{{ imageTool.lastReport.deletedSourceCount }}</strong>
          </div>
          <div class="image-report-item">
            <span class="metric-label">失败数量</span>
            <strong class="metric-value">{{ imageTool.lastReport.failures.length }}</strong>
          </div>
        </div>
        <div v-if="imageTool.lastReport?.converted.length" class="image-report-list">
          <strong>最近转换成功</strong>
          <ul>
            <li v-for="item in imageTool.lastReport.converted" :key="item.sourceFileName">
              {{ item.sourceFileName }} → {{ item.outputRelativePath }}
            </li>
          </ul>
        </div>
        <div v-if="imageTool.lastReport?.failures.length" class="image-report-list is-error">
          <strong>转换失败</strong>
          <ul>
            <li v-for="item in imageTool.lastReport.failures" :key="item.sourceFileName">
              {{ item.sourceFileName }}：{{ item.message }}
            </li>
          </ul>
        </div>
      </el-card>

      <el-card shadow="never" class="table-card">
        <template #header>
          <div class="table-header">
            <div>
              <span>卡牌框架管理</span>
              <p class="table-subcopy">基础属性、技能表、关系技能先走统一 JSON 骨架，后续填正式卡牌时可直接沿用。</p>
            </div>
            <div class="table-actions">
              <el-input v-model="cardKeyword" placeholder="搜索卡牌编号/名称/系列" clearable />
              <el-button plain @click="downloadCardImportTemplate">下载 CSV 模板</el-button>
              <el-button plain :loading="cardImportTool.running" @click="openCardImportPicker">批量导入 CSV</el-button>
              <el-button type="primary" @click="openCreateCard">新增卡牌</el-button>
            </div>
          </div>
        </template>
        <input
          ref="cardImportInput"
          class="visually-hidden"
          type="file"
          accept=".csv,text/csv"
          @change="handleCardImportFileChange"
        />
        <div class="image-tool-copy">
          <span>导入规则：按 `code` 自动新增或更新卡牌</span>
          <span>`skillsJson` / `relationsJson` 字段需填写合法 JSON</span>
        </div>
        <div v-if="cardImportTool.lastReport" class="image-report-grid">
          <div class="image-report-item">
            <span class="metric-label">CSV 数据行</span>
            <strong class="metric-value">{{ cardImportTool.lastReport.totalRows }}</strong>
          </div>
          <div class="image-report-item">
            <span class="metric-label">导入成功</span>
            <strong class="metric-value">{{ cardImportTool.lastReport.successCount }}</strong>
          </div>
          <div class="image-report-item">
            <span class="metric-label">新增卡牌</span>
            <strong class="metric-value">{{ cardImportTool.lastReport.createdCount }}</strong>
          </div>
          <div class="image-report-item">
            <span class="metric-label">更新卡牌</span>
            <strong class="metric-value">{{ cardImportTool.lastReport.updatedCount }}</strong>
          </div>
        </div>
        <div v-if="cardImportTool.lastReport?.failures.length" class="image-report-list is-error">
          <strong>导入失败明细</strong>
          <ul>
            <li v-for="item in cardImportTool.lastReport.failures" :key="`${item.rowNumber}-${item.code}`">
              第 {{ item.rowNumber }} 行 / {{ item.code || '未填编号' }} / {{ item.name || '未填名称' }}：{{ item.message }}
            </li>
          </ul>
        </div>
        <el-table :data="filteredCards" stripe>
          <el-table-column prop="code" label="卡牌编号" min-width="150" />
          <el-table-column prop="name" label="名称" min-width="120" />
          <el-table-column prop="rarity" label="稀有度" width="90" />
          <el-table-column prop="series" label="系列" min-width="140" />
          <el-table-column prop="camp" label="阵营" min-width="120" />
          <el-table-column prop="attribute" label="属性" width="90" />
          <el-table-column label="技能数" width="90">
            <template #default="{ row }">
              {{ row.skills.length }}
            </template>
          </el-table-column>
          <el-table-column label="关系数" width="90">
            <template #default="{ row }">
              {{ row.relations.length }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'">
                {{ row.enabled ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button link type="primary" @click="openCardEditor(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-dialog v-model="configDialog.visible" title="编辑基础配置" width="720px">
        <el-form label-position="top">
          <el-form-item label="配置键">
            <el-input v-model="configDialog.key" disabled />
          </el-form-item>
          <el-form-item label="说明">
            <el-input v-model="configDialog.description" />
          </el-form-item>
          <el-form-item label="JSON 值">
            <el-input v-model="configDialog.valueText" type="textarea" :rows="8" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="configDialog.visible = false">取消</el-button>
          <el-button type="primary" @click="handleConfigSave">保存修改</el-button>
        </template>
      </el-dialog>

      <el-dialog
        v-model="cardDialog.visible"
        :title="cardDialog.mode === 'create' ? '新增卡牌框架' : '编辑卡牌框架'"
        width="960px"
      >
        <el-form label-position="top">
          <section class="card-editor-grid">
            <el-form-item label="卡牌编号">
              <el-input v-model="cardDialog.code" :disabled="cardDialog.mode === 'update'" />
            </el-form-item>
            <el-form-item label="名称">
              <el-input v-model="cardDialog.name" />
            </el-form-item>
            <el-form-item label="稀有度">
              <el-select v-model="cardDialog.rarity">
                <el-option
                  v-for="item in CARD_RARITY_OPTIONS"
                  :key="item.code"
                  :label="item.label"
                  :value="item.code"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="系列">
              <el-input v-model="cardDialog.series" />
            </el-form-item>
            <el-form-item label="阵营">
              <el-input v-model="cardDialog.camp" />
            </el-form-item>
            <el-form-item label="属性">
              <el-input v-model="cardDialog.attribute" />
            </el-form-item>
            <el-form-item label="展示倍率">
              <el-input-number v-model="cardDialog.multiplier" :min="0.1" :max="99" :precision="2" :step="0.05" />
            </el-form-item>
            <el-form-item label="启用状态">
              <el-switch v-model="cardDialog.enabled" />
            </el-form-item>
          </section>

          <el-form-item label="背景描述">
            <el-input v-model="cardDialog.story" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item label="图片地址">
            <el-input v-model="cardDialog.imageUrl" />
          </el-form-item>

          <section class="card-editor-grid stats-grid">
            <el-form-item label="武力">
              <el-input-number v-model="cardDialog.stats.force" :min="0" :max="9999" />
            </el-form-item>
            <el-form-item label="智慧">
              <el-input-number v-model="cardDialog.stats.intelligence" :min="0" :max="9999" />
            </el-form-item>
            <el-form-item label="防御">
              <el-input-number v-model="cardDialog.stats.defense" :min="0" :max="9999" />
            </el-form-item>
            <el-form-item label="速度">
              <el-input-number v-model="cardDialog.stats.speed" :min="0" :max="9999" />
            </el-form-item>
            <el-form-item label="精神">
              <el-input-number v-model="cardDialog.stats.spirit" :min="0" :max="9999" />
            </el-form-item>
            <el-form-item label="体力">
              <el-input-number v-model="cardDialog.stats.vitality" :min="0" :max="9999" />
            </el-form-item>
          </section>

          <el-form-item label="技能 JSON">
            <el-input v-model="cardDialog.skillsText" type="textarea" :rows="12" />
            <p class="editor-hint">
              `type` 可选：{{ CARD_SKILL_TYPE_OPTIONS.map((item) => item.code).join(', ') }}
            </p>
          </el-form-item>

          <el-form-item label="关系技能 JSON">
            <el-input v-model="cardDialog.relationsText" type="textarea" :rows="12" />
            <p class="editor-hint">
              `triggerType` 可选：{{ CARD_RELATION_TRIGGER_OPTIONS.map((item) => item.code).join(', ') }}；
              `effectType` 可选：{{ CARD_RELATION_EFFECT_OPTIONS.map((item) => item.code).join(', ') }}；
              成员请填写 `memberCardCodes`
            </p>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="cardDialog.visible = false">取消</el-button>
          <el-button type="primary" @click="handleCardSave">保存卡牌</el-button>
        </template>
      </el-dialog>
    </section>
  </main>
</template>
