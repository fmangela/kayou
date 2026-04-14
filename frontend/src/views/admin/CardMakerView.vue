<template>
  <div>
    <el-card style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <el-select
            v-model="selectedCharacterId"
            filterable
            placeholder="选择人物"
            style="width:260px"
            :loading="loadingCharacters"
            @change="loadDetail"
          >
            <el-option
              v-for="item in characters"
              :key="item.character_id"
              :label="`${item.name} (${item.card_code || '未编卡牌号'})`"
              :value="item.character_id"
            />
          </el-select>
          <span style="color:#666;font-size:12px">这里维护的是全局卡牌模板，保存后会作为所有卡牌的通用渲染配置。</span>
        </div>
        <el-button type="primary" :loading="saving" :disabled="!detail.attribute" @click="saveDesign">保存全局卡牌模板</el-button>
      </div>
    </el-card>

    <el-empty v-if="!selectedCharacterId" description="先选择一个已存在 WebP 图片的人物" />

    <el-row v-else :gutter="16">
      <el-col :span="11">
        <el-card v-loading="loadingDetail">
          <template #header>
            <span style="font-weight:bold">全局制作模板</span>
          </template>

          <div v-if="detail.attribute">
            <div style="font-weight:bold;margin-bottom:8px">基础信息</div>
            <el-descriptions :column="2" border size="small" style="margin-bottom:16px">
              <el-descriptions-item label="人物">{{ detail.attribute.name }}</el-descriptions-item>
              <el-descriptions-item label="卡牌编号">{{ detail.attribute.card_code || '-' }}</el-descriptions-item>
              <el-descriptions-item label="系列">{{ detail.attribute.series_name || '-' }}</el-descriptions-item>
              <el-descriptions-item label="阵营">{{ detail.attribute.faction_name || '-' }}</el-descriptions-item>
              <el-descriptions-item label="稀有度">{{ detail.attribute.rarity || '-' }}</el-descriptions-item>
              <el-descriptions-item label="属性">{{ detail.attribute.element_name || '-' }}</el-descriptions-item>
            </el-descriptions>

            <div style="font-weight:bold;margin-bottom:8px">皮肤选择</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
              <div
                v-for="path in detail.attribute.webp_paths"
                :key="path"
                :style="selectedWebpPath === path ? 'outline:2px solid #409eff;border-radius:6px;padding:2px' : 'padding:2px'"
                style="cursor:pointer"
                @click="selectedWebpPath = path"
              >
                <img :src="buildAssetUrl(path)" alt="皮肤预览" style="width:80px;height:120px;object-fit:cover;border-radius:4px;display:block" />
              </div>
            </div>

            <div style="font-weight:bold;margin-bottom:8px">显示字段</div>
            <el-checkbox-group v-model="visibleFields" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
              <el-checkbox v-for="field in fieldDefs" :key="field.key" :label="field.key">{{ field.label }}</el-checkbox>
            </el-checkbox-group>

            <div style="font-weight:bold;margin-bottom:8px">卡牌特效</div>
            <el-checkbox-group v-model="enabledEffects" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
              <el-checkbox label="gold">闪金</el-checkbox>
              <el-checkbox label="holo">镭射</el-checkbox>
              <el-checkbox label="emboss">浮雕</el-checkbox>
            </el-checkbox-group>

            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px">
              <div style="font-weight:bold">字段排版</div>
              <div style="color:#666;font-size:12px">
                {{ selectedFieldKey ? `当前选中：${fieldLabelMap[selectedFieldKey]}` : '点击右侧预览中的字段框即可选中并拖动' }}
              </div>
            </div>
            <div style="color:#666;font-size:12px;margin-bottom:12px">
              字段坐标会按整张卡 2:3 画布的相对位置保存，长文本也会按最大行数裁切，这样同一套模板可以稳定复用到其他卡牌。
            </div>
            <el-collapse accordion>
              <el-collapse-item v-for="field in visibleFieldDefs" :key="field.key" :name="field.key" :title="field.label">
                <el-form :model="fieldSettings[field.key]" label-width="80px">
                  <el-row :gutter="12">
                    <el-col :span="12">
                      <el-form-item label="字体">
                        <el-select v-model="fieldFonts[field.key]" style="width:100%">
                          <el-option v-for="font in fontOptions" :key="font.value" :label="font.label" :value="font.value" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="颜色">
                        <el-input v-model="fieldSettings[field.key].color" placeholder="#ffffff" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="X">
                        <el-input-number v-model="fieldSettings[field.key].x" :step="5" style="width:100%" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="Y">
                        <el-input-number v-model="fieldSettings[field.key].y" :step="5" style="width:100%" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="宽度">
                        <el-input-number v-model="fieldSettings[field.key].width" :min="60" :max="320" :step="10" style="width:100%" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="字号">
                        <el-input-number v-model="fieldSettings[field.key].fontSize" :min="10" :max="48" style="width:100%" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="最大行数">
                        <el-input-number v-model="fieldSettings[field.key].maxLines" :min="1" :max="8" style="width:100%" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="字重">
                        <el-select v-model="fieldSettings[field.key].fontWeight" style="width:100%">
                          <el-option label="常规" value="400" />
                          <el-option label="加粗" value="700" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="对齐">
                        <el-select v-model="fieldSettings[field.key].textAlign" style="width:100%">
                          <el-option label="左对齐" value="left" />
                          <el-option label="居中" value="center" />
                          <el-option label="右对齐" value="right" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                  </el-row>
                </el-form>
              </el-collapse-item>
            </el-collapse>
          </div>
        </el-card>
      </el-col>

      <el-col :span="13">
        <div ref="previewContainerRef" style="position:relative;min-height:600px">
          <div
            ref="previewRef"
            :style="previewFixedStyle"
          >
            <el-card v-loading="loadingDetail">
               <template #header>
                 <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
                   <span style="font-weight:bold">成品预览</span>
                   <div style="display:flex;align-items:center;gap:8px">
                     <el-radio-group v-model="previewScale" size="small">
                       <el-radio-button :value="0.25">1/4</el-radio-button>
                       <el-radio-button :value="0.48">1/2</el-radio-button>
                     </el-radio-group>
                     <el-button size="small" type="primary" @click="openOriginalPreview">原卡预览</el-button>
                   </div>
                 </div>
               </template>

               <div
                 v-if="detail.attribute && selectedWebpPath"
                 :style="previewFrameStyle"
               >
                <img :src="buildAssetUrl(selectedWebpPath)" alt="卡牌底图" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block" />
                <div :style="effectOverlayStyle" />
                <div
                  v-for="field in previewFields"
                  :key="field.key"
                  :style="getPreviewTextStyle(field.key)"
                  @click.stop="selectField(field.key)"
                  @mousedown.stop.prevent="startFieldDrag(field.key, $event)"
                >
                  {{ field.text }}
                </div>
              </div>
              <el-empty v-else description="当前人物还没有 WebP 图片，先去图片工作流完成 WebP 转换" />
            </el-card>
          </div>
        </div>
      </el-col>
     </el-row>

     <!-- 原卡预览弹窗 -->
     <el-dialog
       v-model="originalPreviewVisible"
       title="原卡预览 (750×1125)"
       width="800px"
       :close-on-click-modal="false"
       :close-on-press-escape="true"
     >
       <div v-if="detail.attribute && selectedWebpPath" :style="originalFrameStyle">
         <img :src="buildAssetUrl(selectedWebpPath)" alt="卡牌原卡" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block" />
         <div :style="effectOverlayStyle" />
         <div
           v-for="field in previewFields"
           :key="field.key"
           :style="getOriginalTextStyle(field.key)"
         >
           {{ field.text }}
         </div>
       </div>
       <el-empty v-else description="当前人物还没有 WebP 图片" />
     </el-dialog>
   </div>
 </template>

<script setup>
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { buildAssetUrl } from '../../api/runtime'
import { getCardMakerCharacters, getCardMakerDetail, saveCardMakerDesign } from '../../api/cards'

const fontOptions = [
  { label: '金庸标题体', value: '"STKaiti", serif' },
  { label: '黑体力量感', value: '"SimHei", sans-serif' },
  { label: '宋体史诗感', value: '"SimSun", serif' },
  { label: '圆体轻快感', value: '"Microsoft YaHei", sans-serif' },
  { label: '系统衬线体', value: 'serif' },
]

const metricLabels = {
  force_value: '武力',
  intellect_value: '智力',
  speed_value: '速度',
  stamina_value: '体力',
}

const fieldDefs = [
  { key: 'name', label: '人物名字' },
  { key: 'background', label: '背景介绍' },
  { key: 'card_code', label: '卡牌编号' },
  { key: 'series_name', label: '系列' },
  { key: 'faction_name', label: '阵营' },
  { key: 'rarity', label: '稀有度' },
  { key: 'force_value', label: '武力' },
  { key: 'intellect_value', label: '智力' },
  { key: 'speed_value', label: '速度' },
  { key: 'stamina_value', label: '体力' },
  { key: 'element_name', label: '属性' },
  { key: 'skill1_name', label: '技能1名字' },
  { key: 'skill1_desc', label: '技能1描述' },
  { key: 'skill2_name', label: '技能2名字' },
  { key: 'skill2_desc', label: '技能2描述' },
  { key: 'skill3_name', label: '技能3名字' },
  { key: 'skill3_desc', label: '技能3描述' },
]

const fieldLabelMap = Object.fromEntries(fieldDefs.map(field => [field.key, field.label]))

const defaultLayouts = {
  name: { x: 24, y: 26, width: 180, fontSize: 28, maxLines: 1, color: '#ffffff', fontWeight: '700', textAlign: 'left' },
  background: { x: 24, y: 374, width: 320, fontSize: 12, maxLines: 4, color: '#fff9dd', fontWeight: '400', textAlign: 'left' },
  card_code: { x: 190, y: 28, width: 120, fontSize: 14, maxLines: 1, color: '#f7e7a1', fontWeight: '700', textAlign: 'right' },
  series_name: { x: 24, y: 70, width: 120, fontSize: 15, maxLines: 1, color: '#ffe8a3', fontWeight: '700', textAlign: 'left' },
  faction_name: { x: 150, y: 70, width: 80, fontSize: 15, maxLines: 1, color: '#d8f0ff', fontWeight: '700', textAlign: 'center' },
  rarity: { x: 244, y: 70, width: 72, fontSize: 18, maxLines: 1, color: '#ffd24d', fontWeight: '700', textAlign: 'right' },
  force_value: { x: 24, y: 312, width: 92, fontSize: 16, maxLines: 1, color: '#ffb3b3', fontWeight: '700', textAlign: 'center' },
  intellect_value: { x: 112, y: 312, width: 92, fontSize: 16, maxLines: 1, color: '#cde7ff', fontWeight: '700', textAlign: 'center' },
  speed_value: { x: 200, y: 312, width: 92, fontSize: 16, maxLines: 1, color: '#d1ffd5', fontWeight: '700', textAlign: 'center' },
  stamina_value: { x: 288, y: 312, width: 92, fontSize: 16, maxLines: 1, color: '#ffe3ba', fontWeight: '700', textAlign: 'center' },
  element_name: { x: 24, y: 102, width: 100, fontSize: 16, maxLines: 1, color: '#ffffff', fontWeight: '700', textAlign: 'left' },
  skill1_name: { x: 24, y: 418, width: 200, fontSize: 16, maxLines: 1, color: '#ffe08a', fontWeight: '700', textAlign: 'left' },
  skill1_desc: { x: 24, y: 442, width: 280, fontSize: 12, maxLines: 2, color: '#ffffff', fontWeight: '400', textAlign: 'left' },
  skill2_name: { x: 24, y: 474, width: 200, fontSize: 16, maxLines: 1, color: '#ffe08a', fontWeight: '700', textAlign: 'left' },
  skill2_desc: { x: 24, y: 498, width: 280, fontSize: 12, maxLines: 2, color: '#ffffff', fontWeight: '400', textAlign: 'left' },
  skill3_name: { x: 24, y: 530, width: 200, fontSize: 16, maxLines: 1, color: '#ffe08a', fontWeight: '700', textAlign: 'left' },
  skill3_desc: { x: 24, y: 554, width: 280, fontSize: 12, maxLines: 2, color: '#ffffff', fontWeight: '400', textAlign: 'left' },
}

const defaultVisibleFields = ['name', 'card_code', 'series_name', 'faction_name', 'rarity', 'force_value', 'intellect_value', 'speed_value', 'stamina_value']

const characters = ref([])
const selectedCharacterId = ref('')
const loadingCharacters = ref(false)
const loadingDetail = ref(false)
const saving = ref(false)

const detail = reactive({
  attribute: null,
  design: null,
})
const selectedWebpPath = ref('')
const visibleFields = ref([])
const enabledEffects = ref([])
const selectedFieldKey = ref('')
const fieldSettings = reactive({})
const fieldFonts = reactive({})
const dragState = reactive({
  active: false,
  key: '',
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
})

const CARD_WIDTH = 750
const CARD_HEIGHT = 1125

// 预览档次：1/4, 1/2, 原图（弹窗）
const previewScale = ref(0.48) // 默认 1/2
const originalPreviewVisible = ref(false)

const currentPreviewScale = computed(() => previewScale.value)
const PREVIEW_DISPLAY_WIDTH = computed(() => Math.round(CARD_WIDTH * previewScale.value))
const PREVIEW_DISPLAY_HEIGHT = computed(() => Math.round(CARD_HEIGHT * previewScale.value))
const PREVIEW_SCALE = computed(() => previewScale.value)
const LAYOUT_META = Object.freeze({
  unit: 'relative',
  baseWidth: CARD_WIDTH,
  baseHeight: CARD_HEIGHT,
  aspectRatio: '2:3',
})

function toFiniteNumber(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function scaleRelativeValue(value, total, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? Math.round(num * total) : fallback
}

function roundLayoutRatio(value) {
  return Math.round(toFiniteNumber(value, 0) * 1000000) / 1000000
}

function estimateFieldHeight(setting) {
  const fontSize = toFiniteNumber(setting?.fontSize, 16)
  const maxLines = Math.max(1, Math.round(toFiniteNumber(setting?.maxLines, 1)))
  return Math.max(Math.ceil(fontSize * 1.35 * maxLines + 8), 40)
}

function deserializeLayoutSetting(key, layoutConfig = {}) {
  const base = defaultLayouts[key]
  const raw = layoutConfig?.[key] || {}
  const isRelative = layoutConfig?.__meta?.unit === 'relative'
  const merged = {
    ...base,
    ...raw,
  }

  if (!isRelative) {
    return {
      ...merged,
      maxLines: Math.max(1, Math.round(toFiniteNumber(merged.maxLines, base.maxLines))),
    }
  }

  const fullSize = {
    ...merged,
    x: scaleRelativeValue(raw.x, CARD_WIDTH, base.x),
    y: scaleRelativeValue(raw.y, CARD_HEIGHT, base.y),
    width: scaleRelativeValue(raw.width, CARD_WIDTH, base.width),
    fontSize: scaleRelativeValue(raw.fontSize, CARD_HEIGHT, base.fontSize),
    maxLines: Math.max(1, Math.round(toFiniteNumber(raw.maxLines, base.maxLines))),
  }

  return {
    ...fullSize,
    x: fullSize.x * PREVIEW_SCALE,
    y: fullSize.y * PREVIEW_SCALE,
    width: fullSize.width * PREVIEW_SCALE,
    fontSize: fullSize.fontSize * PREVIEW_SCALE,
  }
}

function serializeLayoutConfig(settings = {}) {
  const payload = {
    __meta: { ...LAYOUT_META },
  }

  for (const field of fieldDefs) {
    const base = defaultLayouts[field.key]
    const setting = settings[field.key] || base
    
    const xFull = toFiniteNumber(setting.x, base.x) / PREVIEW_SCALE
    const yFull = toFiniteNumber(setting.y, base.y) / PREVIEW_SCALE
    const widthFull = toFiniteNumber(setting.width, base.width) / PREVIEW_SCALE
    const fontSizeFull = toFiniteNumber(setting.fontSize, base.fontSize) / PREVIEW_SCALE
    
    const clamped = clampFieldPosition(
      field.key,
      xFull,
      yFull,
      { ...setting, width: widthFull }
    )
    
    payload[field.key] = {
      x: roundLayoutRatio(clamped.x / CARD_WIDTH),
      y: roundLayoutRatio(clamped.y / CARD_HEIGHT),
      width: roundLayoutRatio(widthFull / CARD_WIDTH),
      fontSize: roundLayoutRatio(fontSizeFull / CARD_HEIGHT),
      maxLines: Math.max(1, Math.round(toFiniteNumber(setting.maxLines, base.maxLines))),
      color: setting.color || base.color,
      fontWeight: setting.fontWeight || base.fontWeight,
      textAlign: setting.textAlign || base.textAlign,
    }
  }

  return payload
}

function ensureFieldSettings() {
  for (const field of fieldDefs) {
    if (!fieldSettings[field.key]) fieldSettings[field.key] = { ...defaultLayouts[field.key] }
    if (!fieldFonts[field.key]) fieldFonts[field.key] = fontOptions[0].value
  }
}

ensureFieldSettings()

const visibleFieldDefs = computed(() => fieldDefs.filter(field => visibleFields.value.includes(field.key)))

const previewFields = computed(() => {
  if (!detail.attribute) return []
  return fieldDefs
    .filter(field => visibleFields.value.includes(field.key))
    .map(field => ({
      key: field.key,
      text: metricLabels[field.key]
        ? `${metricLabels[field.key]}：${detail.attribute[field.key] ?? 0}`
        : (detail.attribute[field.key] ?? ''),
    }))
    .filter(field => field.text !== '' && field.text !== null)
})

const previewFrameStyle = computed(() => {
  const s = PREVIEW_SCALE.value
  return {
    width: PREVIEW_DISPLAY_WIDTH.value + 'px',
    aspectRatio: '2 / 3',
    margin: '0 auto',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: Math.round(18 * s) + 'px',
    background: '#1f1f1f',
    boxShadow: enabledEffects.value.includes('emboss')
      ? `0 ${Math.round(22 * s)}px ${Math.round(48 * s)}px rgba(0,0,0,0.32), inset 0 0 0 ${Math.round(2 * s)}px rgba(255,255,255,0.08)`
      : `0 ${Math.round(18 * s)}px ${Math.round(40 * s)}px rgba(0,0,0,0.22)`,
  }
})

const previewFixedStyle = computed(() => {
  return {
    position: 'sticky',
    top: '16px',
    width: '100%',
    maxWidth: '400px',
    margin: '0 auto',
    zIndex: 1,
    maxHeight: 'calc(100vh - 32px)',
    overflow: 'auto',
  }
})

const effectOverlayStyle = computed(() => {
  const styles = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background: 'transparent',
    mixBlendMode: 'screen',
  }

  const layers = []
  if (enabledEffects.value.includes('gold')) {
    layers.push('linear-gradient(135deg, rgba(255,215,90,0.2), rgba(255,236,167,0.04) 45%, rgba(255,183,0,0.18))')
  }
  if (enabledEffects.value.includes('holo')) {
    layers.push('linear-gradient(120deg, rgba(0,255,255,0.10), rgba(255,0,255,0.10), rgba(255,255,0,0.10))')
  }
  if (enabledEffects.value.includes('emboss')) {
    styles.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.25), inset 0 0 24px rgba(255,255,255,0.10)'
  }

  if (layers.length) styles.background = layers.join(',')
  return styles
})

function getPreviewTextStyle(key) {
  const setting = fieldSettings[key] || defaultLayouts[key]
  const selected = selectedFieldKey.value === key
  const maxLines = Math.max(1, Math.round(toFiniteNumber(setting.maxLines, 1)))
  const isSingleLine = maxLines === 1
  const s = PREVIEW_SCALE
  return {
    position: 'absolute',
    left: `${setting.x}px`,
    top: `${setting.y}px`,
    width: `${setting.width}px`,
    fontSize: `${setting.fontSize}px`,
    fontWeight: setting.fontWeight,
    color: setting.color,
    textAlign: setting.textAlign,
    lineHeight: 1.35,
    padding: `${Math.round(4 * s)}px ${Math.round(6 * s)}px`,
    borderRadius: `${Math.round(6 * s)}px`,
    border: selected ? `${Math.round(1 * s)}px dashed rgba(255,255,255,0.65)` : `${Math.round(1 * s)}px solid transparent`,
    background: selected ? 'rgba(0,0,0,0.18)' : 'transparent',
    backdropFilter: selected ? `blur(${Math.round(1 * s)}px)` : 'none',
    textShadow: enabledEffects.value.includes('emboss')
      ? `0 ${Math.round(1 * s)}px 0 rgba(0,0,0,0.6), 0 0 ${Math.round(12 * s)}px rgba(255,255,255,0.18)`
      : `0 ${Math.round(1 * s)}px ${Math.round(4 * s)}px rgba(0,0,0,0.65)`,
    fontFamily: fieldFonts[key] || fontOptions[0].value,
    cursor: selected ? 'move' : 'pointer',
    userSelect: 'none',
    maxHeight: `${estimateFieldHeight(setting)}px`,
    overflow: 'hidden',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    display: isSingleLine ? 'block' : '-webkit-box',
    whiteSpace: isSingleLine ? 'nowrap' : 'normal',
    textOverflow: isSingleLine ? 'ellipsis' : 'clip',
    WebkitLineClamp: String(maxLines),
    WebkitBoxOrient: 'vertical',
  }
}

function selectField(key) {
  selectedFieldKey.value = key
}

function clampFieldPosition(key, x, y, customSetting = null) {
  const setting = customSetting || fieldSettings[key] || defaultLayouts[key]
  const maxX = Math.max(0, CARD_WIDTH - Math.min(setting.width || 120, CARD_WIDTH))
  const maxY = Math.max(0, CARD_HEIGHT - estimateFieldHeight(setting))
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  }
}

function handleFieldDragMove(event) {
  if (!dragState.active || !dragState.key) return
  const nextX = dragState.originX + (event.clientX - dragState.startX)
  const nextY = dragState.originY + (event.clientY - dragState.startY)
  const clamped = clampFieldPosition(dragState.key, nextX, nextY)
  fieldSettings[dragState.key].x = clamped.x
  fieldSettings[dragState.key].y = clamped.y
}

function stopFieldDrag() {
  if (!dragState.active) return
  dragState.active = false
  dragState.key = ''
  window.removeEventListener('mousemove', handleFieldDragMove)
  window.removeEventListener('mouseup', stopFieldDrag)
}

function startFieldDrag(key, event) {
  selectField(key)
  dragState.active = true
  dragState.key = key
  dragState.startX = event.clientX
  dragState.startY = event.clientY
  dragState.originX = fieldSettings[key].x
  dragState.originY = fieldSettings[key].y
  window.addEventListener('mousemove', handleFieldDragMove)
  window.addEventListener('mouseup', stopFieldDrag)
}

function applyDesign(design) {
  visibleFields.value = design?.visible_fields?.length ? design.visible_fields : [...defaultVisibleFields]
  selectedWebpPath.value = detail.attribute?.webp_paths?.includes(design?.selected_webp_path)
    ? design.selected_webp_path
    : (detail.attribute?.webp_paths?.[0] || '')
  selectedFieldKey.value = ''

  const effects = []
  if (design?.effect_config?.gold) effects.push('gold')
  if (design?.effect_config?.holo) effects.push('holo')
  if (design?.effect_config?.emboss) effects.push('emboss')
  enabledEffects.value = effects

  ensureFieldSettings()
  for (const field of fieldDefs) {
    const nextSetting = deserializeLayoutSetting(field.key, design?.layout_config || {})
    const clamped = clampFieldPosition(field.key, nextSetting.x, nextSetting.y, nextSetting)
    fieldSettings[field.key] = {
      ...nextSetting,
      ...clamped,
    }
    fieldFonts[field.key] = design?.font_config?.[field.key] || fontOptions[0].value
  }
}

async function loadCharacters() {
  loadingCharacters.value = true
  try {
    characters.value = await getCardMakerCharacters()
    if (!selectedCharacterId.value && characters.value.length) {
      selectedCharacterId.value = characters.value[0].character_id
      await loadDetail()
    }
  } catch (e) {
    ElMessage.error(e.message || '读取卡牌制作人物失败')
  } finally {
    loadingCharacters.value = false
  }
}

async function loadDetail() {
  if (!selectedCharacterId.value) return
  loadingDetail.value = true
  try {
    const res = await getCardMakerDetail(selectedCharacterId.value)
    detail.attribute = res.attribute
    detail.design = res.design
    applyDesign(res.design)
  } catch (e) {
    ElMessage.error(e.message || '读取卡牌制作配置失败')
  } finally {
    loadingDetail.value = false
  }
}

async function saveDesign() {
  if (!detail.attribute) return
  saving.value = true
  try {
    const font_config = {}
    fieldDefs.forEach(field => {
      font_config[field.key] = fieldFonts[field.key]
    })
    const layout_config = serializeLayoutConfig(fieldSettings)

    const res = await saveCardMakerDesign(detail.attribute.character_id, {
      visible_fields: visibleFields.value,
      font_config,
      layout_config,
      effect_config: {
        gold: enabledEffects.value.includes('gold'),
        holo: enabledEffects.value.includes('holo'),
        emboss: enabledEffects.value.includes('emboss'),
      },
    })
    detail.design = res
    ElMessage.success('全局卡牌模板已保存')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

watch(selectedWebpPath, (value) => {
  if (!value && detail.attribute?.webp_paths?.length) {
    selectedWebpPath.value = detail.attribute.webp_paths[0]
  }
})

watch(visibleFields, (nextFields) => {
  if (selectedFieldKey.value && !nextFields.includes(selectedFieldKey.value)) {
    selectedFieldKey.value = ''
  }
})

function openOriginalPreview() {
  originalPreviewVisible.value = true
}

const originalFrameStyle = computed(() => ({
  width: CARD_WIDTH + 'px',
  height: CARD_HEIGHT + 'px',
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '18px',
  background: '#1f1f1f',
  margin: '0 auto',
  boxShadow: enabledEffects.value.includes('emboss')
    ? '0 22px 48px rgba(0,0,0,0.32), inset 0 0 0 2px rgba(255,255,255,0.08)'
    : '0 18px 40px rgba(0,0,0,0.22)',
}))

function getOriginalTextStyle(key) {
  const setting = fieldSettings[key] || defaultLayouts[key]
  const maxLines = Math.max(1, Math.round(toFiniteNumber(setting.maxLines, 1)))
  const isSingleLine = maxLines === 1
  const s = 1 // 原图就是 1:1
  return {
    position: 'absolute',
    left: setting.x + 'px',
    top: setting.y + 'px',
    width: setting.width + 'px',
    fontSize: setting.fontSize + 'px',
    fontWeight: setting.fontWeight,
    color: setting.color,
    textAlign: setting.textAlign,
    lineHeight: 1.35,
    padding: Math.round(4 * s) + 'px ' + Math.round(6 * s) + 'px',
    borderRadius: Math.round(6 * s) + 'px',
    border: '1px solid transparent',
    background: 'transparent',
    textShadow: enabledEffects.value.includes('emboss')
      ? `0 ${Math.round(1 * s)}px 0 rgba(0,0,0,0.6), 0 0 ${Math.round(12 * s)}px rgba(255,255,255,0.18)`
      : `0 ${Math.round(1 * s)}px ${Math.round(4 * s)}px rgba(0,0,0,0.65)`,
    fontFamily: fieldFonts[key] || fontOptions[0].value,
    userSelect: 'none',
    maxHeight: Math.round(estimateFieldHeight(setting)) + 'px',
    overflow: 'hidden',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    display: isSingleLine ? 'block' : '-webkit-box',
    whiteSpace: isSingleLine ? 'nowrap' : 'normal',
    textOverflow: isSingleLine ? 'ellipsis' : 'clip',
    WebkitLineClamp: String(maxLines),
    WebkitBoxOrient: 'vertical',
    pointerEvents: 'none',
  }
}

onMounted(loadCharacters)
onBeforeUnmount(stopFieldDrag)
</script>
