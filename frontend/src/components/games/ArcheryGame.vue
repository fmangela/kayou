<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '射箭' : phase === 'playing' ? '射箭 - 游戏中' : '游戏结束'"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <!-- Intro phase -->
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">射箭</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">瞄准靶子按空格键发射箭矢吧！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <!-- Playing phase -->
    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown.space.prevent="shoot">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span>剩余箭矢：{{ arrowsLeft }} / 5</span>
        <span>命中：{{ hits }}</span>
        <span :style="timeLeft <= 1 ? 'color:#f56c6c;font-weight:bold' : ''">剩余时间：{{ timeLeft.toFixed(1) }}s</span>
      </div>

      <!-- Game canvas -->
      <div style="position:relative;width:420px;height:320px;background:#e8f4e8;border-radius:12px;overflow:hidden;margin:0 auto">
        <!-- Target -->
        <div style="position:absolute;left:50%;top:60px;transform:translateX(-50%)">
          <div style="width:100px;height:100px;border-radius:50%;background:#e74c3c;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 12px #f39c12,0 0 0 24px #f1c40f,0 0 0 36px #ecf0f1">
            <div style="width:20px;height:20px;border-radius:50%;background:#c0392b"></div>
          </div>
        </div>

        <!-- Arrows on target -->
        <div
          v-for="(arrow, i) in firedArrows"
          :key="i"
          :style="{
            position: 'absolute',
            left: arrow.x + 'px',
            top: arrow.y + 'px',
            fontSize: '20px',
            transform: 'translate(-50%, -50%) rotate(-90deg)',
            transition: 'all 0.15s',
          }"
        >{{ arrow.hit ? '🎯' : '❌' }}</div>

        <!-- Bow + aim indicator -->
        <div style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);text-align:center">
          <!-- Aim arc indicator -->
          <div style="position:relative;width:200px;height:60px;margin:0 auto 8px">
            <svg width="200" height="60" viewBox="0 0 200 60">
              <!-- Arc path -->
              <path d="M 10 55 Q 100 5 190 55" fill="none" stroke="#aaa" stroke-width="2" stroke-dasharray="4 3"/>
              <!-- Aim dot -->
              <circle :cx="aimDotX" :cy="aimDotY" r="7" fill="#e74c3c" opacity="0.85"/>
            </svg>
          </div>
          <!-- Bow emoji -->
          <div style="font-size:36px">🏹</div>
        </div>
      </div>

      <div style="text-align:center;margin-top:12px;color:#888;font-size:13px">
        按 <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格键</kbd> 发射箭矢
      </div>
    </div>

    <!-- Result phase -->
    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">
        {{ hits >= 5 ? '🏆' : hits >= 3 ? '🥇' : hits >= 2 ? '🥈' : hits >= 1 ? '🥉' : '😢' }}
      </div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">命中 {{ hits }} / 5 箭</div>
      <el-tag :type="scoreTagType" size="large" style="font-size:18px;padding:8px 24px">
        得分：{{ score }} / 5
      </el-tag>
      <div style="margin-top:16px;color:#888;font-size:13px">{{ scoreDesc }}</div>
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
  swingSpeed: { type: Number, default: 1 },   // seconds per full swing
  timeLimit: { type: Number, default: 5 },     // seconds
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => {
  if (v) startGame()
  visible.value = v
})
watch(visible, (v) => emit('update:modelValue', v))

// Game state
const phase = ref('intro')       // intro | playing | result
const introCountdown = ref(6)
const arrowsLeft = ref(5)
const hits = ref(0)
const timeLeft = ref(5)
const firedArrows = ref([])

// Aim state
const aimAngle = ref(0)          // -1 to 1 (left to right)
const aimDotX = ref(100)
const aimDotY = ref(30)

// Timers
let introTimer = null
let gameTimer = null
let aimRaf = null
let aimStart = null

const score = computed(() => hits.value)
const scoreTagType = computed(() => {
  if (hits.value >= 5) return 'success'
  if (hits.value >= 3) return 'warning'
  if (hits.value >= 1) return ''
  return 'danger'
})
const scoreDesc = computed(() => {
  const descs = ['一箭未中，再接再厉！', '略有斩获，继续努力！', '初露锋芒！', '箭术不错！', '百步穿杨！', '完美射手！']
  return descs[Math.min(hits.value, 5)]
})

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  arrowsLeft.value = 5
  hits.value = 0
  firedArrows.value = []
  timeLeft.value = props.timeLimit

  let count = 6
  introTimer = setInterval(() => {
    count--
    introCountdown.value = count
    if (count <= 0) {
      clearInterval(introTimer)
      beginPlaying()
    }
  }, 1000)
}

function beginPlaying() {
  phase.value = 'playing'
  aimStart = performance.now()
  startAimLoop()
  startGameTimer()
  nextTick(() => gameArea.value?.focus())
}

function startAimLoop() {
  function loop(now) {
    if (phase.value !== 'playing') return
    const elapsed = (now - aimStart) / 1000
    // swing period = swingSpeed seconds per full back-and-forth
    const period = Math.max(0.3, props.swingSpeed)
    const t = (elapsed % period) / period
    // sine wave: -1 to 1
    aimAngle.value = Math.sin(t * Math.PI * 2)
    // Map angle to arc position on SVG (200x60 arc)
    // Arc: from (10,55) through (100,5) to (190,55)
    // Parametric: x = 10 + 180*u, y = 55 - 50*sin(u*PI) where u in [0,1]
    const u = (aimAngle.value + 1) / 2  // 0 to 1
    aimDotX.value = 10 + 180 * u
    aimDotY.value = 55 - 50 * Math.sin(u * Math.PI)
    aimRaf = requestAnimationFrame(loop)
  }
  aimRaf = requestAnimationFrame(loop)
}

function startGameTimer() {
  const interval = 100
  gameTimer = setInterval(() => {
    timeLeft.value = Math.max(0, timeLeft.value - interval / 1000)
    if (timeLeft.value <= 0) endGame()
  }, interval)
}

function shoot() {
  if (phase.value !== 'playing' || arrowsLeft.value <= 0) return

  // Determine hit: angle within ±0.3 of center (0) = hit
  const hit = Math.abs(aimAngle.value) < 0.3
  arrowsLeft.value--

  // Visual position of arrow on canvas
  const u = (aimAngle.value + 1) / 2
  const arrowX = 50 + u * 320   // spread across canvas width
  const arrowY = hit ? 100 + Math.random() * 60 : 220 + Math.random() * 60

  firedArrows.value.push({ x: arrowX, y: arrowY, hit })
  if (hit) hits.value++

  if (arrowsLeft.value <= 0) endGame()
}

function endGame() {
  clearInterval(gameTimer)
  cancelAnimationFrame(aimRaf)
  phase.value = 'result'
  emit('score', score.value)
}

function restart() {
  clearAll()
  startGame()
}

function onClosed() {
  clearAll()
  emit('update:modelValue', false)
}

function clearAll() {
  clearInterval(introTimer)
  clearInterval(gameTimer)
  cancelAnimationFrame(aimRaf)
}

onBeforeUnmount(clearAll)
</script>
