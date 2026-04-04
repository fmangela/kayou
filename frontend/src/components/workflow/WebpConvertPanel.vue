<template>
  <el-card style="margin-bottom:16px">
    <template #header>
      <span style="font-weight:bold">转换为 WebP</span>
    </template>

    <el-table :data="characters" v-loading="loading" border size="small" style="width:100%">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="人物" width="90" />
      <el-table-column label="原始图片" width="220">
        <template #default="{ row }">
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <div
              v-for="(p, i) in row.image_paths"
              :key="i"
              style="position:relative"
            >
              <el-image
                :src="`http://localhost:3174${p}`"
                style="width:40px;height:60px;object-fit:cover;cursor:pointer;border-radius:2px"
                fit="cover"
                @click="toggleSelect(row.id, p)"
              />
              <div
                v-if="isSelected(row.id, p)"
                style="position:absolute;inset:0;background:rgba(64,158,255,0.4);border-radius:2px;pointer-events:none;display:flex;align-items:center;justify-content:center"
              >
                <el-icon style="color:#fff"><Check /></el-icon>
              </div>
            </div>
            <div v-if="!row.image_paths?.length" style="color:#999;font-size:12px">暂无图片</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="WebP 预览" width="220">
        <template #default="{ row }">
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <el-image
              v-for="(p, i) in row.webp_paths"
              :key="i"
              :src="`http://localhost:3174${p}`"
              style="width:40px;height:60px;object-fit:cover;cursor:pointer;border-radius:2px"
              fit="cover"
              @click="openWebpPreview(row, i)"
            />
            <div v-if="!row.webp_paths?.length" style="color:#999;font-size:12px">暂无WebP</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            type="primary"
            :loading="row._converting"
            :disabled="!getSelected(row.id).length"
            @click="convertSelected(row)"
          >
            转换选中为WebP
          </el-button>
          <el-button
            size="small"
            :loading="row._convertingAll"
            :disabled="!row.image_paths?.length"
            @click="convertAll(row)"
          >
            全部转换
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- WebP preview dialog -->
    <el-dialog v-model="webpPreview.visible" :title="`${webpPreview.character?.name} - WebP预览`" width="700px">
      <div v-if="webpPreview.character">
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          <div
            v-for="(p, i) in webpPreview.character.webp_paths"
            :key="i"
            style="position:relative;cursor:pointer"
            :style="webpPreview.activeIndex === i ? 'outline:2px solid #409eff;border-radius:4px' : ''"
            @click="webpPreview.activeIndex = i"
          >
            <el-image
              :src="`http://localhost:3174${p}`"
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
        <el-image
          v-if="webpPreview.character.webp_paths?.length"
          :src="`http://localhost:3174${webpPreview.character.webp_paths[webpPreview.activeIndex]}`"
          style="width:100%;max-height:500px;object-fit:contain"
          fit="contain"
        />
      </div>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getCharacters } from '../../api/character'
import http from '../../api/http'

const characters = ref([])
const loading = ref(false)
const selections = ref({}) // { [charId]: Set of imagePaths }
const webpPreview = ref({ visible: false, character: null, activeIndex: 0 })

async function loadData() {
  loading.value = true
  try {
    characters.value = await getCharacters()
  } finally {
    loading.value = false
  }
}

function toggleSelect(charId, path) {
  if (!selections.value[charId]) selections.value[charId] = new Set()
  const s = selections.value[charId]
  if (s.has(path)) s.delete(path)
  else s.add(path)
  selections.value = { ...selections.value }
}

function isSelected(charId, path) {
  return selections.value[charId]?.has(path) || false
}

function getSelected(charId) {
  return [...(selections.value[charId] || [])]
}

async function convertSelected(row) {
  const paths = getSelected(row.id)
  if (!paths.length) return
  row._converting = true
  try {
    const res = await http.post('/images/to-webp', { id: row.id, imagePaths: paths })
    ElMessage.success('转换成功')
    const idx = characters.value.findIndex(c => c.id === row.id)
    if (idx !== -1) characters.value[idx].webp_paths = res.webp_paths
    selections.value[row.id] = new Set()
  } catch (e) {
    ElMessage.error(e.message || '转换失败')
  } finally {
    row._converting = false
  }
}

async function convertAll(row) {
  row._convertingAll = true
  try {
    const res = await http.post('/images/to-webp', { id: row.id, imagePaths: row.image_paths })
    ElMessage.success('全部转换成功')
    const idx = characters.value.findIndex(c => c.id === row.id)
    if (idx !== -1) characters.value[idx].webp_paths = res.webp_paths
  } catch (e) {
    ElMessage.error(e.message || '转换失败')
  } finally {
    row._convertingAll = false
  }
}

function openWebpPreview(row, index) {
  webpPreview.value = { visible: true, character: { ...row }, activeIndex: index }
}

async function deleteWebp(character, webpPath) {
  await ElMessageBox.confirm('确认删除此WebP文件？', '提示', { type: 'warning' })
  try {
    const res = await http.delete('/images/webp', { data: { id: character.id, webpPath } })
    ElMessage.success('已删除')
    const idx = characters.value.findIndex(c => c.id === character.id)
    if (idx !== -1) characters.value[idx].webp_paths = res.webp_paths
    webpPreview.value.character.webp_paths = res.webp_paths
    if (webpPreview.value.activeIndex >= res.webp_paths.length) {
      webpPreview.value.activeIndex = Math.max(0, res.webp_paths.length - 1)
    }
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

onMounted(loadData)
</script>
