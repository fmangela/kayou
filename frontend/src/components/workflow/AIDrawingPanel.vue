<template>
  <el-card style="margin-bottom:16px">
    <template #header>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span style="font-weight:bold">AI 绘画</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <el-button :loading="loading" @click="loadData">刷新</el-button>
            <el-button type="primary" :loading="batchGenerating" :disabled="!selected.length" @click="handleBatchGenerate">
              选中重新绘制
            </el-button>
            <el-button :loading="batchConverting" :disabled="!selected.length" @click="handleBatchConvertAll">
              选中全部转WebP
            </el-button>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <el-input
            v-model="filters.keyword"
            clearable
            placeholder="搜索人物/拼音"
            style="width:220px"
          />
          <el-select v-model="filters.imageStatus" style="width:160px">
            <el-option label="原图全部" value="all" />
            <el-option label="已有原图" value="has" />
            <el-option label="没有原图" value="none" />
          </el-select>
          <el-select v-model="filters.webpStatus" style="width:160px">
            <el-option label="WebP全部" value="all" />
            <el-option label="已有WebP" value="has" />
            <el-option label="没有WebP" value="none" />
          </el-select>
          <el-button @click="resetFilters">重置筛选</el-button>
        </div>
      </div>
    </template>

    <!-- Progress log -->
    <div v-if="progressLog.length" style="margin-bottom:12px;max-height:100px;overflow-y:auto;background:#f5f5f5;padding:8px;border-radius:4px;font-size:12px">
      <div v-for="(line, i) in progressLog" :key="i">{{ line }}</div>
    </div>

    <el-table
      ref="tableRef"
      :data="pagedCharacters"
      v-loading="loading"
      border
      size="small"
      style="width:100%"
      row-key="id"
      @selection-change="selected = $event"
      @sort-change="handleSortChange"
    >
      <el-table-column type="selection" width="44" reserve-selection />
      <el-table-column prop="id" label="ID" width="70" sortable="custom" />
      <el-table-column prop="name" label="人物" width="110" sortable="custom" />
      <el-table-column prop="pinyin" label="拼音" width="130" sortable="custom" />
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
      <el-table-column label="原图" width="90" prop="image_count" sortable="custom">
        <template #default="{ row }">
          <el-tag size="small">{{ row.image_paths?.length || 0 }}张</el-tag>
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
      <el-table-column label="WebP" width="100" prop="webp_count" sortable="custom">
        <template #default="{ row }">
          <el-tag size="small" type="success">{{ row.webp_paths?.length || 0 }}张</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <el-button size="small" type="primary" :loading="row._uploading" @click="triggerUpload(row)">手动上传</el-button>
            <el-button size="small" type="success" @click="openPreview(row, 0)" :disabled="!row.image_paths?.length">原图预览</el-button>
          </div>
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
            <el-button @click="autoCrop(previewDialog.character, previewDialog.activeIndex)">自动裁切(750x1125 / 宽2:高3)</el-button>
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
    <el-dialog v-model="cropDialog.visible" title="手动裁切" width="860px" @closed="resetCropDialogState">
      <div v-if="cropDialog.imagePath" class="crop-dialog">
        <p class="crop-dialog__hint">拖动蓝色框调整位置，拖动四角缩放，裁切比例固定为宽2:高3。</p>

        <div v-if="cropDialog.imageLoading" class="crop-dialog__status">图片加载中...</div>

        <div v-else-if="cropStage.ready" class="crop-dialog__workspace">
          <div
            ref="cropStageRef"
            class="crop-stage"
            :style="cropStageStyle"
          >
            <img
              :src="cropPreviewSrc"
              alt="裁切预览"
              class="crop-stage__image"
              draggable="false"
            />

            <div
              class="crop-selection"
              :style="cropSelectionStyle"
              @pointerdown.prevent="startCropInteraction('move', $event)"
            >
              <div class="crop-selection__label">{{ cropForm.width }} x {{ cropForm.height }}</div>
              <button
                v-for="handle in cropHandles"
                :key="handle.position"
                type="button"
                class="crop-selection__handle"
                :class="`crop-selection__handle--${handle.position}`"
                @pointerdown.stop.prevent="startCropInteraction(handle.mode, $event)"
              />
            </div>
          </div>

          <div class="crop-dialog__meta">
            <span>原图：{{ cropStage.naturalWidth }} x {{ cropStage.naturalHeight }}</span>
            <span>裁切：Left {{ cropForm.left }}, Top {{ cropForm.top }}, Width {{ cropForm.width }}, Height {{ cropForm.height }}</span>
            <el-button :disabled="cropDialog.loading" @click="resetCropSelection">重置选区</el-button>
          </div>
        </div>

        <div v-else class="crop-dialog__status">图片加载失败，暂时无法裁切。</div>
      </div>
      <template #footer>
        <el-button @click="cropDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="cropDialog.loading" :disabled="!cropStage.ready" @click="submitCrop">确认裁切</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getCharacters } from '../../api/character'
import http from '../../api/http'
import { buildApiUrl, buildAssetUrl } from '../../api/runtime'
import { useAuthStore } from '../../stores/auth'

const MIN_UPLOAD_WIDTH = 750
const MIN_UPLOAD_HEIGHT = 1125
const CROP_RATIO = 2 / 3
const CROP_STAGE_MAX_WIDTH = 560
const CROP_STAGE_MAX_HEIGHT = 680
const CROP_MIN_WIDTH = 80

const auth = useAuthStore()
const characters = ref([])
const loading = ref(false)
const batchGenerating = ref(false)
const batchConverting = ref(false)
const progressLog = ref([])
const selected = ref([])
const tableRef = ref(null)
const uploadInputRef = ref(null)
const uploadCharacter = ref(null)
const cropStageRef = ref(null)
const previewSelections = ref([])
const pagination = ref({ page: 1, pageSize: 20 })
const filters = ref({
  keyword: '',
  imageStatus: 'all',
  webpStatus: 'all',
})
const sortState = ref({ prop: 'id', order: 'ascending' })

const previewDialog = ref({ visible: false, character: null, activeIndex: 0, convertingSelected: false, convertingAll: false })
const webpPreview = ref({ visible: false, character: null, activeIndex: 0 })
const cropDialog = ref(createEmptyCropDialog())
const cropStage = ref(createEmptyCropStage())
const cropRect = ref(createEmptyCropRect())
const cropInteraction = ref(null)
const cropForm = ref({ left: 0, top: 0, width: 0, height: 0 })
const cropHandles = [
  { position: 'nw', mode: 'resize-nw' },
  { position: 'ne', mode: 'resize-ne' },
  { position: 'sw', mode: 'resize-sw' },
  { position: 'se', mode: 'resize-se' },
]

function createEmptyCropDialog() {
  return {
    visible: false,
    imagePath: '',
    character: null,
    imageIndex: 0,
    loading: false,
    imageLoading: false,
    cacheBust: 0,
  }
}

function createEmptyCropStage() {
  return {
    ready: false,
    naturalWidth: 0,
    naturalHeight: 0,
    stageWidth: 0,
    stageHeight: 0,
  }
}

function createEmptyCropRect() {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  }
}

const cropPreviewSrc = computed(() => {
  if (!cropDialog.value.imagePath) return ''
  const baseUrl = buildAssetUrl(cropDialog.value.imagePath)
  if (!cropDialog.value.cacheBust) return baseUrl
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}t=${cropDialog.value.cacheBust}`
})

const cropStageStyle = computed(() => ({
  width: `${cropStage.value.stageWidth}px`,
  height: `${cropStage.value.stageHeight}px`,
}))

const cropSelectionStyle = computed(() => ({
  left: `${cropRect.value.x}px`,
  top: `${cropRect.value.y}px`,
  width: `${cropRect.value.width}px`,
  height: `${cropRect.value.height}px`,
}))

const filteredCharacters = computed(() => {
  const keyword = filters.value.keyword.trim().toLowerCase()

  return characters.value.filter((row) => {
    const hasImage = Boolean(row.image_paths?.length)
    const hasWebp = Boolean(row.webp_paths?.length)

    if (filters.value.imageStatus === 'has' && !hasImage) return false
    if (filters.value.imageStatus === 'none' && hasImage) return false
    if (filters.value.webpStatus === 'has' && !hasWebp) return false
    if (filters.value.webpStatus === 'none' && hasWebp) return false

    if (!keyword) return true

    const text = [row.id, row.name, row.pinyin].filter(Boolean).join(' ').toLowerCase()
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
  if (pagination.value.page > maxPage) pagination.value.page = maxPage
})

watch(filters, () => {
  pagination.value.page = 1
}, { deep: true })

async function loadData() {
  loading.value = true
  try {
    characters.value = await getCharacters()
    selected.value = []
    await nextTick()
    tableRef.value?.clearSelection?.()
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.value = {
    keyword: '',
    imageStatus: 'all',
    webpStatus: 'all',
  }
  sortState.value = { prop: 'id', order: 'ascending' }
}

function handleSortChange({ prop, order }) {
  sortState.value = { prop, order }
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
    ...createEmptyCropDialog(),
    visible: true,
    imagePath: character.image_paths[index],
    character,
    imageIndex: index,
    loading: false,
    imageLoading: true,
    cacheBust: Date.now(),
  }
  void initializeCropDialog()
}

async function autoCrop(character, index) {
  try {
    await http.post('/images/crop', { imagePath: character.image_paths[index], mode: 'auto' })
    ElMessage.success('自动裁切完成，已压缩为 750x1125')
    loadData()
  } catch (e) {
    ElMessage.error(e.message || '裁切失败')
  }
}

async function submitCrop() {
  if (!cropStage.value.ready) return
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

async function initializeCropDialog() {
  const requestToken = cropDialog.value.cacheBust
  stopCropInteraction()
  cropStage.value = createEmptyCropStage()
  cropRect.value = createEmptyCropRect()
  cropForm.value = { left: 0, top: 0, width: 0, height: 0 }

  try {
    const { width, height } = await loadRemoteImageDimensions(cropPreviewSrc.value)
    if (requestToken !== cropDialog.value.cacheBust) return

    const { stageWidth, stageHeight } = getCropStageSize(width, height)

    cropStage.value = {
      ready: true,
      naturalWidth: width,
      naturalHeight: height,
      stageWidth,
      stageHeight,
    }

    resetCropSelection()
  } catch (error) {
    if (requestToken !== cropDialog.value.cacheBust) return
    cropStage.value = createEmptyCropStage()
    ElMessage.error(error.message || '图片加载失败')
  } finally {
    if (requestToken !== cropDialog.value.cacheBust) return
    cropDialog.value.imageLoading = false
  }
}

function resetCropDialogState() {
  stopCropInteraction()
  cropDialog.value = createEmptyCropDialog()
  cropStage.value = createEmptyCropStage()
  cropRect.value = createEmptyCropRect()
  cropForm.value = { left: 0, top: 0, width: 0, height: 0 }
}

function resetCropSelection() {
  if (!cropStage.value.ready) return
  applyCropRect(buildDefaultCropRect(cropStage.value.stageWidth, cropStage.value.stageHeight))
}

function loadRemoteImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }

    img.onerror = () => {
      reject(new Error('无法读取原图尺寸'))
    }

    img.src = src
  })
}

function getCropStageSize(naturalWidth, naturalHeight) {
  const scale = Math.min(CROP_STAGE_MAX_WIDTH / naturalWidth, CROP_STAGE_MAX_HEIGHT / naturalHeight, 1)
  return {
    stageWidth: Math.max(1, Math.round(naturalWidth * scale)),
    stageHeight: Math.max(1, Math.round(naturalHeight * scale)),
  }
}

function buildDefaultCropRect(stageWidth, stageHeight) {
  const maxWidth = Math.min(stageWidth, stageHeight * CROP_RATIO)
  const targetWidth = Math.min(maxWidth, Math.max(Math.min(maxWidth, CROP_MIN_WIDTH), Math.round(maxWidth * 0.85)))
  const targetHeight = targetWidth / CROP_RATIO

  return {
    x: Math.round((stageWidth - targetWidth) / 2),
    y: Math.round((stageHeight - targetHeight) / 2),
    width: Math.round(targetWidth),
    height: Math.round(targetHeight),
  }
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getCropMinWidth(stageWidth, stageHeight) {
  return Math.min(CROP_MIN_WIDTH, Math.min(stageWidth, stageHeight * CROP_RATIO))
}

function applyCropRect(rect) {
  cropRect.value = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
  syncCropForm()
}

function syncCropForm() {
  if (!cropStage.value.ready || !cropRect.value.width || !cropRect.value.height) return

  const scaleX = cropStage.value.naturalWidth / cropStage.value.stageWidth
  const scaleY = cropStage.value.naturalHeight / cropStage.value.stageHeight
  const left = Math.round(cropRect.value.x * scaleX)
  const top = Math.round(cropRect.value.y * scaleY)
  const width = Math.round(cropRect.value.width * scaleX)
  const height = Math.round(cropRect.value.height * scaleY)

  cropForm.value = {
    left,
    top,
    width: Math.min(cropStage.value.naturalWidth - left, width),
    height: Math.min(cropStage.value.naturalHeight - top, height),
  }
}

function startCropInteraction(mode, event) {
  if (!cropStage.value.ready || !cropStageRef.value) return

  stopCropInteraction()

  cropInteraction.value = {
    mode,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startRect: { ...cropRect.value },
    stageBounds: cropStageRef.value.getBoundingClientRect(),
  }

  window.addEventListener('pointermove', handleCropPointerMove)
  window.addEventListener('pointerup', stopCropInteraction)
  window.addEventListener('pointercancel', stopCropInteraction)
}

function stopCropInteraction() {
  if (!cropInteraction.value) return

  cropInteraction.value = null
  window.removeEventListener('pointermove', handleCropPointerMove)
  window.removeEventListener('pointerup', stopCropInteraction)
  window.removeEventListener('pointercancel', stopCropInteraction)
}

function handleCropPointerMove(event) {
  if (!cropInteraction.value || !cropStage.value.ready) return
  event.preventDefault()

  const state = cropInteraction.value
  if (state.mode === 'move') {
    handleCropMove(state, event)
  } else {
    handleCropResize(state, event)
  }
}

function handleCropMove(state, event) {
  const x = clampNumber(
    state.startRect.x + (event.clientX - state.startClientX),
    0,
    cropStage.value.stageWidth - state.startRect.width
  )
  const y = clampNumber(
    state.startRect.y + (event.clientY - state.startClientY),
    0,
    cropStage.value.stageHeight - state.startRect.height
  )

  applyCropRect({
    ...state.startRect,
    x,
    y,
  })
}

function handleCropResize(state, event) {
  const localX = clampNumber(event.clientX - state.stageBounds.left, 0, cropStage.value.stageWidth)
  const localY = clampNumber(event.clientY - state.stageBounds.top, 0, cropStage.value.stageHeight)
  const nextRect = getResizedCropRect(state.mode, localX, localY, state.startRect)
  applyCropRect(nextRect)
}

function getResizedCropRect(mode, localX, localY, startRect) {
  const minWidth = getCropMinWidth(cropStage.value.stageWidth, cropStage.value.stageHeight)

  if (mode === 'resize-se') {
    return buildCornerResizeRect(startRect.x, startRect.y, localX - startRect.x, localY - startRect.y, 'se', minWidth)
  }

  if (mode === 'resize-nw') {
    return buildCornerResizeRect(startRect.x + startRect.width, startRect.y + startRect.height, startRect.x + startRect.width - localX, startRect.y + startRect.height - localY, 'nw', minWidth)
  }

  if (mode === 'resize-ne') {
    return buildCornerResizeRect(startRect.x, startRect.y + startRect.height, localX - startRect.x, startRect.y + startRect.height - localY, 'ne', minWidth)
  }

  return buildCornerResizeRect(startRect.x + startRect.width, startRect.y, startRect.x + startRect.width - localX, localY - startRect.y, 'sw', minWidth)
}

function buildCornerResizeRect(anchorX, anchorY, availableWidth, availableHeight, corner, minWidth) {
  const safeWidth = Math.max(0, availableWidth)
  const safeHeight = Math.max(0, availableHeight)

  let maxWidth = 0
  if (corner === 'se') maxWidth = Math.min(cropStage.value.stageWidth - anchorX, (cropStage.value.stageHeight - anchorY) * CROP_RATIO)
  if (corner === 'nw') maxWidth = Math.min(anchorX, anchorY * CROP_RATIO)
  if (corner === 'ne') maxWidth = Math.min(cropStage.value.stageWidth - anchorX, anchorY * CROP_RATIO)
  if (corner === 'sw') maxWidth = Math.min(anchorX, (cropStage.value.stageHeight - anchorY) * CROP_RATIO)

  const width = clampNumber(
    Math.min(safeWidth, safeHeight * CROP_RATIO),
    Math.min(minWidth, maxWidth),
    maxWidth
  )
  const height = width / CROP_RATIO

  if (corner === 'se') return { x: anchorX, y: anchorY, width, height }
  if (corner === 'nw') return { x: anchorX - width, y: anchorY - height, width, height }
  if (corner === 'ne') return { x: anchorX, y: anchorY - height, width, height }
  return { x: anchorX - width, y: anchorY, width, height }
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

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`${file.name} 不是有效图片，无法读取尺寸`))
    }

    img.src = objectUrl
  })
}

function formatImageSizeError(fileName, width, height) {
  return `${fileName} 尺寸不对，至少需要 ${MIN_UPLOAD_WIDTH}x${MIN_UPLOAD_HEIGHT}，当前为 ${width}x${height}`
}

async function validateUploadFiles(files) {
  const invalidMessages = []

  for (const file of files) {
    try {
      const { width, height } = await readImageDimensions(file)
      if (width < MIN_UPLOAD_WIDTH || height < MIN_UPLOAD_HEIGHT) {
        invalidMessages.push(formatImageSizeError(file.name, width, height))
      }
    } catch (error) {
      invalidMessages.push(error.message || `${file.name} 无法读取尺寸`)
    }
  }

  return invalidMessages
}

async function handleUploadChange(event) {
  const files = Array.from(event.target.files || [])
  const character = uploadCharacter.value
  event.target.value = ''

  if (!character || !files.length) return

  const invalidMessages = await validateUploadFiles(files)
  if (invalidMessages.length) {
    await ElMessageBox.alert(invalidMessages.join('；'), '图片尺寸不对', { type: 'error' })
    uploadCharacter.value = null
    return
  }

  character._uploading = true
  try {
    const form = new FormData()
    form.append('id', character.id)
    files.forEach(file => form.append('images', file))

    const res = await http.post('/drawing/upload', form)
    applyImagePathsUpdate(character.id, res.image_paths)
    ElMessage.success('图片已上传并自动裁切为 750x1125')
  } catch (e) {
    ElMessage.error(e.message || '上传失败')
  } finally {
    character._uploading = false
    uploadCharacter.value = null
  }
}

async function streamDraw(body) {
  const token = auth.token
  const resp = await fetch(buildApiUrl('/drawing/generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

  if (!resp.ok || !resp.body) {
    let message = '绘图请求失败'
    try {
      const data = await resp.json()
      message = data.message || message
    } catch {}
    throw new Error(message)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const summary = { done: 0, error: 0, skipped: 0 }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') return summary
      try {
        const obj = JSON.parse(data)
        const statusMap = { submitting: '提交中', waiting: '等待中', done: '完成', error: '失败', skipped: '跳过' }
        const engineLabel = obj.engine === 'nano2' ? 'Nano Banana2' : obj.engine === 'jimeng5' ? '即梦绘画5.0' : ''
        const prefix = engineLabel ? `ID ${obj.id} [${engineLabel}]` : `ID ${obj.id}`
        progressLog.value.push(`${prefix}: ${statusMap[obj.status] || obj.status}${obj.error ? ` - ${obj.error}` : ''}`)
        if (obj.status === 'done') summary.done += 1
        if (obj.status === 'error') summary.error += 1
        if (obj.status === 'skipped') summary.skipped += 1
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

  return summary
}

async function handleBatchGenerate() {
  if (!selected.value.length) return
  batchGenerating.value = true
  progressLog.value = []
  try {
    const total = { done: 0, error: 0, skipped: 0 }
    for (const row of selected.value) {
      const summary = await streamDraw({ id: row.id })
      total.done += summary?.done || 0
      total.error += summary?.error || 0
      total.skipped += summary?.skipped || 0
    }

    if (total.done > 0 && total.error === 0 && total.skipped === 0) {
      ElMessage.success('选中人物已完成重新绘制')
    } else if (total.done > 0) {
      ElMessage.warning(`部分完成：成功 ${total.done}，失败 ${total.error}，跳过 ${total.skipped}`)
    } else {
      ElMessage.error(`未生成图片：失败 ${total.error}，跳过 ${total.skipped}`)
    }

    await loadData()
  } catch (e) {
    ElMessage.error(e.message || '批量绘制失败')
  } finally {
    batchGenerating.value = false
  }
}

async function handleBatchConvertAll() {
  if (!selected.value.length) return
  batchConverting.value = true
  progressLog.value = []
  try {
    for (const row of selected.value) {
      if (!row.image_paths?.length) {
        progressLog.value.push(`ID ${row.id}: 跳过，没有原图`)
        continue
      }
      progressLog.value.push(`ID ${row.id}: WebP 转换中`)
      const res = await http.post('/images/to-webp', { id: row.id, imagePaths: row.image_paths })
      applyWebpPathsUpdate(row.id, res.webp_paths)
      progressLog.value.push(`ID ${row.id}: WebP 转换完成`)
    }
    ElMessage.success('选中人物已完成 WebP 转换')
    await loadData()
  } catch (e) {
    ElMessage.error(e.message || '批量转换失败')
  } finally {
    batchConverting.value = false
  }
}

onMounted(loadData)
onBeforeUnmount(stopCropInteraction)
</script>

<style scoped>
.crop-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.crop-dialog__hint {
  margin: 0;
  color: #666;
  text-align: center;
}

.crop-dialog__workspace {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.crop-dialog__status {
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  background: #f7f8fa;
  border-radius: 10px;
}

.crop-dialog__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  color: #666;
  font-size: 13px;
}

.crop-stage {
  position: relative;
  max-width: 100%;
  overflow: hidden;
  border-radius: 12px;
  background:
    linear-gradient(45deg, #eef2f7 25%, transparent 25%, transparent 75%, #eef2f7 75%, #eef2f7),
    linear-gradient(45deg, #eef2f7 25%, transparent 25%, transparent 75%, #eef2f7 75%, #eef2f7);
  background-position: 0 0, 10px 10px;
  background-size: 20px 20px;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.crop-stage__image {
  width: 100%;
  height: 100%;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}

.crop-selection {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid #409eff;
  box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.42);
  cursor: move;
  touch-action: none;
}

.crop-selection__label {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(64, 158, 255, 0.92);
  color: #fff;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
}

.crop-selection__handle {
  position: absolute;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 2px solid #fff;
  border-radius: 999px;
  background: #409eff;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.35);
}

.crop-selection__handle--nw {
  top: -8px;
  left: -8px;
  cursor: nwse-resize;
}

.crop-selection__handle--ne {
  top: -8px;
  right: -8px;
  cursor: nesw-resize;
}

.crop-selection__handle--sw {
  bottom: -8px;
  left: -8px;
  cursor: nesw-resize;
}

.crop-selection__handle--se {
  right: -8px;
  bottom: -8px;
  cursor: nwse-resize;
}
</style>
