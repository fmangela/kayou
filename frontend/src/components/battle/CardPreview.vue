<template>
  <div :style="frameStyle">
    <img
      v-if="webpPath"
      :src="buildAssetUrl(webpPath)"
      alt="卡牌底图"
      style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block"
    />
    <div v-else style="position:absolute;inset:0;background:#2a2a2a;display:flex;align-items:center;justify-content:center">
      <span style="color:#666;font-size:12px">无图片</span>
    </div>
    <div :style="effectOverlayStyle" />
    <div
      v-for="field in visibleFields"
      :key="field.key"
      :style="getTextStyle(field.key, field.text)"
    >{{ field.text }}</div>
    <!-- HP bar overlay -->
    <div v-if="showHp" style="position:absolute;bottom:0;left:0;right:0;padding:4px 8px;background:rgba(0,0,0,0.55)">
      <div style="display:flex;align-items:center;gap:4px">
        <span style="color:#fff;font-size:10px;white-space:nowrap">HP</span>
        <div style="flex:1;height:6px;background:#333;border-radius:3px;overflow:hidden">
          <div :style="{ width: hpPercent + '%', height: '100%', background: hpColor, transition: 'width 0.4s' }" />
        </div>
        <span style="color:#fff;font-size:10px;white-space:nowrap">{{ currentHp }}/{{ maxHp }}</span>
      </div>
    </div>
    <!-- Captain badge -->
    <div v-if="isCaptain" style="position:absolute;top:6px;right:6px;background:#f5a623;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px">队长</div>
    <!-- Dead overlay -->
    <div v-if="isDead" style="position:absolute;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center">
      <span style="color:#f56c6c;font-size:20px;font-weight:700;text-shadow:0 0 8px #f00">阵亡</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { buildAssetUrl } from '../../api/runtime'

const props = defineProps({
  attribute: { type: Object, default: null },
  design: { type: Object, default: null },
  webpPath: { type: String, default: '' },
  width: { type: Number, default: 160 },
  isCaptain: { type: Boolean, default: false },
  showHp: { type: Boolean, default: false },
  currentHp: { type: Number, default: 100 },
  maxHp: { type: Number, default: 100 },
  isDead: { type: Boolean, default: false },
})

const PREVIEW_WIDTH = 360
const PREVIEW_HEIGHT = 540

const metricLabels = {
  force_value: '武力',
  intellect_value: '智力',
  speed_value: '速度',
  stamina_value: '体力',
}

const defaultLayouts = {
  name: { x: 24, y: 26, width: 180, fontSize: 28, maxLines: 1, color: '#ffffff', fontWeight: '700', textAlign: 'left' },
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
}

const scale = computed(() => props.width / PREVIEW_WIDTH)

const frameStyle = computed(() => {
  const effects = props.design?.effect_config || {}
  return {
    width: props.width + 'px',
    height: Math.round(props.width * (PREVIEW_HEIGHT / PREVIEW_WIDTH)) + 'px',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: Math.round(18 * scale.value) + 'px',
    background: '#1f1f1f',
    boxShadow: effects.emboss
      ? '0 8px 24px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.08)'
      : '0 6px 18px rgba(0,0,0,0.3)',
    flexShrink: 0,
  }
})

const effectOverlayStyle = computed(() => {
  const effects = props.design?.effect_config || {}
  const layers = []
  if (effects.gold) layers.push('linear-gradient(135deg, rgba(255,215,90,0.2), rgba(255,236,167,0.04) 45%, rgba(255,183,0,0.18))')
  if (effects.holo) layers.push('linear-gradient(120deg, rgba(0,255,255,0.10), rgba(255,0,255,0.10), rgba(255,255,0,0.10))')
  return {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background: layers.length ? layers.join(',') : 'transparent',
    mixBlendMode: 'screen',
    boxShadow: effects.emboss ? 'inset 0 0 0 1px rgba(255,255,255,0.25)' : 'none',
  }
})

function resolveLayout(key) {
  const base = defaultLayouts[key] || {}
  const lc = props.design?.layout_config || {}
  const raw = lc[key] || {}
  const isRelative = lc.__meta?.unit === 'relative'
  
  const result = { ...base, ...raw }
  
  if (isRelative) {
    result.x = Number.isFinite(Number(raw.x)) ? Math.round(Number(raw.x) * PREVIEW_WIDTH) : base.x
    result.y = Number.isFinite(Number(raw.y)) ? Math.round(Number(raw.y) * PREVIEW_HEIGHT) : base.y
    result.width = Number.isFinite(Number(raw.width)) ? Math.round(Number(raw.width) * PREVIEW_WIDTH) : base.width
    result.fontSize = Number.isFinite(Number(raw.fontSize)) ? Math.round(Number(raw.fontSize) * PREVIEW_HEIGHT) : base.fontSize
  }
  
  result.maxLines = Math.max(1, Math.round(Number(raw.maxLines) || base.maxLines || 1))
  result.color = raw.color || base.color
  result.fontWeight = raw.fontWeight || base.fontWeight
  result.textAlign = raw.textAlign || base.textAlign
  
  return result
}

const visibleFields = computed(() => {
  if (!props.attribute) return []
  const visible = props.design?.visible_fields?.length
    ? props.design.visible_fields
    : ['name', 'card_code', 'series_name', 'faction_name', 'rarity', 'force_value', 'intellect_value', 'speed_value', 'stamina_value']
  return visible
    .filter(key => defaultLayouts[key])
    .map(key => ({
      key,
      text: metricLabels[key]
        ? `${metricLabels[key]}：${props.attribute[key] ?? 0}`
        : (props.attribute[key] ?? ''),
    }))
    .filter(f => f.text !== '' && f.text !== null && f.text !== undefined)
})

function getTextStyle(key) {
  const layout = resolveLayout(key)
  const s = scale.value
  const maxLines = Math.max(1, layout.maxLines || 1)
  const isSingle = maxLines === 1
  const fontConfig = props.design?.font_config || {}
  const effects = props.design?.effect_config || {}
  
  return {
    position: 'absolute',
    left: Math.round(layout.x * s) + 'px',
    top: Math.round(layout.y * s) + 'px',
    width: Math.round(layout.width * s) + 'px',
    fontSize: Math.round(layout.fontSize * s) + 'px',
    fontWeight: layout.fontWeight || '400',
    color: layout.color || '#fff',
    textAlign: layout.textAlign || 'left',
    lineHeight: 1.35,
    padding: Math.round(4 * s) + 'px ' + Math.round(6 * s) + 'px',
    borderRadius: Math.round(6 * s) + 'px',
    fontFamily: fontConfig[key] || '"STKaiti", serif',
    textShadow: effects.emboss
      ? `0 ${Math.round(1 * s)}px 0 rgba(0,0,0,0.6), 0 0 ${Math.round(12 * s)}px rgba(255,255,255,0.18)`
      : `0 ${Math.round(1 * s)}px ${Math.round(4 * s)}px rgba(0,0,0,0.65)`,
    overflow: 'hidden',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    display: isSingle ? 'block' : '-webkit-box',
    whiteSpace: isSingle ? 'nowrap' : 'normal',
    textOverflow: isSingle ? 'ellipsis' : 'clip',
    WebkitLineClamp: String(maxLines),
    WebkitBoxOrient: 'vertical',
    maxHeight: Math.round(layout.fontSize * s * 1.35 * maxLines + 8 * s) + 'px',
    pointerEvents: 'none',
  }
}

const hpPercent = computed(() => {
  if (!props.maxHp) return 0
  return Math.max(0, Math.min(100, (props.currentHp / props.maxHp) * 100))
})

const hpColor = computed(() => {
  const p = hpPercent.value
  if (p > 60) return '#67c23a'
  if (p > 30) return '#e6a23c'
  return '#f56c6c'
})
</script>
