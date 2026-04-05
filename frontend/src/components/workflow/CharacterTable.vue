<template>
  <el-card style="margin-bottom:16px">
    <template #header>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span style="font-weight:bold">人物管理</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <el-button size="small" @click="loadData"><el-icon><Refresh /></el-icon> 刷新</el-button>
            <el-button size="small" type="primary" @click="showAddDialog = true"><el-icon><Plus /></el-icon> 新增</el-button>
            <el-upload :show-file-list="false" accept=".csv,.xlsx,.xls" :before-upload="handleImport" style="display:inline">
              <el-button size="small"><el-icon><Upload /></el-icon> 导入人物</el-button>
            </el-upload>
            <el-button size="small" @click="handleExport"><el-icon><Download /></el-icon> 导出</el-button>
            <el-button size="small" :disabled="!selected.length" :loading="batchGeneratingDesc" @click="handleBatchRegenDesc">
              选中重新生成描述
            </el-button>
            <el-button size="small" :disabled="!selected.length" :loading="batchGeneratingPrompt" @click="handleBatchRegenPrompt">
              选中重新生成提示词
            </el-button>
            <el-button size="small" type="danger" :disabled="!selected.length" @click="handleBatchDelete">
              <el-icon><Delete /></el-icon> 批量删除
            </el-button>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <el-input
            v-model="filters.keyword"
            clearable
            placeholder="搜索人物/拼音/背景/提示词"
            style="width:240px"
          />
          <el-select v-model="filters.descStatus" style="width:150px">
            <el-option label="描述全部" value="all" />
            <el-option label="已有描述" value="complete" />
            <el-option label="缺少描述" value="incomplete" />
          </el-select>
          <el-select v-model="filters.promptStatus" style="width:150px">
            <el-option label="提示词全部" value="all" />
            <el-option label="已有提示词" value="complete" />
            <el-option label="缺少提示词" value="incomplete" />
          </el-select>
          <el-select v-model="filters.imageStatus" style="width:150px">
            <el-option label="原图全部" value="all" />
            <el-option label="已有原图" value="has" />
            <el-option label="没有原图" value="none" />
          </el-select>
          <el-select v-model="filters.webpStatus" style="width:150px">
            <el-option label="WebP全部" value="all" />
            <el-option label="已有WebP" value="has" />
            <el-option label="没有WebP" value="none" />
          </el-select>
          <el-button @click="resetFilters">重置筛选</el-button>
        </div>
      </div>
    </template>

    <div v-if="progressLog.length" style="margin-bottom:12px;max-height:120px;overflow-y:auto;background:#f5f5f5;padding:8px;border-radius:4px;font-size:12px">
      <div v-for="(line, i) in progressLog" :key="i">{{ line }}</div>
    </div>

    <el-table
      :data="pagedCharacters"
      v-loading="loading"
      @selection-change="selected = $event"
      @sort-change="handleSortChange"
      border
      size="small"
      style="width:100%"
    >
      <el-table-column type="selection" width="40" />
      <el-table-column prop="id" label="ID" width="70" sortable="custom" />
      <el-table-column prop="name" label="人物名字" width="110" sortable="custom" />
      <el-table-column prop="pinyin" label="拼音" width="130" sortable="custom" />
      <el-table-column prop="background" label="背景介绍" min-width="180" show-overflow-tooltip />
      <el-table-column prop="appearance" label="外形描述" min-width="180" show-overflow-tooltip />
      <el-table-column prop="nb2_prompt" label="NB2提示词" min-width="180" show-overflow-tooltip />
      <el-table-column prop="mj_prompt" label="MJ提示词" min-width="180" show-overflow-tooltip />
      <el-table-column label="图片" width="80" sortable="custom" prop="image_count">
        <template #default="{ row }">
          <el-tag size="small">{{ row.image_paths?.length || 0 }}张</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="WebP" width="90" sortable="custom" prop="webp_count">
        <template #default="{ row }">
          <el-tag size="small" type="success">{{ row.webp_paths?.length || 0 }}张</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div style="display:flex;justify-content:flex-end;margin-top:12px">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[20, 50, 100, 200]"
        :total="filteredCharacters.length"
        layout="total, sizes, prev, pager, next, jumper"
      />
    </div>
  </el-card>

  <!-- Add dialog -->
  <el-dialog v-model="showAddDialog" title="新增人物" width="400px">
    <el-form :model="addForm">
      <el-form-item label="人物名字">
        <el-input v-model="addForm.name" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showAddDialog = false">取消</el-button>
      <el-button type="primary" @click="handleAdd">确定</el-button>
    </template>
  </el-dialog>

  <!-- Edit dialog -->
  <el-dialog v-model="showEditDialog" title="编辑人物" width="600px">
    <el-form :model="editForm" label-width="100px">
      <el-form-item label="人物名字"><el-input v-model="editForm.name" /></el-form-item>
      <el-form-item label="拼音"><el-input v-model="editForm.pinyin" /></el-form-item>
      <el-form-item label="背景介绍">
        <el-input v-model="editForm.background" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item label="外形描述">
        <el-input v-model="editForm.appearance" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item label="NB2提示词">
        <el-input v-model="editForm.nb2_prompt" type="textarea" :rows="2" />
      </el-form-item>
      <el-form-item label="MJ提示词">
        <el-input v-model="editForm.mj_prompt" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showEditDialog = false">取消</el-button>
      <el-button type="primary" @click="handleUpdate">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getCharacters, createCharacter, updateCharacter,
  deleteCharacter, batchDeleteCharacters, importCharacters, exportCharacters
} from '../../api/character'
import { buildApiUrl } from '../../api/runtime'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const characters = ref([])
const loading = ref(false)
const selected = ref([])
const showAddDialog = ref(false)
const showEditDialog = ref(false)
const addForm = ref({ name: '' })
const editForm = ref({})
const pagination = ref({ page: 1, pageSize: 20 })
const batchGeneratingDesc = ref(false)
const batchGeneratingPrompt = ref(false)
const progressLog = ref([])
const filters = ref({
  keyword: '',
  descStatus: 'all',
  promptStatus: 'all',
  imageStatus: 'all',
  webpStatus: 'all',
})
const sortState = ref({ prop: 'id', order: 'ascending' })

const filteredCharacters = computed(() => {
  const keyword = filters.value.keyword.trim().toLowerCase()

  return characters.value.filter((row) => {
    const hasDesc = Boolean(row.background?.trim() && row.appearance?.trim())
    const hasPrompt = Boolean(row.nb2_prompt?.trim() && row.mj_prompt?.trim())
    const hasImage = Boolean(row.image_paths?.length)
    const hasWebp = Boolean(row.webp_paths?.length)

    if (filters.value.descStatus === 'complete' && !hasDesc) return false
    if (filters.value.descStatus === 'incomplete' && hasDesc) return false
    if (filters.value.promptStatus === 'complete' && !hasPrompt) return false
    if (filters.value.promptStatus === 'incomplete' && hasPrompt) return false
    if (filters.value.imageStatus === 'has' && !hasImage) return false
    if (filters.value.imageStatus === 'none' && hasImage) return false
    if (filters.value.webpStatus === 'has' && !hasWebp) return false
    if (filters.value.webpStatus === 'none' && hasWebp) return false

    if (!keyword) return true

    const text = [
      row.id,
      row.name,
      row.pinyin,
      row.background,
      row.appearance,
      row.nb2_prompt,
      row.mj_prompt,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return text.includes(keyword)
  })
})

const sortedCharacters = computed(() => {
  const rows = [...filteredCharacters.value]
  const { prop, order } = sortState.value
  if (!prop || !order) return rows

  const direction = order === 'descending' ? -1 : 1
  return rows.sort((a, b) => {
    let av
    let bv

    if (prop === 'image_count') {
      av = a.image_paths?.length || 0
      bv = b.image_paths?.length || 0
    } else if (prop === 'webp_count') {
      av = a.webp_paths?.length || 0
      bv = b.webp_paths?.length || 0
    } else {
      av = a[prop]
      bv = b[prop]
    }

    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction

    const aText = String(av ?? '').toLowerCase()
    const bText = String(bv ?? '').toLowerCase()
    return aText.localeCompare(bText, 'zh-Hans-CN') * direction
  })
})

const pagedCharacters = computed(() => {
  const start = (pagination.value.page - 1) * pagination.value.pageSize
  const end = start + pagination.value.pageSize
  return sortedCharacters.value.slice(start, end)
})

watch(() => pagination.value.pageSize, () => {
  pagination.value.page = 1
})

watch([characters, filteredCharacters, () => pagination.value.pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(filteredCharacters.value.length / pagination.value.pageSize))
  if (pagination.value.page > maxPage) {
    pagination.value.page = maxPage
  }
})

watch(filters, () => {
  pagination.value.page = 1
}, { deep: true })

async function loadData() {
  loading.value = true
  try {
    characters.value = await getCharacters()
  } finally {
    loading.value = false
  }
}

defineExpose({ loadData })

function resetFilters() {
  filters.value = {
    keyword: '',
    descStatus: 'all',
    promptStatus: 'all',
    imageStatus: 'all',
    webpStatus: 'all',
  }
  sortState.value = { prop: 'id', order: 'ascending' }
}

function handleSortChange({ prop, order }) {
  sortState.value = { prop, order }
}

async function handleAdd() {
  try {
    await createCharacter(addForm.value)
    ElMessage.success('新增成功')
    showAddDialog.value = false
    addForm.value = { name: '' }
    loadData()
  } catch (e) {
    ElMessage.error(e.message || '新增失败')
  }
}

function openEdit(row) {
  editForm.value = { ...row }
  showEditDialog.value = true
}

async function handleUpdate() {
  try {
    await updateCharacter(editForm.value.id, editForm.value)
    ElMessage.success('保存成功')
    showEditDialog.value = false
    loadData()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}

async function handleDelete(id) {
  await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
  await deleteCharacter(id)
  ElMessage.success('已删除')
  loadData()
}

async function handleBatchDelete() {
  await ElMessageBox.confirm(`确认删除选中的 ${selected.value.length} 条？`, '提示', { type: 'warning' })
  await batchDeleteCharacters(selected.value.map(r => r.id))
  ElMessage.success('已批量删除')
  loadData()
}

async function handleImport(file) {
  try {
    const res = await importCharacters(file)
    ElMessage.success(`导入成功，新增 ${res.inserted} 条`)
    loadData()
  } catch (e) {
    ElMessage.error(e.message || '导入失败')
  }
  return false
}

async function handleExport() {
  try {
    await exportCharacters()
  } catch (e) {
    ElMessage.error(e.message || '导出失败')
  }
}

function streamRegen(url, body, loadingRef, doneCallback) {
  progressLog.value = []
  loadingRef.value = true
  const token = auth.token
  fetch(buildApiUrl(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).then(async (resp) => {
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') { doneCallback(); return }
        try {
          const obj = JSON.parse(data)
          if (obj.error) progressLog.value.push(`❌ ID ${obj.id}: ${obj.error}`)
          else progressLog.value.push(`✓ ID ${obj.id} 完成`)
          const idx = characters.value.findIndex(c => c.id === obj.id)
          if (idx !== -1) characters.value[idx] = { ...characters.value[idx], ...obj }
        } catch {}
      }
    }
    doneCallback()
  }).catch(e => {
    ElMessage.error(e.message)
    doneCallback()
  })
}

function handleBatchRegenDesc() {
  streamRegen('/llm/generate-descriptions', { ids: selected.value.map(row => row.id) }, batchGeneratingDesc, () => {
    batchGeneratingDesc.value = false
    loadData()
  })
}

function handleBatchRegenPrompt() {
  streamRegen('/llm/generate-prompts', { ids: selected.value.map(row => row.id) }, batchGeneratingPrompt, () => {
    batchGeneratingPrompt.value = false
    loadData()
  })
}

onMounted(loadData)
</script>
