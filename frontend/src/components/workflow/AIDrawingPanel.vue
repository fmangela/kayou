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
      <el-table-column label="图片预览" width="200">
        <template #default="{ row }">
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <el-image
              v-for="(p, i) in row.image_paths"
              :key="i"
              :src="buildAssetUrl(p)"
              style="width:40px;height:60px;object-fit:cover;cursor:pointer;border-radius:2px"
              fit="cover"
              @click="openPreview(row, i)"
            />
            <div v-if="!row.image_paths?.length" style="color:#999;font-size:12px">暂无图片</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="WebP预览" width="200">
        <template #default="{ row }">
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <el-image
              v-for="(p, i) in row.webp_paths"
              :key="i"
              :src="buildAssetUrl(p)"
              style="width:40px;height:60px;object-fit:cover;cursor:pointer;border-radius:2px"
              fit="cover"
              @click="openWebpPreview(row, i)"
            />
            <div v-if="!row.webp_paths?.length" style="color:#999;font-size:12px">暂无WebP</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <el-button size="small" type="primary" :loading="row._uploading" @click="triggerUpload(row)">手动上传</el-button>
            <el-button size="small" :loading="row._generating" @click="singleGenerate(row)">重新绘制</el-button>
            <el-button size="small" type="success" @click="openPreview(row, 0)" :disabled="!row.image_paths?.length">原图预览</el-button>
            <el-button size="small" :loading="row._convertingAll" :disabled="!row.image_paths?.length" @click="convertAllImages(row)">全部转WebP</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <input
      ref="uploadInputRef"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      multiple
      style="display:none"
      @change="handleUploadChange"
    />

    <!-- Image preview dialog -->
    <el-dialog v-model="previewDialog.visible" :title="`${previewDialog.character?.name} - 图片预览`" width="900px">
      <div v-if="previewDialog.character">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div style="color:#666;font-size:13px">
            已选 {{ getSelectedPreviewCount() }} 张
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <el-button size="small" @click="clearPreviewSelection" :disabled="!getSelectedPreviewCount()">清空选择</el-button>
            <el-button
              size="small"
              type="primary"
              :loading="previewDialog.convertingSelected"
              :disabled="!getSelectedPreviewCount()"
              @click="convertSelectedImages(previewDialog.character)"
            >
              选中转WebP
            </el-button>
            <el-button
              size="small"
              :loading="previewDialog.convertingAll"
              :disabled="!previewDialog.character.image_paths?.length"
              @click="convertAllImages(previewDialog.character)"
            >
              全部转WebP
            </el-button>
            <el-button
              size="small"
              type="success"
              :disabled="!previewDialog.character.webp_paths?.length"
              @click="openWebpPreview(previewDialog.character, 0)"
            >
              查看WebP
            </el-button>
            <el-button
              size="small"
              type="danger"
              :disabled="!getSelectedPreviewCount()"
              @click="deleteSelectedImages(previewDialog.character)"
            >
              删除选中
            </el-button>
          </div>
        </div>

        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          <div
            v-for="(p, i) in previewDialog.character.image_paths"
            :key="i"
            style="position:relative;cursor:pointer"
            :style="getPreviewThumbStyle(i, p)"
            @click="previewDialog.activeIndex = i"
          >
            <el-image
              :src="buildAssetUrl(p)"
              style="width:100px;height:150px;object-fit:cover;border-radius:4px"
              fit="cover"
            />
            <el-button
              size="small"
              circle
              :type="isPreviewSelected(p) ? 'primary' : 'default'"
              style="position:absolute;top:2px;left:2px;width:20px;height:20px;min-height:20px"
              @click.stop="togglePreviewSelection(p)"
            >
              <el-icon style="font-size:10px"><Check /></el-icon>
            </el-button>
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
          <div style="width:min(100%,420px);aspect-ratio:2 / 3;display:flex;align-items:center;justify-content:center;margin:0 auto;background:#f7f7f7;border-radius:6px;overflow:hidden">
            <img
              :src="buildAssetUrl(previewDialog.character.image_paths[previewDialog.activeIndex])"
              alt="预览大图"
              style="width:100%;height:100%;object-fit:contain;object-position:center;display:block"
            />
          </div>
          <div style="margin-top:12px;display:flex;gap:8px">
            <el-button @click="autoCrop(previewDialog.character, previewDialog.activeIndex)">自动裁切(宽2:高3)</el-button>
            <el-button @click="openCropDialog(previewDialog.character, previewDialog.activeIndex)">手动裁切</el-button>
          </div>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="webpPreview.visible" :title="`${webpPreview.character?.name} - WebP预览`" width="900px">
      <div v-if="webpPreview.character">
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          <div
            v-for="(p, i) in webpPreview.character.webp_paths"
            :key="i"
            style="position:relative;cursor:pointer"
            :style="webpPreview.activeIndex === i ? 'outline:2px solid #409eff;border-radius:4px' : 'border-radius:4px'"
            @click="webpPreview.activeIndex = i"
          >
            <el-image
              :src="buildAssetUrl(p)"
              style="width:80px;height:120px;object-fit:cover;border-radius:4px"
              fit="cover"
            />
            <el-button
              size="small"
              type="danger"
              circle
              style="position:absolute;top:2px;right:2px;width:20px;height:20px;min-height:20px"
              @click.stop="deleteWebp(webpPreview.character, p)"
            >
              <el-icon style="font-size:10px"><Close /></el-icon>
            </el-button>
          </div>
        </div>

        <div
          v-if="webpPreview.character.webp_paths?.length"
          style="width:min(100%,420px);aspect-ratio:2 / 3;display:flex;align-items:center;justify-content:center;margin:0 auto;background:#f7f7f7;border-radius:6px;overflow:hidden"
        >
          <img
            :src="buildAssetUrl(webpPreview.character.webp_paths[webpPreview.activeIndex])"
            alt="WebP预览"
            style="width:100%;height:100%;object-fit:contain;object-position:center;display:block"
          />
        </div>
      </div>
    </el-dialog>

    <!-- Crop dialog -->
    <el-dialog v-model="cropDialog.visible" title="手动裁切" width="760px">
      <div v-if="cropDialog.imagePath" style="text-align:center">
        <p style="color:#666;margin-bottom:12px">请输入裁切参数（像素），图片比例建议 宽2:高3</p>
        <el-form :model="cropForm" label-width="80px" inline>
          <el-form-item label="Left"><el-input-number v-model="cropForm.left" :min="0" /></el-form-item>
          <el-form-item label="Top"><el-input-number v-model="cropForm.top" :min="0" /></el-form-item>
          <el-form-item label="Width"><el-input-number v-model="cropForm.width" :min="1" /></el-form-item>
          <el-form-item label="Height"><el-input-number v-model="cropForm.height" :min="1" /></el-form-item>
        </el-form>
        <div style="width:min(100%,420px);aspect-ratio:2 / 3;display:flex;align-items:center;justify-content:center;margin:0 auto;background:#f7f7f7;border-radius:6px;overflow:hidden">
          <img
            :src="`${buildAssetUrl(cropDialog.imagePath)}?t=${Date.now()}`"
            alt="裁切预览"
            style="width:100%;height:100%;object-fit:contain;object-position:center;display:block"
          />
        </div>
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
import { buildApiUrl, buildAssetUrl } from '../../api/runtime'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const characters = ref([])
const loading = ref(false)
const generating = ref(false)
const progressLog = ref([])
const uploadInputRef = ref(null)
const uploadCharacter = ref(null)
const previewSelections = ref([])

const previewDialog = ref({ visible: false, character: null, activeIndex: 0, convertingSelected: false, convertingAll: false })
const webpPreview = ref({ visible: false, character: null, activeIndex: 0 })
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
  previewSelections.value = []
  previewDialog.value = {
    visible: true,
    character: { ...row },
    activeIndex: index || 0,
    convertingSelected: false,
    convertingAll: false,
  }
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
    applyImagePathsUpdate(character.id, res.image_paths)
    previewSelections.value = previewSelections.value.filter(item => item !== imagePath)
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

function applyImagePathsUpdate(characterId, imagePaths) {
  const idx = characters.value.findIndex(c => c.id === characterId)
  if (idx !== -1) characters.value[idx].image_paths = imagePaths
  if (previewDialog.value.character?.id === characterId) {
    previewDialog.value.character.image_paths = imagePaths
    if (previewDialog.value.activeIndex >= imagePaths.length) {
      previewDialog.value.activeIndex = Math.max(0, imagePaths.length - 1)
    }
  }
}

function applyWebpPathsUpdate(characterId, webpPaths) {
  const idx = characters.value.findIndex(c => c.id === characterId)
  if (idx !== -1) characters.value[idx].webp_paths = webpPaths
  if (previewDialog.value.character?.id === characterId) {
    previewDialog.value.character.webp_paths = webpPaths
  }
  if (webpPreview.value.character?.id === characterId) {
    webpPreview.value.character.webp_paths = webpPaths
    if (webpPreview.value.activeIndex >= webpPaths.length) {
      webpPreview.value.activeIndex = Math.max(0, webpPaths.length - 1)
    }
  }
}

function togglePreviewSelection(imagePath) {
  if (previewSelections.value.includes(imagePath)) {
    previewSelections.value = previewSelections.value.filter(item => item !== imagePath)
  } else {
    previewSelections.value = [...previewSelections.value, imagePath]
  }
}

function isPreviewSelected(imagePath) {
  return previewSelections.value.includes(imagePath)
}

function getSelectedPreviewCount() {
  return previewSelections.value.length
}

function clearPreviewSelection() {
  previewSelections.value = []
}

function getPreviewThumbStyle(index, imagePath) {
  const styles = []
  if (previewDialog.value.activeIndex === index) styles.push('outline:2px solid #409eff')
  if (isPreviewSelected(imagePath)) styles.push('box-shadow:0 0 0 2px rgba(64,158,255,0.35) inset')
  styles.push('border-radius:4px')
  return styles.join(';')
}

async function deleteSelectedImages(character) {
  if (!previewSelections.value.length) return

  await ElMessageBox.confirm(`确认删除选中的 ${previewSelections.value.length} 张图片？`, '提示', { type: 'warning' })
  try {
    const res = await http.delete('/drawing/images', {
      data: { id: character.id, imagePaths: previewSelections.value },
    })
    ElMessage.success('已删除选中图片')
    applyImagePathsUpdate(character.id, res.image_paths)
    previewSelections.value = []
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

async function convertSelectedImages(character) {
  if (!previewSelections.value.length) return

  previewDialog.value.convertingSelected = true
  try {
    const res = await http.post('/images/to-webp', { id: character.id, imagePaths: previewSelections.value })
    ElMessage.success('选中图片已转换为 WebP')
    applyWebpPathsUpdate(character.id, res.webp_paths)
    previewSelections.value = []
  } catch (e) {
    ElMessage.error(e.message || '转换失败')
  } finally {
    previewDialog.value.convertingSelected = false
  }
}

async function convertAllImages(character) {
  if (!character.image_paths?.length) return

  character._convertingAll = true
  if (previewDialog.value.character?.id === character.id) {
    previewDialog.value.convertingAll = true
  }
  try {
    const res = await http.post('/images/to-webp', { id: character.id, imagePaths: character.image_paths })
    ElMessage.success('全部图片已转换为 WebP')
    applyWebpPathsUpdate(character.id, res.webp_paths)
  } catch (e) {
    ElMessage.error(e.message || '转换失败')
  } finally {
    character._convertingAll = false
    if (previewDialog.value.character?.id === character.id) {
      previewDialog.value.convertingAll = false
    }
  }
}

function openWebpPreview(row, index) {
  webpPreview.value = { visible: true, character: { ...row }, activeIndex: index || 0 }
}

async function deleteWebp(character, webpPath) {
  await ElMessageBox.confirm('确认删除此WebP文件？', '提示', { type: 'warning' })
  try {
    const res = await http.delete('/images/webp', { data: { id: character.id, webpPath } })
    ElMessage.success('已删除')
    applyWebpPathsUpdate(character.id, res.webp_paths)
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

function triggerUpload(row) {
  uploadCharacter.value = row
  if (uploadInputRef.value) {
    uploadInputRef.value.value = ''
    uploadInputRef.value.click()
  }
}

async function handleUploadChange(event) {
  const files = Array.from(event.target.files || [])
  const character = uploadCharacter.value
  event.target.value = ''

  if (!character || !files.length) return

  character._uploading = true
  try {
    const form = new FormData()
    form.append('id', character.id)
    files.forEach(file => form.append('images', file))

    const res = await http.post('/drawing/upload', form)
    applyImagePathsUpdate(character.id, res.image_paths)
    ElMessage.success('图片已上传并自动裁切为 2:3')
  } catch (e) {
    ElMessage.error(e.message || '上传失败')
  } finally {
    character._uploading = false
    uploadCharacter.value = null
  }
}

function streamDraw(body, doneCallback) {
  progressLog.value = []
  const token = auth.token
  fetch(buildApiUrl('/drawing/generate'), {
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
