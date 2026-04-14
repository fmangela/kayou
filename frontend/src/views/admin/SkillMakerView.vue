<template>
  <div>
    <el-tabs v-model="activeTab" type="border-card" style="margin-bottom:0">
      <el-tab-pane label="技能库" name="skills">
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <el-input
            v-model="skillSearch"
            placeholder="搜索技能 ID / 名称 / 描述 / 标签"
            clearable
            style="width:240px"
            @input="handleSkillSearchInput"
          />
          <el-select v-model="skillFilterStatus" placeholder="状态" clearable style="width:120px" @change="loadSkills">
            <el-option v-for="s in STATUS_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
          <el-select v-model="skillFilterSlot" placeholder="槽位" clearable style="width:120px" @change="loadSkills">
            <el-option label="主技能" value="main" />
            <el-option label="副技能" value="sub" />
            <el-option label="觉醒技能" value="awakening" />
          </el-select>
          <el-button type="primary" @click="openSkillDialog()">新建技能</el-button>
        </div>

        <el-table :data="skills" border stripe size="small" v-loading="skillLoading">
          <el-table-column prop="skill_uid" label="ID" width="96" />
          <el-table-column prop="version" label="版本" width="72" />
          <el-table-column prop="name" label="技能名" width="150" />
          <el-table-column label="简述" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.short_desc || row.rendered_short_desc || '-' }}</template>
          </el-table-column>
          <el-table-column label="模板" width="150">
            <template #default="{ row }">
              <span>{{ row.template_name || '-' }}</span>
              <el-tag
                v-if="row.template_meta?.status === 'deprecated'"
                size="small"
                type="info"
                style="margin-left:6px"
              >
                已停用
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="skill_type" label="类型" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="typeTagType(row.skill_type)">{{ SKILL_TYPE_LABELS[row.skill_type] || row.skill_type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="slot_semantic" label="槽位" width="82">
            <template #default="{ row }">{{ SLOT_LABELS[row.slot_semantic] || row.slot_semantic }}</template>
          </el-table-column>
          <el-table-column label="校验" width="92">
            <template #default="{ row }">
              <el-tooltip
                :content="validationMessage(row)"
                :disabled="!validationMessage(row)"
                placement="top"
              >
                <el-tag size="small" :type="validationTagType(row)">
                  {{ validationLabel(row) }}
                </el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="statusTagType(row.status)">{{ STATUS_LABELS[row.status] || row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openSkillDialog(row)">编辑</el-button>
              <el-dropdown size="small" style="margin-left:4px" @command="(cmd) => handleStatusCmd(row, cmd)">
                <el-button size="small">状态<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="s in STATUS_OPTIONS"
                      :key="s.value"
                      :command="s.value"
                      :disabled="row.status === s.value"
                    >
                      {{ s.label }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="模板库" name="templates">
        <div style="display:flex;gap:8px;margin-bottom:16px">
          <el-button type="primary" @click="openTemplateDialog()">新建模板</el-button>
        </div>
        <el-table :data="templates" border stripe size="small" v-loading="tplLoading">
          <el-table-column prop="template_key" label="Key" width="160" />
          <el-table-column prop="name" label="模板名" width="140" />
          <el-table-column prop="skill_type" label="类型" width="100">
            <template #default="{ row }">{{ SKILL_TYPE_LABELS[row.skill_type] || row.skill_type }}</template>
          </el-table-column>
          <el-table-column prop="trigger_domain" label="触发域" width="90">
            <template #default="{ row }">{{ DOMAIN_LABELS[row.trigger_domain] || row.trigger_domain }}</template>
          </el-table-column>
          <el-table-column prop="effect_atom" label="效果原子" width="160" />
          <el-table-column prop="description_template" label="描述模板" min-width="180" show-overflow-tooltip />
          <el-table-column label="参数槽" width="88">
            <template #default="{ row }">{{ row.param_slots?.length || 0 }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openTemplateDialog(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="skillDialogVisible" :title="skillForm.id ? '编辑技能' : '新建技能'" width="720px" destroy-on-close>
      <el-form :model="skillForm" label-width="90px" size="small">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="技能名">
              <el-input v-model="skillForm.name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="槽位语义">
              <el-select v-model="skillForm.slot_semantic" style="width:100%">
                <el-option label="主技能" value="main" />
                <el-option label="副技能" value="sub" />
                <el-option label="觉醒技能" value="awakening" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="技能类型">
              <el-select v-model="skillForm.skill_type" :disabled="!!selectedTemplate" style="width:100%">
                <el-option v-for="(label, val) in SKILL_TYPE_LABELS" :key="val" :label="label" :value="val" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="触发事件">
              <el-select v-model="skillForm.trigger_event" clearable style="width:100%">
                <el-option v-for="e in TRIGGER_EVENTS" :key="e.value" :label="e.label" :value="e.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="效果原子">
              <el-select v-model="skillForm.effect_atom" :disabled="!!selectedTemplate" clearable style="width:100%">
                <el-option v-for="a in EFFECT_ATOMS" :key="a" :label="a" :value="a" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="目标">
              <el-select v-model="skillForm.target" style="width:100%">
                <el-option v-for="t in TARGETS" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="绑定模板">
          <el-select v-model="skillForm.template_id" clearable placeholder="建议优先绑定模板" style="width:100%" @change="onTemplateSelect">
            <el-option
              v-for="t in bindableTemplates"
              :key="t.id"
              :label="templateOptionLabel(t)"
              :value="t.id"
              :disabled="t.status !== 'active' && t.id !== skillForm.template_id"
            />
          </el-select>
          <div v-if="selectedTemplate" style="margin-top:6px;font-size:12px;color:#606266">
            当前模板会锁定技能类型和效果原子，并参与发布前结构校验。
          </div>
        </el-form-item>

        <template v-if="selectedTemplate && selectedTemplate.param_slots.length">
          <el-divider content-position="left">模板参数</el-divider>
          <el-row :gutter="12">
            <el-col :span="12" v-for="slot in selectedTemplate.param_slots" :key="slot.key">
              <el-form-item :label="slot.label">
                <el-select v-if="paramInputKind(slot) === 'select'" v-model="skillForm.params[slot.key]" style="width:100%">
                  <el-option v-for="o in slot.options" :key="o" :label="valueLabel(o)" :value="o" />
                </el-select>
                <el-input-number
                  v-else-if="paramInputKind(slot) === 'number'"
                  v-model="skillForm.params[slot.key]"
                  :min="slot.min ?? undefined"
                  :max="slot.max ?? undefined"
                  style="width:100%"
                />
                <el-input v-else v-model="skillForm.params[slot.key]" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <div
          v-if="selectedTemplate || renderedSkillSummary || skillFormValidation.errors.length || skillFormValidation.warnings.length"
          style="margin:6px 0 18px;padding:12px 14px;border:1px solid #ebeef5;border-radius:8px;background:#fafafa"
        >
          <div style="font-size:13px;font-weight:600;color:#303133;margin-bottom:8px">结构化预览</div>
          <div style="font-size:13px;color:#606266">
            卡面摘要：{{ skillForm.short_desc || renderedSkillSummary || '尚未生成' }}
          </div>
          <div v-if="skillFormValidation.errors.length" style="margin-top:8px;font-size:12px;color:#f56c6c">
            阻塞问题：{{ skillFormValidation.errors.join('；') }}
          </div>
          <div v-if="skillFormValidation.warnings.length" style="margin-top:6px;font-size:12px;color:#e6a23c">
            提醒：{{ skillFormValidation.warnings.join('；') }}
          </div>
        </div>

        <el-form-item label="简述">
          <el-input
            v-model="skillForm.short_desc"
            type="textarea"
            :rows="2"
            :placeholder="renderedSkillSummary ? `留空时将自动使用：${renderedSkillSummary}` : '用于卡面或列表展示'"
          />
        </el-form-item>
        <el-form-item label="详细描述">
          <el-input v-model="skillForm.long_desc" type="textarea" :rows="3" />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="来源">
              <el-select v-model="skillForm.source" style="width:100%">
                <el-option label="大模型生成" value="lm_generated" />
                <el-option label="人工录入" value="manual" />
                <el-option label="模板复制" value="template_copy" />
                <el-option label="导入" value="imported" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="skillForm.status" style="width:100%">
                <el-option v-for="s in STATUS_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="适用稀有度">
          <el-checkbox-group v-model="skillForm.applicable_rarities">
            <el-checkbox v-for="r in RARITIES" :key="r" :label="r">{{ r }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="标签">
          <el-select v-model="skillForm.tags" multiple filterable allow-create default-first-option style="width:100%" placeholder="输入或选择标签">
            <el-option v-for="t in COMMON_TAGS" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="skillDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveSkill">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="tplDialogVisible" :title="tplForm.id ? '编辑模板' : '新建模板'" width="680px" destroy-on-close>
      <el-form :model="tplForm" label-width="100px" size="small">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="模板 Key">
              <el-input v-model="tplForm.template_key" :disabled="!!tplForm.id" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="模板名">
              <el-input v-model="tplForm.name" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="技能类型">
              <el-select v-model="tplForm.skill_type" style="width:100%">
                <el-option v-for="(label, val) in SKILL_TYPE_LABELS" :key="val" :label="label" :value="val" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="触发域">
              <el-select v-model="tplForm.trigger_domain" style="width:100%">
                <el-option v-for="(label, val) in DOMAIN_LABELS" :key="val" :label="label" :value="val" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="效果原子">
          <el-select v-model="tplForm.effect_atom" style="width:100%">
            <el-option v-for="a in EFFECT_ATOMS" :key="a" :label="a" :value="a" />
          </el-select>
        </el-form-item>

        <el-form-item label="描述模板">
          <el-input v-model="tplForm.description_template" placeholder="例：{stat} +{value}" />
        </el-form-item>

        <el-form-item label="参数槽 (JSON)">
          <el-input
            v-model="tplForm.param_slots_raw"
            type="textarea"
            :rows="6"
            placeholder='[{"key":"value","label":"数值","unit":"点","default":10,"min":1,"max":100}]'
          />
          <div v-if="paramSlotsError" style="color:#f56c6c;font-size:12px;margin-top:4px">{{ paramSlotsError }}</div>
        </el-form-item>

        <div
          v-if="templatePreviewState.summary || templatePreviewState.error"
          style="margin:0 0 18px;padding:12px 14px;border:1px solid #ebeef5;border-radius:8px;background:#fafafa"
        >
          <div style="font-size:13px;font-weight:600;color:#303133;margin-bottom:8px">模板默认预览</div>
          <div style="font-size:13px;color:#606266">
            摘要预览：{{ templatePreviewState.summary || '默认值尚不足以生成摘要' }}
          </div>
          <div v-if="templatePreviewState.error" style="margin-top:6px;font-size:12px;color:#e6a23c">
            提示：{{ templatePreviewState.error }}
          </div>
        </div>

        <el-form-item label="适用稀有度">
          <el-checkbox-group v-model="tplForm.applicable_rarities">
            <el-checkbox v-for="r in RARITIES" :key="r" :label="r">{{ r }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="强度预算 (JSON)">
          <el-input v-model="tplForm.strength_budget_raw" placeholder='{"recommended":10,"min":1,"max":100}' />
        </el-form-item>

        <el-form-item label="状态">
          <el-select v-model="tplForm.status" style="width:160px">
            <el-option label="启用" value="active" />
            <el-option label="停用" value="deprecated" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tplDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveTemplate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import {
  createSkill,
  createSkillTemplate,
  getSkillTemplates,
  getSkills,
  updateSkill,
  updateSkillStatus,
  updateSkillTemplate,
} from '../../api/skills'

const SKILL_TYPE_LABELS = {
  active: '主动', passive: '被动', trigger: '触发', continuous: '持续',
  conditional: '条件', ultimate: '终结', aura: '光环', captain: '队长',
}
const DOMAIN_LABELS = {
  card: '卡牌域', battle: '对战域', settle: '结算域', growth: '养成域', display: '展示域',
}
const SLOT_LABELS = { main: '主技能', sub: '副技能', awakening: '觉醒' }
const STATUS_LABELS = {
  draft: '草稿', pending: '待审核', published: '已发布', disabled: '已停用', archived: '已归档',
}
const STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'pending', label: '待审核' },
  { value: 'published', label: '已发布' },
  { value: 'disabled', label: '已停用' },
  { value: 'archived', label: '已归档' },
]
const RARITIES = ['N', 'R', 'CP', 'SR', 'SSR', 'HR', 'UR', 'PR']
const TRIGGER_EVENTS = [
  { value: 'on_loadout_ready', label: '卡牌装配完成' },
  { value: 'on_battle_prepare', label: '对局准备完成' },
  { value: 'on_battle_start', label: '对局开始' },
  { value: 'on_turn_start', label: '回合开始' },
  { value: 'on_action_declare', label: '行动声明' },
  { value: 'on_action_hit', label: '行动命中' },
  { value: 'on_action_fail', label: '行动失败' },
  { value: 'on_receive_damage', label: '受到伤害' },
  { value: 'on_hp_low', label: '生命低阈值' },
  { value: 'on_status_apply', label: '状态附加' },
  { value: 'on_status_remove', label: '状态移除' },
  { value: 'on_battle_end', label: '对局结束' },
  { value: 'before_settle', label: '结算前' },
  { value: 'after_settle', label: '结算后' },
]
const EFFECT_ATOMS = [
  'modify_stat_flat', 'modify_stat_ratio', 'add_status', 'remove_status',
  'apply_value_clamp', 'grant_extra_trigger', 'reduce_cooldown',
  'modify_damage_flat', 'modify_damage_ratio', 'apply_trigger_limit',
]
const TARGETS = [
  { value: 'self_card', label: '自身' },
  { value: 'enemy_card', label: '敌方' },
  { value: 'self_team', label: '我方全体' },
  { value: 'enemy_team', label: '敌方全体' },
  { value: 'current_slot', label: '当前槽位' },
  { value: 'current_attribute', label: '当前属性字段' },
  { value: 'current_status', label: '当前状态' },
  { value: 'allied_same_faction', label: '同阵营' },
  { value: 'allied_same_series', label: '同系列' },
  { value: 'random_valid_target', label: '随机有效目标' },
]
const COMMON_TAGS = ['输出', '防御', '控制', '回复', '加速', '干扰', '资源', '破防', '护盾']
const VALUE_LABELS = {
  force_value: '武力',
  intellect_value: '智力',
  speed_value: '速度',
  stamina_value: '体力',
}
const STRICT_STATUSES = new Set(['pending', 'published'])

const activeTab = ref('skills')
const skills = ref([])
const skillLoading = ref(false)
const skillSearch = ref('')
const skillFilterStatus = ref('')
const skillFilterSlot = ref('')
const templates = ref([])
const tplLoading = ref(false)
const saving = ref(false)
const skillDialogVisible = ref(false)
const skillForm = ref(defaultSkillForm())
const tplDialogVisible = ref(false)
const tplForm = ref(defaultTplForm())
const paramSlotsError = ref('')

let skillSearchTimer = null

const selectedTemplate = computed(() =>
  skillForm.value.template_id
    ? templates.value.find((item) => item.id === skillForm.value.template_id) || null
    : null
)

const bindableTemplates = computed(() =>
  templates.value.filter((item) => item.status === 'active' || item.id === skillForm.value.template_id)
)

const effectiveSkillType = computed(() => selectedTemplate.value?.skill_type || skillForm.value.skill_type)

const renderedSkillSummary = computed(() =>
  renderDescriptionTemplate(selectedTemplate.value, skillForm.value.params || {})
)

const skillFormValidation = computed(() => {
  const errors = []
  const warnings = []
  const targetBucket = STRICT_STATUSES.has(skillForm.value.status) ? errors : warnings

  if (!selectedTemplate.value) {
    targetBucket.push(STRICT_STATUSES.has(skillForm.value.status) ? '待审核/已发布技能必须绑定模板' : '建议绑定模板以完成结构化归档')
  } else {
    if (selectedTemplate.value.status !== 'active') {
      targetBucket.push(STRICT_STATUSES.has(skillForm.value.status) ? '待审核/已发布技能不能绑定已停用模板' : '当前模板已停用，建议更换为启用模板')
    }

    const missingLabels = collectMissingParamLabels(selectedTemplate.value, skillForm.value.params || {})
    if (missingLabels.length) {
      targetBucket.push(`缺少模板参数: ${missingLabels.join('、')}`)
    }
  }

  if (!(skillForm.value.short_desc || renderedSkillSummary.value)) {
    targetBucket.push(STRICT_STATUSES.has(skillForm.value.status) ? '待审核/已发布技能需要可展示的简述摘要' : '建议补充简述，方便卡面与后台展示')
  }

  if (effectiveSkillType.value === 'trigger' && !skillForm.value.trigger_event) {
    targetBucket.push(STRICT_STATUSES.has(skillForm.value.status) ? '触发类技能必须指定触发事件' : '触发类技能建议补充触发事件')
  }

  if (!skillForm.value.applicable_rarities.length) {
    warnings.push('尚未配置适用稀有度')
  }
  if (!skillForm.value.tags.length) {
    warnings.push('尚未配置标签')
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
})

const templatePreviewState = computed(() => {
  const preview = {
    summary: '',
    error: '',
  }

  const parsedParamSlots = parseJsonText(tplForm.value.param_slots_raw, [])
  if (parsedParamSlots.error) {
    preview.error = parsedParamSlots.error
    return preview
  }

  const paramSlots = parsedParamSlots.value
  if (!Array.isArray(paramSlots)) {
    preview.error = '参数槽 JSON 必须是数组'
    return preview
  }

  const defaults = {}
  for (const slot of Array.isArray(paramSlots) ? paramSlots : []) {
    if (!slot || typeof slot !== 'object') continue
    if (slot.default !== undefined && slot.default !== null && slot.default !== '') {
      defaults[slot.key] = slot.default
    }
  }

  preview.summary = renderDescriptionTemplate({ description_template: tplForm.value.description_template }, defaults)
  if (!preview.summary && tplForm.value.description_template) {
    preview.error = '描述模板中的部分占位符还没有默认值'
  }

  return preview
})

onMounted(() => {
  loadSkills()
  loadTemplates()
})

onBeforeUnmount(() => {
  if (skillSearchTimer) window.clearTimeout(skillSearchTimer)
})

async function loadSkills() {
  skillLoading.value = true
  try {
    const params = {}
    if (skillSearch.value) params.search = skillSearch.value
    if (skillFilterStatus.value) params.status = skillFilterStatus.value
    if (skillFilterSlot.value) params.slot_semantic = skillFilterSlot.value
    skills.value = await getSkills(params)
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '加载技能失败'))
  } finally {
    skillLoading.value = false
  }
}

async function loadTemplates() {
  tplLoading.value = true
  try {
    templates.value = await getSkillTemplates()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '加载模板失败'))
  } finally {
    tplLoading.value = false
  }
}

function handleSkillSearchInput() {
  if (skillSearchTimer) window.clearTimeout(skillSearchTimer)
  skillSearchTimer = window.setTimeout(() => {
    loadSkills()
  }, 240)
}

function openSkillDialog(row) {
  if (row) {
    skillForm.value = {
      id: row.id,
      version: row.version || 1,
      name: row.name,
      short_desc: row.short_desc || '',
      long_desc: row.long_desc || '',
      template_id: row.template_id || null,
      params: { ...(row.params || {}) },
      skill_type: row.skill_type || 'passive',
      trigger_event: row.trigger_event || null,
      effect_atom: row.effect_atom || null,
      target: row.target || 'self_card',
      tags: [...(row.tags || [])],
      applicable_rarities: [...(row.applicable_rarities || [])],
      slot_semantic: row.slot_semantic || 'main',
      source: row.source || 'manual',
      status: row.status || 'draft',
    }
  } else {
    skillForm.value = defaultSkillForm()
  }
  skillDialogVisible.value = true
}

function onTemplateSelect(templateId) {
  const template = templates.value.find((item) => item.id === templateId)
  const currentParams = { ...(skillForm.value.params || {}) }

  if (!template) {
    skillForm.value.params = {}
    return
  }

  const nextParams = {}
  for (const slot of template.param_slots || []) {
    const currentValue = currentParams[slot.key]
    const hasCurrentValue = currentValue !== undefined && currentValue !== null && currentValue !== ''
    nextParams[slot.key] = hasCurrentValue ? currentValue : (slot.default ?? null)
  }

  skillForm.value.params = nextParams
  skillForm.value.skill_type = template.skill_type
  skillForm.value.effect_atom = template.effect_atom
}

async function saveSkill() {
  if (!skillForm.value.name.trim()) {
    ElMessage.warning('请填写技能名')
    return
  }

  if (skillFormValidation.value.errors.length) {
    ElMessage.warning(skillFormValidation.value.errors.join('；'))
    return
  }

  saving.value = true
  try {
    const payload = {
      ...skillForm.value,
      short_desc: skillForm.value.short_desc || renderedSkillSummary.value,
      skill_type: selectedTemplate.value?.skill_type || skillForm.value.skill_type,
      effect_atom: selectedTemplate.value?.effect_atom || skillForm.value.effect_atom,
      tags: [...skillForm.value.tags],
      applicable_rarities: [...skillForm.value.applicable_rarities],
      params: { ...(skillForm.value.params || {}) },
    }

    if (payload.id) {
      await updateSkill(payload.id, payload)
    } else {
      await createSkill(payload)
    }

    ElMessage.success('保存成功')
    skillDialogVisible.value = false
    await loadSkills()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '保存技能失败'))
  } finally {
    saving.value = false
  }
}

async function handleStatusCmd(row, status) {
  try {
    await updateSkillStatus(row.id, status)
    ElMessage.success('状态已更新')
    await loadSkills()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '更新状态失败'))
  }
}

function openTemplateDialog(row) {
  if (row) {
    tplForm.value = {
      id: row.id,
      template_key: row.template_key,
      name: row.name,
      skill_type: row.skill_type,
      trigger_domain: row.trigger_domain,
      effect_atom: row.effect_atom,
      description_template: row.description_template || '',
      param_slots_raw: JSON.stringify(row.param_slots || [], null, 2),
      applicable_rarities: [...(row.applicable_rarities || [])],
      strength_budget_raw: JSON.stringify(row.strength_budget || {}, null, 2),
      status: row.status || 'active',
    }
  } else {
    tplForm.value = defaultTplForm()
  }
  paramSlotsError.value = ''
  tplDialogVisible.value = true
}

async function saveTemplate() {
  if (!tplForm.value.name.trim()) {
    ElMessage.warning('请填写模板名')
    return
  }
  if (!tplForm.value.description_template.trim()) {
    ElMessage.warning('请填写描述模板')
    return
  }
  if (!tplForm.value.id && !/^[a-z0-9_]+$/.test(tplForm.value.template_key.trim())) {
    ElMessage.warning('模板 Key 只能包含小写字母、数字和下划线')
    return
  }

  let paramSlots
  let strengthBudget

  try {
    paramSlots = JSON.parse(tplForm.value.param_slots_raw || '[]')
    if (!Array.isArray(paramSlots)) throw new Error('参数槽 JSON 必须是数组')
  } catch (error) {
    paramSlotsError.value = error.message || '参数槽 JSON 格式错误'
    return
  }

  try {
    strengthBudget = JSON.parse(tplForm.value.strength_budget_raw || '{}')
    if (!strengthBudget || typeof strengthBudget !== 'object' || Array.isArray(strengthBudget)) {
      throw new Error('强度预算 JSON 必须是对象')
    }
  } catch (error) {
    ElMessage.warning(error.message || '强度预算 JSON 格式错误')
    return
  }

  paramSlotsError.value = ''
  saving.value = true
  try {
    const payload = {
      template_key: tplForm.value.template_key.trim(),
      name: tplForm.value.name.trim(),
      skill_type: tplForm.value.skill_type,
      trigger_domain: tplForm.value.trigger_domain,
      effect_atom: tplForm.value.effect_atom,
      description_template: tplForm.value.description_template.trim(),
      param_slots: paramSlots,
      applicable_rarities: [...tplForm.value.applicable_rarities],
      strength_budget: strengthBudget,
      status: tplForm.value.status,
    }

    if (tplForm.value.id) {
      await updateSkillTemplate(tplForm.value.id, payload)
    } else {
      await createSkillTemplate(payload)
    }

    ElMessage.success('保存成功')
    tplDialogVisible.value = false
    await loadTemplates()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '保存模板失败'))
  } finally {
    saving.value = false
  }
}

function typeTagType(type) {
  const map = { active: 'danger', passive: '', trigger: 'warning', ultimate: 'danger', aura: 'success', captain: 'success' }
  return map[type] || 'info'
}

function statusTagType(status) {
  const map = { draft: 'info', pending: 'warning', published: 'success', disabled: '', archived: 'info' }
  return map[status] ?? 'info'
}

function validationTagType(row) {
  if (row.validation_errors?.length) return 'danger'
  if (row.validation_warnings?.length) return 'warning'
  return 'success'
}

function validationLabel(row) {
  if (row.validation_errors?.length) return '阻塞'
  if (row.validation_warnings?.length) return '待完善'
  return '通过'
}

function validationMessage(row) {
  const parts = []
  if (row.validation_errors?.length) parts.push(`阻塞问题：${row.validation_errors.join('；')}`)
  if (row.validation_warnings?.length) parts.push(`提醒：${row.validation_warnings.join('；')}`)
  return parts.join(' | ')
}

function templateOptionLabel(template) {
  return template.status === 'active' ? template.name : `${template.name}（已停用）`
}

function paramInputKind(slot) {
  if (slot?.options?.length) return 'select'
  if (slot?.input_type === 'number') return 'number'
  if (typeof slot?.default === 'number') return 'number'
  if (slot?.min !== null && slot?.min !== undefined) return 'number'
  if (slot?.max !== null && slot?.max !== undefined) return 'number'
  return 'text'
}

function valueLabel(value) {
  return VALUE_LABELS[value] || value
}

function collectMissingParamLabels(template, params) {
  if (!template?.param_slots?.length) return []
  return template.param_slots
    .filter((slot) => params[slot.key] === undefined || params[slot.key] === null || params[slot.key] === '')
    .map((slot) => slot.label || slot.key)
}

function renderDescriptionTemplate(template, params = {}) {
  if (!template?.description_template) return ''
  const keys = [...template.description_template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((item) => item[1])

  for (const key of keys) {
    const value = params[key]
    if (value === undefined || value === null || value === '') return ''
  }

  return template.description_template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => valueLabel(params[key]))
}

function parseJsonText(raw, fallback) {
  try {
    return { value: JSON.parse(raw || JSON.stringify(fallback)), error: '' }
  } catch {
    return { value: fallback, error: '参数槽 JSON 格式错误' }
  }
}

function extractErrorMessage(error, fallback) {
  return error?.message || fallback
}

function defaultSkillForm() {
  return {
    id: null,
    version: 1,
    name: '',
    short_desc: '',
    long_desc: '',
    template_id: null,
    params: {},
    skill_type: 'passive',
    trigger_event: null,
    effect_atom: null,
    target: 'self_card',
    tags: [],
    applicable_rarities: [],
    slot_semantic: 'main',
    source: 'manual',
    status: 'draft',
  }
}

function defaultTplForm() {
  return {
    id: null,
    template_key: '',
    name: '',
    skill_type: 'passive',
    trigger_domain: 'card',
    effect_atom: 'modify_stat_flat',
    description_template: '',
    param_slots_raw: '[]',
    applicable_rarities: [],
    strength_budget_raw: '{}',
    status: 'active',
  }
}
</script>
