<template>
  <el-card style="margin-bottom:16px">
    <template #header>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:bold">AI 绘画</span>
        <el-button type="primary" :loading="generating" @click="batchGenerate">批量生成绘图</el-button>
      </div>
    </template>

    <!-- Progress log -->
    <div v-if="progressLog.length" style="margin-bottom:12px;max-height:100px;overflow-y:auto;background:#f5f5f5;padding:8px;border-radius:4px;font-size:12px">
      <div v-for="(line, i) in progressLog" :key="i">{{ line }}</div>
    </div>

    <el-table :data="characters" v-loading="loading" border size="small" style="width:100%">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="人物" width="90" />
      <el-table-column prop="mj_prompt" label="MJ提示词" show-overflow-tooltip />
      <el-table-column label="图片预览" width="200">
        <template #default="{ row }">
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <el-image
              v-for="(p, i) in row.image_paths"
              :key="i"
              :src="`http://localhost:3174${p}`"
              style="width:40px;height:60px;object-fit:cover;cursor:pointer;border-radius:2px"
              fit="cover"
              @click="openPreview(row, i)"
            />
            <div v-if="!row.image_paths?.length" style="color:#999;font-size:12px">暂无图片</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :loading="row._generating" @click="singleGenerate(row)">重新绘制</el-button>
          <el-button size="small" type="success" @click="openPreview(row, 0)" :disabled="!row.image_paths?.length">预览</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Image preview dialog -->
    <el-dialog v-model="previewDialog.visible" :title="`${previewDialog.character?.name} - 图片预览`" width="800px">
      <div v-if="previewDialog.character">
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          <div
            v-for="(p, i) in previewDialog.character.image_paths"
            :key="i"
            style="position:relative;cursor:pointer"
            :style="previewDialog.activeIndex === i ? 'outline:2px solid #409eff;border-radius:4px' : ''"
            @click="previewDialog.activeIndex = i"
          >
            <el-image
              :src="`http://localhost:3174${p}`"
              style="width:100px;height:150px;object-fit:cover;border-radius:4px"
              fit="cover"
            />
            <el-button
              size="small"
              type="danger"
              circle
              style="position:absolute;top:2px;right:2px;width:20px;height:20px;min-height:20px"
              @click.stop="deleteImage(previewDialog.character, p)"
            >
              <el-icon style="font-size:10px"><Close /></el-icon>
            </el-button>
          </div>
        </div>

        <div v-if="previewDialog.character.image_paths?.length">
          <el-image
            :src="`http://localhost:3174${previewDialog.character.image_paths[previewDialog.activeIndex]}`"
            style="width:100%;max-height:500px;object-fit:contain"
            fit="contain"
          />
          <div style="margin-top:12px;display:flex;gap:8px">
            <el-button @click="autoCrop(previewDialog.character, previewDialog.activeIndex)">自动裁切(2:3)</el-button>
            <el-button @click="openCropDialog(previewDialog.character, previewDialog.activeIndex)">手动裁切</el-button>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- Crop dialog -->
    <el-dialog v-model="cropDialog.visible" title="手动裁切" width="700px">
      <div v-if="cropDialog.imagePath" style="text-align:center">
        <p style="color:#666;margin-bottom:12px">请输入裁切参数（像素），图片比例建议 2:3</p>
        <el-form :model="cropForm" label-width="80px" inline>
          <el-form-item label="Left"><el-input-number v-model="cropForm.left" :min="0" /></el-form-item>
          <el-form-item label="Top"><el-input-number v-model="cropForm.top" :min="0" /></el-form-item>
          <el-form-item label="Width"><el-input-number v-model="cropForm.width" :min="1" /></el-form-item>
          <el-form-item label="Height"><el-input-number v-model="cropForm.height" :min="1" /></el-form-item>
        </el-form>
        <el-image
          :src="`http://localhost:3174${cropDialog.imagePath}?t=${Date.now()}`"
          style="max-width:100%;max-height:400px"
          fit="contain"
        />
      </div>
      <template #footer>
        <el-button @click="cropDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="cropDialog.loading" @click="submitCrop">确认裁切</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getCharacters } from '../../api/character'
import http from '../../api/http'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const characters = ref([])
const loading = ref(false)
const generating = ref(false)
const progressLog = ref([])

const previewDialog = ref({ visible: false, character: null, activeIndex: 0 })
const cropDialog = ref({ visible: false, imagePath: '', character: null, imageIndex: 0, loading: false })
const cropForm = ref({ left: 0, top: 0, width: 400, height: 600 })

async function loadData() {
  loading.value = true
  try {
    characters.value = await getCharacters()
  } finally {
    loading.value = false
  }
}

function openPreview(row, index) {
  previewDialog.value = { visible: true, character: { ...row }, activeIndex: index || 0 }
}

function openCropDialog(character, index) {
  cropDialog.value = {
    visible: true,
    imagePath: character.image_paths[index],
    character,
    imageIndex: index,
    loading: false,
  }
}

async function autoCrop(character, index) {
  try {
    await http.post('/images/crop', { imagePath: character.image_paths[index], mode: 'auto' })
    ElMessage.success('自动裁切完成')
    loadData()
  } catch (e) {
    ElMessage.error(e.message || '裁切失败')
  }
}

async function submitCrop() {
  cropDialog.value.loading = true
  try {
    await http.post('/images/crop', {
      imagePath: cropDialog.value.imagePath,
      mode: 'manual',
      ...cropForm.value,
    })
    ElMessage.success('裁切完成')
    cropDialog.value.visible = false
    loadData()
  } catch (e) {
    ElMessage.error(e.message || '裁切失败')
  } finally {
    cropDialog.value.loading = false
  }
}

async function deleteImage(character, imagePath) {
  await ElMessageBox.confirm('确认删除此图片？', '提示', { type: 'warning' })
  try {
    const res = await http.delete('/drawing/image', { data: { id: character.id, imagePath } })
    ElMessage.success('已删除')
    // update local
    const idx = characters.value.findIndex(c => c.id === character.id)
    if (idx !== -1) characters.value[idx].image_paths = res.image_paths
    previewDialog.value.character.image_paths = res.image_paths
    if (previewDialog.value.activeIndex >= res.image_paths.length) {
      previewDialog.value.activeIndex = Math.max(0, res.image_paths.length - 1)
    }
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

function streamDraw(body, doneCallback) {
  progressLog.value = []
  const token = auth.token
  fetch('http://localhost:3174/api/drawing/generate', {
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
          const statusMap = { submitting: '提交中', waiting: '等待中', done: '完成', error: '失败' }
          progressLog.value.push(`ID ${obj.id}: ${statusMap[obj.status] || obj.status}${obj.error ? ' - ' + obj.error : ''}`)
          if (obj.status === 'done') {
            const idx = characters.value.findIndex(c => c.id === obj.id)
            if (idx !== -1) {
              characters.value[idx].image_paths = [
                ...(characters.value[idx].image_paths || []),
                ...(obj.paths || []),
              ]
            }
          }
        } catch {}
      }
    }
    doneCallback()
  }).catch(e => {
    ElMessage.error(e.message)
    doneCallback()
  })
}

function batchGenerate() {
  generating.value = true
  streamDraw({}, () => {
    generating.value = false
    loadData()
  })
}

function singleGenerate(row) {
  row._generating = true
  streamDraw({ id: row.id }, () => {
    row._generating = false
    loadData()
  })
}

onMounted(loadData)
</script>
