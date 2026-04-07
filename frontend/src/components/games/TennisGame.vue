<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '网球' : phase === 'playing' ? '网球 - 游戏中' : '游戏结束'"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <!-- Intro phase -->
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">网球</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">盯准来球，按空格键挥拍回击！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <!-- Playing phase -->
    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown.space.prevent="swing">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span>剩余来球：{{ ballsLeft }} / 5</span>
        <span>回击：{{ hits }}</span>
        <span :style="timeLeft <= 1 ? 'color:#f56c6c;font-weight:bold' : ''">剩余时间：{{ timeLeft.toFixed(1) }}s</span>
      </div>

      <!-- Game canvas -->
      <div style="position:relative;width:420px;height:300px;background:#5b9e3a;border-radius:12px;overflow:hidden;margin:0 auto">
        <!-- Court lines -->
        <!-- Baseline top -->
        <div style="position:absolute;top:10px;left:20px;right:20px;height:2px;background:rgba(255,255,255,0.7)"></div>
        <!-- Baseline bottom -->
        <div style="position:absolute;bottom:10px;left:20px;right:20px;height:2px;background:rgba(255,255,255,0.7)"></div>
        <!-- Net -->
        <div style="position:absolute;top:50%;left:0;right:0;height:4px;background:white;transform:translateY(-50%)">
          <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(0,0,0,0.2) 0,rgba(0,0,0,0.2) 1px,transparent 1px,transparent 10px)"></div>
        </div>
        <!-- Net post left -->
        <div style="position:absolute;top:calc(50% - 12px);left:0;width:4px;height:24px;background:white"></div>
        <!-- Net post right -->
        <div style="position:absolute;top:calc(50% - 12px);right:0;width:4px;height:24px;background:white"></div>

        <!-- Opponent (top) -->
        <div style="position:absolute;top:18px;left:50%;transform:translateX(-50%);font-size:24px">🎾</div>

        <!-- Ball in flight -->
        <div
          v-if="ballVisible"
          :style="{
            position: 'absolute',
            left: ballX + 'px',
            top: ballY + 'px',
            fontSize: '18px',
            transform: 'translate(-50%,-50%)',
            transition: 'none',
          }"
        >🎾</div>

        <!-- Shot result indicators -->
        <div
          v-for="(r, i) in results"
          :key="i"
          :style="{
            position: 'absolute',
            left: r.x + 'px',
            top: r.y + 'px',
            fontSize: '16px',
            transform: 'translate(-50%,-50%)',
          }"
        >{{ r.hit ? '✅' : '❌' }}</div>

        <!-- Player racket -->
        <div
          :style="{
            position: 'absolute',
            bottom: '18px',
            left: racketX + 'px',
            fontSize: '28px',
            transform: 'translateX(-50%)',
            transition: 'left 0.08s linear',
          }"
        >🎾</div>
        <!-- Racket label -->
        <div
          :style="{
            position: 'absolute',
            bottom: '4px',
            left: racketX + 'px',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.8)',
            transform: 'translateX(-50%)',
          }"
        >你</div>
      </div>

      <div style="text-align:center;margin-top:12px;color:#888;font-size:13px">
        按 <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格键</kbd> 挥拍回击
      </div>
    </div>

    <!-- Result phase -->
    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">
        {{ hits >= 5 ? '🏆' : hits >= 3 ? '🥇' : hits >= 2 ? '🥈' : hits >= 1 ? '🥉' : '😢' }}
      </div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">回击 {{ hits }} / 5 球</div>
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
  ballSpeed: { type: Number, default: 1 },       // seconds to travel from top to bottom
  landingRange: { type: Number, default: 0.5 },  // 0..1 fraction of canvas width for random offset
  timeLimit: { type: Number, default: 15 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const CANVAS_W = 420
const CANVAS_H = 300
const BALL_START_Y = 30
const BALL_END_Y = 260   // landing zone y (near player baseline)
const RACKET_Y = 260     // player racket y

const phase = ref('intro')
const introCountdown = ref(6)
const ballsLeft = ref(5)
const hits = ref(0)
const timeLeft = ref(15)
const results = ref([])

// Ball state
const ballVisible = ref(false)
const ballX = ref(CANVAS_W / 2)
const ballY = ref(BALL_START_Y)
let targetX = CANVAS_W / 2

// Racket state
const racketX = ref(CANVAS_W / 2)

// Per-ball state
let ballInFlight = false
let ballStartTime = 0
let ballStartX = CANVAS_W / 2
let swingUsed = false

let introTimer = null
let gameTimer = null
let animRaf = null

const score = computed(() => hits.value)
const scoreTagType = computed(() => {
  if (hits.value >= 5) return 'success'
  if (hits.value >= 3) return 'warning'
  if (hits.value >= 1) return ''
  return 'danger'
})
const scoreDesc = computed(() => {
  const descs = ['一球未接，再接再厉！', '略有斩获，继续努力！', '初露锋芒！', '球技不错！', '接球如流！', '完美球手！']
  return descs[Math.min(hits.value, 5)]
})

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  ballsLeft.value = 5
  hits.value = 0
  results.value = []
  timeLeft.value = props.timeLimit
  ballVisible.value = false
  ballInFlight = false

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
  nextTick(() => { gameArea.value?.focus(); launchBall() })
}

function launchBall() {
  if (ballsLeft.value <= 0 || phase.value !== 'playing') return
  // Random landing x within landingRange
  const range = Math.min(1, Math.max(0.1, props.landingRange))
  const offset = (Math.random() - 0.5) * range * CANVAS_W
  targetX = Math.max(40, Math.min(CANVAS_W - 40, CANVAS_W / 2 + offset))
  ballStartX = CANVAS_W / 2 + (Math.random() - 0.5) * 60  // slight random serve origin
  ballX.value = ballStartX
  ballY.value = BALL_START_Y
  ballVisible.value = true
  ballInFlight = true
  swingUsed = false
  ballStartTime = performance.now()

  // Move racket toward target
  racketX.value = targetX

  startBallAnim()
}

function startBallAnim() {
  function loop(now) {
    if (phase.value !== 'playing') return
    if (!ballInFlight) return
    const elapsed = (now - ballStartTime) / 1000
    const duration = Math.max(0.3, props.ballSpeed)
    const progress = Math.min(1, elapsed / duration)

    ballX.value = ballStartX + (targetX - ballStartX) * progress
    ballY.value = BALL_START_Y + (BALL_END_Y - BALL_START_Y) * progress

    if (progress >= 1) {
      // Ball landed — if swing not used, miss
      if (!swingUsed) {
        recordResult(false, targetX, BALL_END_Y)
        nextBall()
      }
      return
    }
    animRaf = requestAnimationFrame(loop)
  }
  animRaf = requestAnimationFrame(loop)
}

function swing() {
  if (phase.value !== 'playing' || !ballInFlight || swingUsed) return
  swingUsed = true
  cancelAnimationFrame(animRaf)
  ballVisible.value = false
  ballInFlight = false

  // Hit if racket is within ±35px of ball's current x and ball is in lower half
  const hit = Math.abs(racketX.value - ballX.value) <= 35 && ballY.value >= CANVAS_H / 2
  recordResult(hit, ballX.value, ballY.value)
  if (hit) hits.value++
  nextBall()
}

function recordResult(hit, x, y) {
  results.value.push({ hit, x, y })
}

function nextBall() {
  ballsLeft.value--
  ballInFlight = false
  ballVisible.value = false
  if (ballsLeft.value <= 0) { endGame(); return }
  // Short delay before next ball
  setTimeout(() => { if (phase.value === 'playing') launchBall() }, 800)
}

function startGameTimer() {
  gameTimer = setInterval(() => {
    timeLeft.value = Math.max(0, timeLeft.value - 0.1)
    if (timeLeft.value <= 0) endGame()
  }, 100)
}

function endGame() {
  clearInterval(gameTimer)
  cancelAnimationFrame(animRaf)
  ballInFlight = false
  ballVisible.value = false
  phase.value = 'result'
  emit('score', score.value)
}

function restart() { clearAll(); startGame() }
function onClosed() { clearAll(); emit('update:modelValue', false) }
function clearAll() {
  clearInterval(introTimer)
  clearInterval(gameTimer)
  cancelAnimationFrame(animRaf)
  ballInFlight = false
}

onBeforeUnmount(clearAll)
</script>
