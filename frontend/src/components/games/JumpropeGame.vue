<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '跳绳' : phase === 'playing' ? '跳绳 - 游戏中' : '游戏结束'"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">跳绳</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">绳子转到最低点时按空格跳！节奏会变化，保持连跳！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKey">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span>跳：{{ jumps }} / {{ targetJumpCount }}</span>
        <span>连跳：{{ combo }}x</span>
        <span>失误：{{ misses }} / 2</span>
      </div>

      <div style="position:relative;width:420px;height:280px;background:linear-gradient(#87ceeb 60%,#90ee90 60%);border-radius:12px;overflow:hidden;margin:0 auto">
        <!-- Rope -->
        <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none" viewBox="0 0 420 280">
          <path :d="ropePath" fill="none" stroke="#c0392b" stroke-width="4" stroke-linecap="round"/>
        </svg>

        <!-- Player -->
        <div :style="{
          position:'absolute',
          bottom: (60 + playerJumpY) + 'px',
          left:'190px',
          fontSize:'40px',
          transition:'bottom 0.05s',
        }">🧍</div>

        <!-- Hit zone indicator -->
        <div style="position:absolute;bottom:55px;left:160px;width:100px;height:4px;background:rgba(64,158,255,0.4);border-radius:2px"></div>

        <!-- Feedback -->
        <div v-if="feedbackText" :style="{position:'absolute',top:'30%',left:'50%',transform:'translate(-50%,-50%)',fontSize:'22px',fontWeight:'bold',color:feedbackColor,textShadow:'0 2px 8px #000',pointerEvents:'none'}">
          {{ feedbackText }}
        </div>

        <!-- Rope angle hint -->
        <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);font-size:12px;color:#555">
          绳子到底时跳！
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格</kbd> 跳
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">跳了 {{ jumps }} 下，最高连跳 {{ maxCombo }}x</div>
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
  ropeSpeed: { type: Number, default: 1 },
  speedChangeFreq: { type: Number, default: 0.2 },
  jumpWindow: { type: Number, default: 0.22 },
  targetJumpCount: { type: Number, default: 12 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const phase = ref('intro')
const introCountdown = ref(6)
const jumps = ref(0)
const combo = ref(0)
const maxCombo = ref(0)
const misses = ref(0)
const ropePath = ref('')
const playerJumpY = ref(0)
const feedbackText = ref('')
const feedbackColor = ref('#fff')

let introTimer = null
let rafId = null
let lastFrame = 0
let ropeAngle = 0
let currentSpeed = 1
let speedChangeTimer = 0
let feedbackTimer = null
let jumpAnimTimer = null

// Rope is at bottom when angle = PI (180 deg)
const BOTTOM_ANGLE = Math.PI
const HIT_WINDOW = computed(() => props.jumpWindow)

const score = computed(() => {
  const j = jumps.value
  if (j >= 12) return 5
  if (j >= 10) return 4
  if (j >= 8) return 3
  if (j >= 6) return 2
  if (j >= 3) return 1
  return 0
})
const scoreTagType = computed(() => ['danger','','warning','warning','success','success'][score.value])
const resultEmoji = computed(() => ['😢','🥉','🥈','🥇','🏆','🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  jumps.value = 0
  combo.value = 0
  maxCombo.value = 0
  misses.value = 0
  ropeAngle = 0
  currentSpeed = props.ropeSpeed
  feedbackText.value = ''
  playerJumpY.value = 0

  let count = 6
  introTimer = setInterval(() => {
    count--
    introCountdown.value = count
    if (count <= 0) { clearInterval(introTimer); beginPlaying() }
  }, 1000)
}

function beginPlaying() {
  phase.value = 'playing'
  lastFrame = performance.now()
  nextTick(() => gameArea.value?.focus())
  rafId = requestAnimationFrame(gameLoop)
}

function gameLoop(now) {
  if (phase.value !== 'playing') return
  const dt = (now - lastFrame) / 1000
  lastFrame = now

  // Speed changes
  speedChangeTimer += dt
  if (speedChangeTimer > 1 / Math.max(0.05, props.speedChangeFreq)) {
    speedChangeTimer = 0
    currentSpeed = props.ropeSpeed * (0.7 + Math.random() * 0.6)
  }

  ropeAngle = (ropeAngle + currentSpeed * 3 * dt) % (Math.PI * 2)

  // Draw rope as arc
  const cx = 210, cy = 160, rx = 160, ry = 80
  const x1 = cx - rx
  const y1 = cy
  const x2 = cx + rx
  const y2 = cy
  const ropeY = cy + ry * Math.sin(ropeAngle)
  ropePath.value = `M ${x1} ${y1} Q ${cx} ${ropeY} ${x2} ${y2}`

  rafId = requestAnimationFrame(gameLoop)
}

function onKey(e) {
  if (phase.value !== 'playing') return
  if (e.key !== ' ') return
  e.preventDefault()

  // Check if rope is near bottom (angle near PI)
  const diff = Math.abs(((ropeAngle % (Math.PI * 2)) - BOTTOM_ANGLE))
  const minDiff = Math.min(diff, Math.PI * 2 - diff)
  const window = HIT_WINDOW.value * Math.PI

  if (minDiff < window) {
    jumps.value++
    combo.value++
    if (combo.value > maxCombo.value) maxCombo.value = combo.value
    showFeedback(combo.value >= 5 ? `${combo.value}连跳！` : '跳！', combo.value >= 5 ? '#67c23a' : '#e6a23c')
    // Jump animation
    playerJumpY.value = 40
    clearTimeout(jumpAnimTimer)
    jumpAnimTimer = setTimeout(() => { playerJumpY.value = 0 }, 300)
    if (jumps.value >= Math.max(8, Math.round(props.targetJumpCount))) {
      endGame()
    }
  } else {
    combo.value = 0
    misses.value++
    showFeedback('绊倒！', '#f56c6c')
    if (misses.value >= 2) endGame()
  }
}

function showFeedback(text, color) {
  clearTimeout(feedbackTimer)
  feedbackText.value = text
  feedbackColor.value = color
  feedbackTimer = setTimeout(() => { feedbackText.value = '' }, 500)
}

function endGame() {
  cancelAnimationFrame(rafId)
  phase.value = 'result'
  emit('score', score.value)
}

function restart() { clearAll(); startGame() }
function onClosed() { clearAll(); emit('update:modelValue', false) }
function clearAll() {
  clearInterval(introTimer)
  cancelAnimationFrame(rafId)
  clearTimeout(feedbackTimer)
  clearTimeout(jumpAnimTimer)
}
onBeforeUnmount(clearAll)
</script>
