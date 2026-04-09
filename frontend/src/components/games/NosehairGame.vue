<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '拔鼻毛' : phase === 'playing' ? '拔鼻毛 - 游戏中' : '游戏结束'"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">拔鼻毛</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">镊子左右晃动，对准鼻毛时按空格夹住，再按空格拔出！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKey">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span>已拔：{{ pulled }} / {{ targetCount }}</span>
        <span :style="timeLeft <= 5 ? 'color:#f56c6c;font-weight:bold' : ''">{{ timeLeft.toFixed(1) }}s</span>
      </div>

      <div style="position:relative;width:420px;height:300px;background:#ffe4c4;border-radius:12px;overflow:hidden;margin:0 auto;border:2px solid #deb887">
        <!-- Face -->
        <div style="position:absolute;top:20px;left:50%;transform:translateX(-50%);font-size:100px;line-height:1;user-select:none">😤</div>

        <!-- Nose area -->
        <div style="position:absolute;top:120px;left:50%;transform:translateX(-50%);width:80px;height:50px;background:rgba(0,0,0,0.05);border-radius:50%;display:flex;align-items:center;justify-content:center">
          <!-- Nose hairs -->
          <div v-for="hair in hairs" :key="hair.id" :style="{
            position:'absolute',
            left: (40 + hair.offset) + 'px',
            top:'10px',
            width:'4px',
            height: hair.pulled ? '0px' : '30px',
            background: hair.clamped ? '#e74c3c' : '#333',
            borderRadius:'2px',
            transition:'height 0.2s',
            transformOrigin:'top center',
          }"></div>
        </div>

        <!-- Tweezers -->
        <div :style="{
          position:'absolute',
          top: clampState === 'clamped' ? '130px' : '160px',
          left: (tweezX - 10) + 'px',
          fontSize:'28px',
          transform:'rotate(90deg)',
          transition:'top 0.15s',
        }">🥢</div>

        <!-- Clamp zone indicator -->
        <div :style="{
          position:'absolute',
          top:'140px',
          left: (tweezX - clampHalfWidth) + 'px',
          width: clampHalfWidth * 2 + 'px',
          height:'30px',
          border:'2px dashed rgba(64,158,255,0.5)',
          borderRadius:'4px',
          pointerEvents:'none',
        }"></div>

        <!-- Feedback -->
        <div v-if="feedbackText" :style="{position:'absolute',top:'220px',left:'50%',transform:'translateX(-50%)',fontSize:'20px',fontWeight:'bold',color:feedbackColor,textShadow:'0 1px 4px #fff',whiteSpace:'nowrap'}">
          {{ feedbackText }}
        </div>

        <!-- State hint -->
        <div style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);font-size:13px;color:#888">
          {{ stateHint }}
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格</kbd> 夹住 / 拔出
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">拔出 {{ pulled }} / {{ targetCount }} 根鼻毛</div>
      <el-tag :type="scoreTagType" size="large" style="font-size:18px;padding:8px 24px">得分：{{ score }} / 5</el-tag>
    </div>

    <template #footer>
      <div v-if="phase === 'result'" style="display:flex;justify-content:center;gap:12px">
        <el-button @click="visible = false">关闭</el-button>
        <el-button type="primary" @click="restart">再来一局</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  hairSwing: { type: Number, default: 1 },
  clampWidth: { type: Number, default: 20 },
  rootFirmness: { type: Number, default: 1 },
  targetCount: { type: Number, default: 5 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const phase = ref('intro')
const introCountdown = ref(6)
const timeLeft = ref(30)
const pulled = ref(0)
const tweezX = ref(210)
const clampState = ref('free')  // free | clamped | pulling
const hairs = ref([])
const feedbackText = ref('')
const feedbackColor = ref('#fff')

const clampHalfWidth = computed(() => Math.max(10, Math.min(40, props.clampWidth)))
const targetCount = computed(() => Math.max(3, Math.min(10, props.targetCount)))
const stateHint = computed(() => {
  if (clampState.value === 'free') return '对准鼻毛按空格夹住'
  if (clampState.value === 'clamped') return '已夹住！再按空格拔出'
  return '拔出中...'
})

const score = computed(() => {
  const p = pulled.value
  const t = targetCount.value
  if (p >= t) return 5
  if (p >= t * 0.8) return 4
  if (p >= t * 0.6) return 3
  if (p >= t * 0.4) return 2
  if (p >= t * 0.2) return 1
  return 0
})
const scoreTagType = computed(() => ['danger','','warning','warning','success','success'][score.value])
const resultEmoji = computed(() => ['😢','🥉','🥈','🥇','🏆','🏆'][score.value])

let introTimer = null
let rafId = null
let gameTimer = null
let feedbackTimer = null
let rafStart = 0
let clampedHairId = null
let pullTimer = null

const gameArea = ref(null)

function buildHairs() {
  const count = targetCount.value
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    offset: (i - Math.floor(count / 2)) * 12,
    pulled: false,
    clamped: false,
  }))
}

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  timeLeft.value = 30
  pulled.value = 0
  tweezX.value = 210
  clampState.value = 'free'
  hairs.value = buildHairs()
  feedbackText.value = ''
  clampedHairId = null

  let count = 6
  introTimer = setInterval(() => {
    count--
    introCountdown.value = count
    if (count <= 0) { clearInterval(introTimer); beginPlaying() }
  }, 1000)
}

function beginPlaying() {
  phase.value = 'playing'
  rafStart = performance.now()
  nextTick(() => gameArea.value?.focus())
  gameTimer = setInterval(() => {
    timeLeft.value = Math.max(0, timeLeft.value - 0.1)
    if (timeLeft.value <= 0) endGame()
  }, 100)
  rafId = requestAnimationFrame(gameLoop)
}

function gameLoop(now) {
  if (phase.value !== 'playing') return
  const elapsed = (now - rafStart) / 1000
  const swing = Math.max(0.3, props.hairSwing)
  // Tweezers swing left-right
  tweezX.value = 210 + 80 * Math.sin(elapsed * swing * 2)
  rafId = requestAnimationFrame(gameLoop)
}

function onKey(e) {
  if (phase.value !== 'playing') return
  if (e.key !== ' ') return
  e.preventDefault()

  if (clampState.value === 'free') {
    // Check if tweezers are over a hair
    const cx = tweezX.value
    const hw = clampHalfWidth.value
    const target = hairs.value.find(h => !h.pulled && !h.clamped && Math.abs((210 + h.offset) - cx) < hw)
    if (target) {
      target.clamped = true
      clampedHairId = target.id
      clampState.value = 'clamped'
      showFeedback('夹住了！', '#e6a23c')
    } else {
      showFeedback('没夹到！', '#f56c6c')
    }
  } else if (clampState.value === 'clamped') {
    // Pull out
    clampState.value = 'pulling'
    const firmness = Math.max(0.5, props.rootFirmness)
    const delay = firmness * 400
    clearTimeout(pullTimer)
    pullTimer = setTimeout(() => {
      const hair = hairs.value.find(h => h.id === clampedHairId)
      if (hair) {
        hair.pulled = true
        hair.clamped = false
        pulled.value++
        showFeedback('拔出！🎉', '#67c23a')
        if (pulled.value >= targetCount.value) { endGame(); return }
      }
      clampedHairId = null
      clampState.value = 'free'
    }, delay)
  }
}

function showFeedback(text, color) {
  clearTimeout(feedbackTimer)
  feedbackText.value = text
  feedbackColor.value = color
  feedbackTimer = setTimeout(() => { feedbackText.value = '' }, 700)
}

function endGame() {
  cancelAnimationFrame(rafId)
  clearInterval(gameTimer)
  clearTimeout(pullTimer)
  phase.value = 'result'
  emit('score', score.value)
}

function restart() { clearAll(); startGame() }
function onClosed() { clearAll(); emit('update:modelValue', false) }
function clearAll() {
  clearInterval(introTimer)
  clearInterval(gameTimer)
  cancelAnimationFrame(rafId)
  clearTimeout(feedbackTimer)
  clearTimeout(pullTimer)
}
onBeforeUnmount(clearAll)
</script>
