<template>
  <div>
    <el-card style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <el-input v-model="filters.keyword" placeholder="搜索人物/编号/系列/技能" clearable style="width:240px" @keyup.enter="loadData" />
          <el-input v-model="filters.card_code" placeholder="卡牌编号筛选" clearable style="width:180px" />
          <el-select v-model="filters.series_name" placeholder="系列" clearable style="width:160px">
            <el-option v-for="item in options.series" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="filters.faction_name" placeholder="阵营" clearable style="width:160px">
            <el-option v-for="item in options.factions" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="filters.rarity" placeholder="稀有度" clearable style="width:140px">
            <el-option v-for="item in options.rarities" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="filters.element_name" placeholder="属性" clearable style="width:140px">
            <el-option v-for="item in options.elements" :key="item" :label="item" :value="item" />
          </el-select>
          <el-button @click="loadData"><el-icon><Search /></el-icon> 查询</el-button>
          <el-button @click="resetFilters"><el-icon><Refresh /></el-icon> 重置</el-button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <el-button @click="downloadTemplate"><el-icon><Download /></el-icon> 导入模板</el-button>
          <el-upload :show-file-list="false" accept=".csv" :before-upload="handleImport" style="display:inline">
            <el-button><el-icon><Upload /></el-icon> 导入属性</el-button>
          </el-upload>
          <el-button type="primary" @click="handleExport"><el-icon><Download /></el-icon> 导出当前筛选</el-button>
        </div>
      </div>
    </el-card>

    <el-card>
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:bold">卡牌属性编辑</span>
          <span style="color:#666;font-size:12px">人物删除请回到“卡牌图片AI生成 -> 人物管理”处理</span>
        </div>
      </template>

      <el-table
        :data="rows"
        v-loading="loading"
        border
        size="small"
        style="width:100%"
        @sort-change="handleSortChange"
      >
        <el-table-column prop="character_id" label="人物ID" width="80" sortable="custom" />
        <el-table-column prop="name" label="人物名字" width="110" sortable="custom" />
        <el-table-column prop="pinyin" label="拼音" width="120" sortable="custom" />
        <el-table-column prop="card_code" label="卡牌编号" width="140" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="series_name" label="系列" width="110" sortable="custom" />
        <el-table-column prop="faction_name" label="阵营" width="110" sortable="custom" />
        <el-table-column prop="rarity" label="稀有度" width="90" sortable="custom" />
        <el-table-column prop="force_value" label="武力" width="90" sortable="custom" />
        <el-table-column prop="intellect_value" label="智力" width="90" sortable="custom" />
        <el-table-column prop="speed_value" label="速度" width="90" sortable="custom" />
        <el-table-column prop="stamina_value" label="体力" width="90" sortable="custom" />
        <el-table-column prop="element_name" label="属性" width="110" sortable="custom" />
        <el-table-column label="技能1" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.skill1_name || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="技能2" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.skill2_name || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="技能3" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.skill3_name || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="WebP" width="70">
          <template #default="{ row }">
            <el-tag size="small" type="success">{{ row.webp_paths?.length || 0 }}张</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

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
              <el-input v-model="editDialog.form.rarity" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="武力">
              <el-input-number v-model="editDialog.form.force_value" :min="0" :max="10000" controls-position="right" style="width:220px" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="智力">
              <el-input-number v-model="editDialog.form.intellect_value" :min="0" :max="10000" controls-position="right" style="width:220px" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="速度">
              <el-input-number v-model="editDialog.form.speed_value" :min="0" :max="10000" controls-position="right" style="width:220px" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="体力">
              <el-input-number v-model="editDialog.form.stamina_value" :min="0" :max="10000" controls-position="right" style="width:220px" />
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
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  downloadCardAttributeTemplate,
  exportCardAttributes,
  getCardAttributeOptions,
  getCardAttributes,
  importCardAttributes,
  updateCardAttribute,
} from '../../api/cards'

const loading = ref(false)
const rows = ref([])
const options = reactive({
  series: [],
  factions: [],
  rarities: [],
  elements: [],
})
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
const editDialog = ref({ visible: false, saving: false, form: {} })

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
  await Promise.all([loadOptions(), loadData()])
})
</script>
