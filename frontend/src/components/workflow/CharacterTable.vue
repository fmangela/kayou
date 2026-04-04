<template>
  <el-card style="margin-bottom:16px">
    <template #header>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:bold">人物管理</span>
        <div style="display:flex;gap:8px">
          <el-button size="small" @click="loadData"><el-icon><Refresh /></el-icon> 刷新</el-button>
          <el-button size="small" type="primary" @click="showAddDialog = true"><el-icon><Plus /></el-icon> 新增</el-button>
          <el-upload :show-file-list="false" accept=".csv" :before-upload="handleImport" style="display:inline">
            <el-button size="small"><el-icon><Upload /></el-icon> 导入CSV</el-button>
          </el-upload>
          <el-button size="small" @click="handleExport"><el-icon><Download /></el-icon> 导出</el-button>
          <el-button size="small" type="danger" :disabled="!selected.length" @click="handleBatchDelete">
            <el-icon><Delete /></el-icon> 批量删除
          </el-button>
        </div>
      </div>
    </template>

    <el-table
      :data="characters"
      v-loading="loading"
      @selection-change="selected = $event"
      border
      size="small"
      style="width:100%"
    >
      <el-table-column type="selection" width="40" />
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="人物名字" width="100" />
      <el-table-column prop="pinyin" label="拼音" width="120" />
      <el-table-column prop="background" label="背景介绍" show-overflow-tooltip />
      <el-table-column prop="appearance" label="外形描述" show-overflow-tooltip />
      <el-table-column prop="nb2_prompt" label="NB2提示词" show-overflow-tooltip />
      <el-table-column prop="mj_prompt" label="MJ提示词" show-overflow-tooltip />
      <el-table-column label="图片" width="80">
        <template #default="{ row }">
          <el-tag size="small">{{ row.image_paths?.length || 0 }}张</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="WebP" width="70">
        <template #default="{ row }">
          <el-tag size="small" type="success">{{ row.webp_paths?.length || 0 }}张</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Generate buttons row -->
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <el-button type="success" :loading="generatingDesc" @click="generateDescriptions()">
        生成人物描述
      </el-button>
      <el-button type="success" :loading="generatingPrompts" @click="generatePrompts()">
        生成提示词
      </el-button>
    </div>

    <!-- Progress log -->
    <div v-if="progressLog.length" style="margin-top:12px;max-height:120px;overflow-y:auto;background:#f5f5f5;padding:8px;border-radius:4px;font-size:12px">
      <div v-for="(line, i) in progressLog" :key="i">{{ line }}</div>
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
        <el-button size="small" style="margin-top:4px" :loading="regenLoading.nb2" @click="regenDesc(editForm.id)">重新生成描述</el-button>
        <el-button size="small" style="margin-top:4px" :loading="regenLoading.prompt" @click="regenPrompt(editForm.id)">重新生成提示词</el-button>
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
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getCharacters, createCharacter, updateCharacter,
  deleteCharacter, batchDeleteCharacters, importCharacters, exportCharacters
} from '../../api/character'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const characters = ref([])
const loading = ref(false)
const selected = ref([])
const showAddDialog = ref(false)
const showEditDialog = ref(false)
const addForm = ref({ name: '' })
const editForm = ref({})
const generatingDesc = ref(false)
const generatingPrompts = ref(false)
const progressLog = ref([])
const regenLoading = ref({ nb2: false, prompt: false })

async function loadData() {
  loading.value = true
  try {
    characters.value = await getCharacters()
  } finally {
    loading.value = false
  }
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

function handleExport() {
  exportCharacters()
}

function streamGenerate(url, body, doneCallback) {
  progressLog.value = []
  const token = auth.token
  fetch(`http://localhost:3174/api${url}`, {
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
          // update local data
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

function generateDescriptions(id) {
  generatingDesc.value = true
  streamGenerate('/llm/generate-descriptions', id ? { id } : {}, () => {
    generatingDesc.value = false
    loadData()
  })
}

function generatePrompts(id) {
  generatingPrompts.value = true
  streamGenerate('/llm/generate-prompts', id ? { id } : {}, () => {
    generatingPrompts.value = false
    loadData()
  })
}

async function regenDesc(id) {
  regenLoading.value.nb2 = true
  streamGenerate('/llm/generate-descriptions', { id }, () => {
    regenLoading.value.nb2 = false
    loadData()
  })
}

async function regenPrompt(id) {
  regenLoading.value.prompt = true
  streamGenerate('/llm/generate-prompts', { id }, () => {
    regenLoading.value.prompt = false
    loadData()
  })
}

onMounted(loadData)
</script>
