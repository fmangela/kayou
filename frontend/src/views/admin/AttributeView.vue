<template>
  <div>
    <el-card style="margin-bottom:16px">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span style="font-weight:bold">大模型 API 配置</span>
          <el-button size="small" type="primary" :loading="savingLm" @click="saveLmCfg">保存配置</el-button>
        </div>
      </template>

      <el-form :model="lmConfig" label-width="72px" size="small">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="API 地址">
              <el-input v-model="lmConfig.api_url" placeholder="https://api.openai.com/v1/chat/completions" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="API Key">
              <el-input v-model="lmConfig.api_key" type="password" show-password placeholder="sk-..." />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="模型">
              <el-input v-model="lmConfig.model" placeholder="gpt-4o" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <el-divider content-position="left" style="margin:8px 0 16px">提示词配置</el-divider>

      <div style="margin-bottom:12px;color:#666;font-size:12px">
        4 个提示词框会根据内容多少自动增高，默认全部展开显示。
      </div>
      <div style="margin-bottom:16px;padding:12px 14px;border:1px solid #ebeef5;border-radius:8px;background:#fafafa">
        <div style="font-weight:600;margin-bottom:8px">占位变量说明</div>
        <div style="margin-bottom:8px;color:#666;font-size:12px;line-height:1.7">
          这里的 <code v-pre>{{...}}</code> 不是随便写的占位符，而是模板变量。保存后，系统会在每次“生成属性”时，
          自动把它们替换成当前人物的真实资料，再把完整提示词发给大模型。这样同一套提示词就能批量复用，不需要每个人都手改一次。
        </div>
        <div style="margin-bottom:8px;color:#666;font-size:12px;line-height:1.7">
          示例：<code v-pre>{{series_name}}</code> 会替换成“三国”，<code v-pre>{{character_name}}</code> 会替换成“曹丕”。
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <el-tag v-for="item in placeholderDefs" :key="item.key" size="small" type="info">
            {{ item.key }}
          </el-tag>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px 16px;color:#606266;font-size:12px;line-height:1.6">
          <div v-for="item in placeholderDefs" :key="`${item.key}-desc`">
            <code>{{ formatPlaceholder(item.key) }}</code>：{{ item.desc }}
          </div>
        </div>
      </div>

      <el-form :model="lmConfig" label-position="top" size="small">
        <el-form-item label="阵营提示词">
          <el-input
            v-model="lmConfig.system_prompt_series"
            type="textarea"
            :autosize="{ minRows: 6 }"
            resize="none"
            placeholder="你是一个卡牌游戏设计师。请根据人物在系列中的阵营归属，返回阵营名称。只返回JSON，格式：{&quot;faction_name&quot;:&quot;阵营名&quot;}"
          />
        </el-form-item>
        <el-form-item label="稀有度与属性值提示词（稀有度/武力/智力/速度/体力）">
          <el-input
            v-model="lmConfig.system_prompt_stats"
            type="textarea"
            :autosize="{ minRows: 8 }"
            resize="none"
            placeholder="你是一个卡牌游戏属性设计师。请先确定稀有度，再返回 rarity、武力、智力、速度、体力。只返回 JSON。"
          />
        </el-form-item>
        <el-form-item label="技能提示词">
          <el-input
            v-model="lmConfig.system_prompt_skills"
            type="textarea"
            :autosize="{ minRows: 7 }"
            resize="none"
            placeholder="你是一个卡牌游戏技能设计师。请根据人物特点和事件，为卡牌设计技能（每个技能有名字和描述）。只返回JSON，格式：[{&quot;name&quot;:&quot;技能名&quot;,&quot;desc&quot;:&quot;技能描述&quot;}]"
          />
        </el-form-item>
        <el-form-item label="元素属性提示词">
          <el-input
            v-model="lmConfig.system_prompt_element"
            type="textarea"
            :autosize="{ minRows: 7 }"
            resize="none"
            placeholder="你是一个卡牌游戏属性设计师。请根据人物所属文化背景，为其分配属性元素。中国系列用：金、木、水、火、土；国外/科幻系列用：火、土、水、电、风、冰、光、暗、心灵；特摄系列用：战斗、技术、能量。只返回JSON，格式：{&quot;element_name&quot;:&quot;属性名&quot;}"
          />
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Filters -->
    <el-card style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <el-input v-model="filters.keyword" placeholder="搜索人物/编号/系列/技能" clearable style="width:220px" @keyup.enter="loadData" />
          <el-input v-model="filters.card_code" placeholder="卡牌编号筛选" clearable style="width:160px" />
          <el-select v-model="filters.series_name" placeholder="系列" clearable style="width:140px">
            <el-option v-for="item in options.series" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="filters.faction_name" placeholder="阵营" clearable style="width:140px">
            <el-option v-for="item in options.factions" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="filters.rarity" placeholder="稀有度" clearable style="width:120px">
            <el-option v-for="item in options.rarities" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="filters.element_name" placeholder="属性" clearable style="width:120px">
            <el-option v-for="item in options.elements" :key="item" :label="item" :value="item" />
          </el-select>
          <el-button @click="loadData"><el-icon><Search /></el-icon> 查询</el-button>
          <el-button @click="resetFilters"><el-icon><Refresh /></el-icon> 重置</el-button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <el-button @click="downloadTemplate"><el-icon><Download /></el-icon> 导入模板</el-button>
          <el-upload :show-file-list="false" accept=".csv,.xlsx,.xls" :before-upload="handleImport" style="display:inline">
            <el-button><el-icon><Upload /></el-icon> 导入属性</el-button>
          </el-upload>
          <el-button type="primary" @click="handleExport"><el-icon><Download /></el-icon> 导出当前筛选</el-button>
        </div>
      </div>
    </el-card>

    <!-- Table card -->
    <el-card>
      <template #header>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span style="font-weight:bold">卡牌属性编辑</span>

          <!-- Series copy/paste -->
          <el-divider direction="vertical" />
          <span style="font-size:12px;color:#888">系列操作：</span>
          <el-button size="small" :disabled="!selectedSeries" @click="copySeries">
            复制系列 {{ selectedSeries ? `(${selectedSeries})` : '' }}
          </el-button>
          <el-button size="small" :disabled="!copiedSeries || !selectedRows.length" @click="pasteSeries">
            粘贴系列 {{ copiedSeries ? `→ ${copiedSeries}` : '' }}
          </el-button>

          <!-- Card code generation -->
          <el-divider direction="vertical" />
          <span style="font-size:12px;color:#888">卡牌编号：</span>
          <el-input-number v-model="episode" :min="1" :max="99" :step="1" controls-position="right"
            placeholder="弹数" style="width:100px" size="small" />
          <el-button size="small" type="primary" :loading="generatingCodes" @click="generateCodes">
            一键生成编号
          </el-button>

          <!-- Batch AI generate -->
          <el-divider direction="vertical" />
          <el-button size="small" type="success" :disabled="!selectedRows.length" :loading="generatingAi"
            @click="batchGenerateAi">
            生成卡牌属性 {{ selectedRows.length ? `(${selectedRows.length}条)` : '' }}
          </el-button>

          <div style="margin-left:auto;color:#666;font-size:12px">人物删除请回到"卡牌图片AI生成 → 人物管理"处理</div>
        </div>
      </template>

      <el-table
        ref="tableRef"
        :data="pagedRows"
        v-loading="loading"
        border
        size="small"
        style="width:100%"
        @sort-change="handleSortChange"
        @selection-change="handleSelectionChange"
        @row-click="handleRowClick"
      >
        <el-table-column type="selection" width="42" />
        <el-table-column prop="character_id" label="人物ID" width="76" sortable="custom" />
        <el-table-column prop="name" label="人物名字" width="100" sortable="custom" />
        <el-table-column prop="pinyin" label="拼音" width="110" sortable="custom" />
        <el-table-column prop="card_code" label="卡牌编号" width="130" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="series_name" label="系列" width="100" sortable="custom" />
        <el-table-column prop="faction_name" label="阵营" width="100" sortable="custom" />
        <el-table-column prop="rarity" label="稀有度" width="80" sortable="custom" />
        <el-table-column prop="force_value" label="武力" width="76" sortable="custom" />
        <el-table-column prop="intellect_value" label="智力" width="76" sortable="custom" />
        <el-table-column prop="speed_value" label="速度" width="76" sortable="custom" />
        <el-table-column prop="stamina_value" label="体力" width="76" sortable="custom" />
        <el-table-column prop="element_name" label="属性" width="90" sortable="custom" />
        <el-table-column label="技能1" min-width="160" show-overflow-tooltip>
          <template #default="{ row }"><span>{{ row.skill1_name || '-' }}</span></template>
        </el-table-column>
        <el-table-column label="技能2" min-width="160" show-overflow-tooltip>
          <template #default="{ row }"><span>{{ row.skill2_name || '-' }}</span></template>
        </el-table-column>
        <el-table-column label="WebP" width="64">
          <template #default="{ row }">
            <el-tag size="small" type="success">{{ row.webp_paths?.length || 0 }}张</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;white-space:nowrap">
              <el-button size="small" @click.stop="openEdit(row)">编辑</el-button>
              <el-button size="small" type="success" :loading="row._generating" @click.stop="singleGenerateAi(row)">生成属性</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100, 200]"
          :total="rows.length"
          layout="total, sizes, prev, pager, next"
          background
          @size-change="currentPage = 1"
        />
      </div>
    </el-card>
  </div>

  <!-- Edit dialog -->
  <el-dialog v-model="editDialog.visible" title="编辑卡牌属性" width="900px">
    <el-form :model="editDialog.form" label-width="110px">
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="人物ID">
            <el-input :model-value="editDialog.form.character_id" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="人物名字">
            <el-input :model-value="editDialog.form.name" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="卡牌编号">
            <el-input v-model="editDialog.form.card_code" placeholder="如 SG-01-004" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="系列">
            <el-input v-model="editDialog.form.series_name" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="阵营">
            <el-input v-model="editDialog.form.faction_name" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="稀有度">
            <el-select v-model="editDialog.form.rarity" style="width:100%">
              <el-option v-for="r in rarities" :key="r" :label="r" :value="r" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="武力">
            <el-input-number v-model="editDialog.form.force_value" :min="0" :max="9999" controls-position="right" style="width:220px" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="智力">
            <el-input-number v-model="editDialog.form.intellect_value" :min="0" :max="9999" controls-position="right" style="width:220px" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="速度">
            <el-input-number v-model="editDialog.form.speed_value" :min="0" :max="9999" controls-position="right" style="width:220px" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="体力">
            <el-input-number v-model="editDialog.form.stamina_value" :min="0" :max="9999" controls-position="right" style="width:220px" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="属性">
            <el-input v-model="editDialog.form.element_name" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider content-position="left">技能1</el-divider>
      <el-row :gutter="16">
        <el-col :span="6"><el-form-item label="技能1 ID"><el-input v-model="editDialog.form.skill1_id" /></el-form-item></el-col>
        <el-col :span="18"><el-form-item label="技能1 名字"><el-input v-model="editDialog.form.skill1_name" /></el-form-item></el-col>
        <el-col :span="24"><el-form-item label="技能1 描述"><el-input v-model="editDialog.form.skill1_desc" type="textarea" :rows="2" /></el-form-item></el-col>
      </el-row>

      <el-divider content-position="left">技能2</el-divider>
      <el-row :gutter="16">
        <el-col :span="6"><el-form-item label="技能2 ID"><el-input v-model="editDialog.form.skill2_id" /></el-form-item></el-col>
        <el-col :span="18"><el-form-item label="技能2 名字"><el-input v-model="editDialog.form.skill2_name" /></el-form-item></el-col>
        <el-col :span="24"><el-form-item label="技能2 描述"><el-input v-model="editDialog.form.skill2_desc" type="textarea" :rows="2" /></el-form-item></el-col>
      </el-row>

      <el-divider content-position="left">技能3</el-divider>
      <el-row :gutter="16">
        <el-col :span="6"><el-form-item label="技能3 ID"><el-input v-model="editDialog.form.skill3_id" /></el-form-item></el-col>
        <el-col :span="18"><el-form-item label="技能3 名字"><el-input v-model="editDialog.form.skill3_name" /></el-form-item></el-col>
        <el-col :span="24"><el-form-item label="技能3 描述"><el-input v-model="editDialog.form.skill3_desc" type="textarea" :rows="2" /></el-form-item></el-col>
      </el-row>
    </el-form>
    <template #footer>
      <el-button @click="editDialog.visible = false">取消</el-button>
      <el-button type="primary" :loading="editDialog.saving" @click="saveRow">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  downloadCardAttributeTemplate,
  exportCardAttributes,
  generateAiAttributes,
  generateCardCodes,
  getCardAttributeOptions,
  getCardAttributes,
  getLmConfig,
  importCardAttributes,
  saveLmConfig,
  updateCardAttribute,
} from '../../api/cards'

const rarities = ['N', 'R', 'CP', 'SR', 'SSR', 'UR', 'PR', 'HR']
const placeholderDefs = [
  { key: 'series_name', desc: '当前人物所属系列，例如“三国”“漫威”“奥特曼”。' },
  { key: 'character_name', desc: '当前人物名字，例如“曹丕”“关羽”。' },
  { key: 'rarity', desc: '当前已有稀有度；如果为空，系统会让模型先判断最合适的稀有度。' },
  { key: 'target_total', desc: '当前稀有度对应的四维总和值上限，例如 SSR 对应 6500。' },
  { key: 'target_total_min', desc: '当前稀有度允许的四维总和值下限，即上限减 100。' },
  { key: 'skill_count', desc: '当前稀有度应生成的技能数量，例如 SSR / HR / UR 为 2，其余大多为 1。' },
  { key: 'background', desc: '人物背景介绍；如果该人物还没有背景文案，这一段会自动留空。' },
  { key: 'appearance', desc: '人物外形描述；如果该人物还没有外形文案，这一段会自动留空。' },
  { key: 'faction_name', desc: '当前已有阵营，主要用于你后续自定义提示词时引用。' },
  { key: 'element_name', desc: '当前已有元素属性，主要用于你后续自定义提示词时引用。' },
]

function formatPlaceholder(key) {
  return `{{${key}}}`
}

const defaultLmConfig = {
  api_url: '',
  api_key: '',
  model: 'gpt-4o',
  system_prompt_series: [
    '现在有个卡牌游戏需要设定角色，是“{{series_name}}”里的“{{character_name}}”。',
    '请根据这个人物在该系列中的身份、经历、立场与关系，判断其阵营归属。',
    '如果是三国系列，优先判断为：魏、蜀、吴、群雄中的一个。',
    '{{#if background}}人物背景：{{background}}{{/if}}',
    '{{#if appearance}}人物外形：{{appearance}}{{/if}}',
    '只返回 JSON，格式：{"faction_name":"阵营名"}。',
  ].join('\n'),
  system_prompt_stats: [
    '现在有个卡牌游戏需要设定角色，是“{{series_name}}”里的“{{character_name}}”。',
    '{{#if rarity}}当前稀有度为“{{rarity}}”，请优先沿用该稀有度。{{/if}}',
    '请根据这个人物的特点与下列规则，确定稀有度并设计武力、智力、速度、体力四项属性：',
    '1. 稀有度只能从 N、R、CP、SR、SSR、UR、PR、HR 中选择一个。',
    '2. 四项都必须是 1-9999 的整数。',
    '3. 四项总和规则：N=5000，R=5500，CP=5800，SR=6000，SSR=6500，UR=7000，PR=6300，HR=6600。',
    '4. 四项总和不能超过所选稀有度对应总值，也不能低于对应总值100以上。',
    '5. 数值需要体现人物定位、经历、智谋、爆发力或耐久特色。',
    '{{#if background}}人物背景：{{background}}{{/if}}',
    '{{#if appearance}}人物外形：{{appearance}}{{/if}}',
    '只返回 JSON，格式：{"rarity":"稀有度","force_value":数字,"intellect_value":数字,"speed_value":数字,"stamina_value":数字}。',
  ].join('\n'),
  system_prompt_skills: [
    '现在有个卡牌游戏需要设定角色，是“{{series_name}}”里的“{{character_name}}”，稀有度为“{{rarity}}”。',
    '请根据这个人物的特点、身份与代表事件，设计 {{skill_count}} 个技能。',
    '每个技能只需要名字与描述，名称要简洁，描述要体现人物特色与玩法感。',
    '技能目前只输出描述，不需要返回底层技能模板、脚本字段、数值公式或触发器结构。',
    '{{#if background}}人物背景：{{background}}{{/if}}',
    '{{#if appearance}}人物外形：{{appearance}}{{/if}}',
    '只返回 JSON 数组，格式：[{"name":"技能名","desc":"技能描述"}]。',
  ].join('\n'),
  system_prompt_element: [
    '现在有个卡牌游戏需要设定角色，是“{{series_name}}”里的“{{character_name}}”。',
    '请根据系列题材和人物气质，为其分配一个元素属性。',
    '中国题材统一且只能从：金、木、水、火、土 中选择。',
    '国外或科幻题材统一且只能从：火、土、水、电、风、冰、光、暗、心灵 中选择。',
    '特摄角色统一且只能从：战斗、技术、能量 中选择。',
    '{{#if background}}人物背景：{{background}}{{/if}}',
    '{{#if appearance}}人物外形：{{appearance}}{{/if}}',
    '只返回 JSON，格式：{"element_name":"属性名"}。',
  ].join('\n'),
}

const loading = ref(false)
const rows = ref([])
const options = reactive({ series: [], factions: [], rarities: [], elements: [] })
const filters = reactive({
  keyword: '',
  card_code: '',
  series_name: '',
  faction_name: '',
  rarity: '',
  element_name: '',
  sortField: 'character_id',
  sortOrder: 'ASC',
})

// Pagination
const currentPage = ref(1)
const pageSize = ref(20)
const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

// Selection
const tableRef = ref(null)
const selectedRows = ref([])
function handleSelectionChange(val) {
  selectedRows.value = val
}

// Series copy/paste
const selectedSeries = computed(() => {
  if (selectedRows.value.length === 1) return selectedRows.value[0].series_name || ''
  return ''
})
const copiedSeries = ref('')
function copySeries() {
  if (!selectedSeries.value) return
  copiedSeries.value = selectedSeries.value
  ElMessage.success(`已复制系列：${copiedSeries.value}`)
}
async function pasteSeries() {
  if (!copiedSeries.value || !selectedRows.value.length) return
  const ids = selectedRows.value.map(r => r.character_id)
  try {
    await Promise.all(ids.map(id => {
      const row = rows.value.find(r => r.character_id === id)
      return updateCardAttribute(id, { ...row, series_name: copiedSeries.value })
    }))
    ElMessage.success(`已将 ${ids.length} 条记录的系列设为：${copiedSeries.value}`)
    await Promise.all([loadData(), loadOptions()])
  } catch (e) {
    ElMessage.error(e.message || '粘贴系列失败')
  }
}

// Row click to select
function handleRowClick(row) {
  tableRef.value?.toggleRowSelection(row)
}

// Card code generation
const episode = ref(1)
const generatingCodes = ref(false)
async function generateCodes() {
  if (!episode.value) return ElMessage.warning('请先填写弹数')
  try {
    generatingCodes.value = true
    const res = await generateCardCodes(episode.value)
    ElMessage.success(res.message || `已生成 ${res.updated} 条卡牌编号`)
    await loadData()
  } catch (e) {
    ElMessage.error(e.message || '生成编号失败')
  } finally {
    generatingCodes.value = false
  }
}

// LM config
const lmConfig = reactive({
  ...defaultLmConfig,
})
const savingLm = ref(false)

async function loadLmConfig() {
  try {
    const cfg = await getLmConfig()
    Object.assign(lmConfig, defaultLmConfig, cfg)
  } catch {}
}

async function saveLmCfg() {
  savingLm.value = true
  try {
    await saveLmConfig({ ...lmConfig })
    ElMessage.success('配置已保存')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    savingLm.value = false
  }
}

// AI generation
const generatingAi = ref(false)

function buildPromptOverrides() {
  return {
    stats: lmConfig.system_prompt_stats || undefined,
    skills: lmConfig.system_prompt_skills || undefined,
    element: lmConfig.system_prompt_element || undefined,
    faction: lmConfig.system_prompt_series || undefined,
  }
}

async function singleGenerateAi(row) {
  row._generating = true
  try {
    const res = await generateAiAttributes([row.character_id], buildPromptOverrides())
    if (res.results?.length) {
      const updated = res.results[0]
      const idx = rows.value.findIndex(r => r.character_id === row.character_id)
      if (idx !== -1) rows.value[idx] = { ...rows.value[idx], ...updated, _generating: false }
    }
    await loadOptions()
    ElMessage.success(`${row.name} 属性已生成`)
  } catch (e) {
    ElMessage.error(e.message || '生成失败')
  } finally {
    const idx = rows.value.findIndex(r => r.character_id === row.character_id)
    if (idx !== -1) rows.value[idx] = { ...rows.value[idx], _generating: false }
    else row._generating = false
  }
}

async function batchGenerateAi() {
  if (!selectedRows.value.length) return
  try {
    await ElMessageBox.confirm(
      `将为选中的 ${selectedRows.value.length} 个人物调用大模型生成属性，是否继续？`,
      '批量生成属性',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  generatingAi.value = true
  try {
    const ids = selectedRows.value.map(r => r.character_id)
    const res = await generateAiAttributes(ids, buildPromptOverrides())
    for (const updated of (res.results || [])) {
      const idx = rows.value.findIndex(r => r.character_id === updated.character_id)
      if (idx !== -1) rows.value[idx] = { ...rows.value[idx], ...updated }
    }
    await loadOptions()
    ElMessage.success(`已为 ${res.results?.length || 0} 个人物生成属性`)
  } catch (e) {
    ElMessage.error(e.message || '批量生成失败')
  } finally {
    generatingAi.value = false
  }
}

// Table data
async function loadOptions() {
  try {
    const res = await getCardAttributeOptions()
    options.series = res.series || []
    options.factions = res.factions || []
    options.rarities = res.rarities || []
    options.elements = res.elements || []
  } catch {}
}

async function loadData() {
  loading.value = true
  try {
    rows.value = await getCardAttributes(filters)
    currentPage.value = 1
  } catch (e) {
    ElMessage.error(e.message || '读取卡牌属性失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.card_code = ''
  filters.series_name = ''
  filters.faction_name = ''
  filters.rarity = ''
  filters.element_name = ''
  filters.sortField = 'character_id'
  filters.sortOrder = 'ASC'
  loadData()
}

function handleSortChange({ prop, order }) {
  filters.sortField = prop || 'character_id'
  filters.sortOrder = order === 'descending' ? 'DESC' : 'ASC'
  loadData()
}

// Edit dialog
const editDialog = ref({ visible: false, saving: false, form: {} })

function openEdit(row) {
  editDialog.value = {
    visible: true,
    saving: false,
    form: {
      ...row,
      force_value: row.force_value ?? 0,
      intellect_value: row.intellect_value ?? 0,
      speed_value: row.speed_value ?? 0,
      stamina_value: row.stamina_value ?? 0,
    },
  }
}

async function saveRow() {
  editDialog.value.saving = true
  try {
    await updateCardAttribute(editDialog.value.form.character_id, editDialog.value.form)
    ElMessage.success('卡牌属性已保存')
    editDialog.value.visible = false
    await Promise.all([loadData(), loadOptions()])
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    editDialog.value.saving = false
  }
}

// Import/export
async function handleImport(file) {
  try {
    const res = await importCardAttributes(file)
    ElMessage.success(`导入成功，更新 ${res.updated} 条`)
    await Promise.all([loadData(), loadOptions()])
  } catch (e) {
    ElMessage.error(e.message || '导入失败')
  }
  return false
}

async function handleExport() {
  try {
    await exportCardAttributes(filters)
  } catch (e) {
    ElMessage.error(e.message || '导出失败')
  }
}

async function downloadTemplate() {
  try {
    await downloadCardAttributeTemplate()
  } catch (e) {
    ElMessage.error(e.message || '模板下载失败')
  }
}

onMounted(async () => {
  await Promise.all([loadOptions(), loadData(), loadLmConfig()])
})
</script>
