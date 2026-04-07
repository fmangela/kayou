<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '游泳' : phase === 'playing' ? '游泳 - 游戏中' : '游戏结束'"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <!-- Intro phase -->
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">游泳</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">保持节奏，快速划水冲向终点！</div>
      <div style="font-size:13px;color:#888;margin-bottom:16px">交替按 ← → 方向键（或 A / D 键）划水</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <!-- Playing phase -->
    <div
      v-else-if="phase === 'playing'"
      style="outline:none"
      tabindex="0"
      ref="gameArea"
      @keydown="onKey"
    >
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span>节奏：<el-tag :type="rhythmTagType" size="small">{{ rhythmLabel }}</el-tag></span>
        <span :style="timeLeft <= 3 ? 'color:#f56c6c;font-weight:bold' : ''">剩余时间：{{ timeLeft.toFixed(1) }}s</span>
      </div>

      <!-- Game canvas: top-down lane view -->
      <div style="position:relative;width:420px;height:260px;background:#1a6fa8;border-radius:12px;overflow:hidden;margin:0 auto">
        <!-- Lane lines -->
        <div style="position:absolute;top:0;bottom:0;left:25%;width:2px;background:rgba(255,255,255,0.3)"></div>
        <div style="position:absolute;top:0;bottom:0;left:50%;width:2px;background:rgba(255,255,255,0.3)"></div>
        <div style="position:absolute;top:0;bottom:0;left:75%;width:2px;background:rgba(255,255,255,0.3)"></div>

        <!-- Finish line -->
        <div style="position:absolute;top:0;bottom:0;right:20px;width:4px;background:repeating-linear-gradient(180deg,white 0,white 8px,black 8px,black 16px)"></div>
        <div style="position:absolute;top:4px;right:26px;font-size:10px;color:white;white-space:nowrap">终点</div>

        <!-- Start line -->
        <div style="position:absolute;top:0;bottom:0;left:20px;width:2px;background:rgba(255,255,255,0.4)"></div>

        <!-- Track length in px -->
        <!-- Player swimmer (top lane) -->
        <div
          :style="{
            position: 'absolute',
            top: '60px',
            left: playerPx + 'px',
            fontSize: '28px',
            transform: 'translateX(-50%) scaleX(-1)',
            transition: 'left 0.1s linear',
          }"
        >🏊</div>
        <div
          :style="{
            position: 'absolute',
            top: '44px',
            left: playerPx + 'px',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.9)',
            transform: 'translateX(-50%)',
          }"
        >你</div>

        <!-- Opponent swimmer (bottom lane) -->
        <div
          :style="{
            position: 'absolute',
            top: '160px',
            left: opponentPx + 'px',
            fontSize: '28px',
            transform: 'translateX(-50%) scaleX(-1)',
            transition: 'left 0.1s linear',
          }"
        >🏊</div>
        <div
          :style="{
            position: 'absolute',
            top: '144px',
            left: opponentPx + 'px',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.7)',
            transform: 'translateX(-50%)',
          }"
        >对手</div>

        <!-- Progress bars at bottom -->
        <div style="position:absolute;bottom:12px;left:24px;right:24px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:10px;color:rgba(255,255,255,0.8);width:24px">你</span>
            <div style="flex:1;height:6px;background:rgba(0,0,0,0.3);border-radius:3px">
              <div :style="{ width: (playerDist / TRACK_LEN * 100).toFixed(1) + '%', height: '100%', background: '#2ecc71', borderRadius: '3px', transition: 'width 0.1s' }"></div>
            </div>
            <span style="font-size:10px;color:rgba(255,255,255,0.8);width:32px">{{ (playerDist / TRACK_LEN * 100).toFixed(0) }}%</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px;color:rgba(255,255,255,0.6);width:24px">对手</span>
            <div style="flex:1;height:6px;background:rgba(0,0,0,0.3);border-radius:3px">
              <div :style="{ width: (opponentDist / TRACK_LEN * 100).toFixed(1) + '%', height: '100%', background: '#e74c3c', borderRadius: '3px', transition: 'width 0.1s' }"></div>
            </div>
            <span style="font-size:10px;color:rgba(255,255,255,0.6);width:32px">{{ (opponentDist / TRACK_LEN * 100).toFixed(0) }}%</span>
          </div>
        </div>
      </div>

      <div style="text-align:center;margin-top:12px;color:#888;font-size:13px">
        交替按
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd>
        或
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">A</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">D</kbd>
        划水
      </div>
    </div>

    <!-- Result phase -->
    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">
        {{ score >= 5 ? '🏆' : score >= 3 ? '🥇' : score >= 2 ? '🥈' : score >= 1 ? '🥉' : '😢' }}
      </div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:8px">{{ resultDesc }}</div>
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
  opponentSpeed: { type: Number, default: 1 },   // track lengths per second
  rhythmWindow: { type: Number, default: 0.5 },  // ideal interval between alternating keys (seconds)
  timeLimit: { type: Number, default: 15 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

// Canvas constants
const CANVAS_W = 420
const TRACK_START = 24   // px from left
const TRACK_END = 396    // px from left (finish line)
const TRACK_LEN = TRACK_END - TRACK_START  // 372px

const phase = ref('intro')
const introCountdown = ref(6)
const timeLeft = ref(15)

// Distances (0..TRACK_LEN)
const playerDist = ref(0)
const opponentDist = ref(0)

// Rhythm tracking
const lastKeyTime = ref(null)
const lastKey = ref(null)   // 'left' | 'right'
const rhythmScore = ref(1)  // 0..1 multiplier

// Final score
const score = ref(0)
const resultDesc = ref('')

const playerPx = computed(() => TRACK_START + Math.min(playerDist.value, TRACK_LEN))
const opponentPx = computed(() => TRACK_START + Math.min(opponentDist.value, TRACK_LEN))

const rhythmLabel = computed(() => {
  if (rhythmScore.value >= 0.85) return '完美'
  if (rhythmScore.value >= 0.6) return '良好'
  if (rhythmScore.value >= 0.35) return '一般'
  return '混乱'
})
const rhythmTagType = computed(() => {
  if (rhythmScore.value >= 0.85) return 'success'
  if (rhythmScore.value >= 0.6) return 'warning'
  if (rhythmScore.value >= 0.35) return ''
  return 'danger'
})
const scoreTagType = computed(() => {
  if (score.value >= 5) return 'success'
  if (score.value >= 3) return 'warning'
  if (score.value >= 1) return ''
  return 'danger'
})
const scoreDesc = computed(() => {
  const descs = ['落后太多，再接再厉！', '略有差距，继续努力！', '势均力敌！', '领先对手！', '大幅领先！', '率先冲线，完美！']
  return descs[Math.min(score.value, 5)]
})

let introTimer = null
let gameTimer = null
let opponentTimer = null

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  timeLeft.value = props.timeLimit
  playerDist.value = 0
  opponentDist.value = 0
  lastKeyTime.value = null
  lastKey.value = null
  rhythmScore.value = 1
  score.value = 0
  resultDesc.value = ''

  let count = 6
  introTimer = setInterval(() => {
    count--
    introCountdown.value = count
    if (count <= 0) { clearInterval(introTimer); beginPlaying() }
  }, 1000)
}

function beginPlaying() {
  phase.value = 'playing'
  startGameTimer()
  startOpponentTimer()
  nextTick(() => gameArea.value?.focus())
}

function startGameTimer() {
  gameTimer = setInterval(() => {
    timeLeft.value = Math.max(0, timeLeft.value - 0.1)
    if (timeLeft.value <= 0) endGame()
  }, 100)
}

function startOpponentTimer() {
  // Opponent advances at opponentSpeed track-lengths per second, updated every 100ms
  const step = props.opponentSpeed * TRACK_LEN * 0.1  // distance per 100ms
  opponentTimer = setInterval(() => {
    if (phase.value !== 'playing') return
    opponentDist.value = Math.min(TRACK_LEN, opponentDist.value + step)
    if (opponentDist.value >= TRACK_LEN) endGame()
  }, 100)
}

function onKey(e) {
  if (phase.value !== 'playing') return
  const isLeft = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A'
  const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'
  if (!isLeft && !isRight) return
  e.preventDefault()

  const keyDir = isLeft ? 'left' : 'right'

  // Must alternate keys
  if (lastKey.value === keyDir) {
    // Same key repeated — penalize rhythm
    rhythmScore.value = Math.max(0, rhythmScore.value - 0.15)
    return
  }

  const now = performance.now() / 1000
  let multiplier = 0.5  // base if no prior key

  if (lastKeyTime.value !== null) {
    const interval = now - lastKeyTime.value
    const ideal = Math.max(0.1, props.rhythmWindow)
    const diff = Math.abs(interval - ideal)
    // Gaussian-like: full bonus within 20% of ideal, fades out
    const ratio = diff / ideal
    multiplier = Math.exp(-3 * ratio * ratio)
    // Smooth rhythm score
    rhythmScore.value = rhythmScore.value * 0.7 + multiplier * 0.3
  }

  lastKeyTime.value = now
  lastKey.value = keyDir

  // Advance player: base speed scaled by rhythm multiplier
  // Base: covers track in ~timeLimit seconds at perfect rhythm
  const baseStep = TRACK_LEN / (props.timeLimit * (1 / props.rhythmWindow))
  const step = baseStep * (0.3 + 0.7 * multiplier)
  playerDist.value = Math.min(TRACK_LEN, playerDist.value + step)

  if (playerDist.value >= TRACK_LEN) endGame()
}

function endGame() {
  clearInterval(gameTimer)
  clearInterval(opponentTimer)
  phase.value = 'result'

  const pDist = playerDist.value
  const oDist = opponentDist.value

  let s = 0
  if (pDist >= TRACK_LEN && oDist < TRACK_LEN) {
    // Player finished first
    s = 5
    resultDesc.value = '率先冲线！'
  } else {
    // Time up or opponent finished — compare distances
    const lead = (pDist - oDist) / TRACK_LEN  // positive = player ahead
    if (lead >= 0.8) { s = 4; resultDesc.value = '大幅领先对手！' }
    else if (lead >= 0.5) { s = 3; resultDesc.value = '明显领先对手！' }
    else if (lead >= 0.2) { s = 2; resultDesc.value = '略微领先对手！' }
    else if (pDist >= TRACK_LEN * 0.5) { s = 1; resultDesc.value = '落后，但完成了一半！' }
    else { s = 0; resultDesc.value = '落后太多，再接再厉！' }
  }

  score.value = s
  emit('score', s)
}

function restart() { clearAll(); startGame() }
function onClosed() { clearAll(); emit('update:modelValue', false) }
function clearAll() {
  clearInterval(introTimer)
  clearInterval(gameTimer)
  clearInterval(opponentTimer)
}

onBeforeUnmount(clearAll)
</script>
