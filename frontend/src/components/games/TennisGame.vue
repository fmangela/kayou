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
      <div style="font-size:15px;color:#555;margin-bottom:24px">用左右键移动站位，按空格键挥拍回击！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <!-- Playing phase -->
    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @click="focusGameArea">
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

        <!-- Opponent -->
        <div class="tennis-player tennis-player--opponent" style="left:50%;top:18px;transform:translateX(-50%)">
          <div class="tennis-player__body tennis-player__body--opponent"></div>
          <div class="tennis-racket tennis-racket--opponent"></div>
        </div>

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

        <!-- Player -->
        <div
          class="tennis-player tennis-player--self"
          :style="{
            position: 'absolute',
            bottom: '24px',
            left: racketX + 'px',
            transform: 'translateX(-50%)',
          }"
        >
          <div class="tennis-player__body"></div>
          <div class="tennis-racket tennis-racket--self"></div>
        </div>
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
        按 <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc;margin-left:4px">→</kbd> 调整站位，
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
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

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
const RACKET_MIN_X = 44
const RACKET_MAX_X = CANVAS_W - 44
const RACKET_MOVE_SPEED = 300
const RACKET_HIT_RANGE_X = 50
const RACKET_HIT_RANGE_Y = 118

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
const movingLeft = ref(false)
const movingRight = ref(false)

// Per-ball state
let ballInFlight = false
let ballStartTime = 0
let ballStartX = CANVAS_W / 2
let swingUsed = false

let introTimer = null
let gameTimer = null
let animRaf = null
let controlRaf = null
let lastControlTime = 0

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
  racketX.value = CANVAS_W / 2
  movingLeft.value = false
  movingRight.value = false

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
  startControlLoop()
  nextTick(() => { focusGameArea(); launchBall() })
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

  const hit =
    Math.abs(racketX.value - ballX.value) <= RACKET_HIT_RANGE_X &&
    Math.abs(RACKET_Y - ballY.value) <= RACKET_HIT_RANGE_Y
  recordResult(hit, ballX.value, ballY.value)
  if (hit) hits.value++
  nextBall()
}

function recordResult(hit, x, y) {
  results.value.push({ hit, x, y })
}

function startControlLoop() {
  cancelAnimationFrame(controlRaf)
  lastControlTime = performance.now()

  function loop(now) {
    if (phase.value !== 'playing') return
    const dt = Math.min(0.03, (now - lastControlTime) / 1000 || 0)
    lastControlTime = now
    updateRacketPosition(dt)
    controlRaf = requestAnimationFrame(loop)
  }

  controlRaf = requestAnimationFrame(loop)
}

function updateRacketPosition(dt) {
  const direction = (movingRight.value ? 1 : 0) - (movingLeft.value ? 1 : 0)
  if (!direction) return
  racketX.value = clamp(racketX.value + direction * RACKET_MOVE_SPEED * dt, RACKET_MIN_X, RACKET_MAX_X)
}

function handleKeydown(event) {
  if (!visible.value || phase.value !== 'playing') return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    movingLeft.value = true
    focusGameArea()
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    movingRight.value = true
    focusGameArea()
    return
  }
  if (event.code === 'Space' || event.key === ' ') {
    event.preventDefault()
    focusGameArea()
    swing()
  }
}

function handleKeyup(event) {
  if (!visible.value || phase.value !== 'playing') return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    movingLeft.value = false
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    movingRight.value = false
  }
}

function focusGameArea() {
  gameArea.value?.focus()
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
  cancelAnimationFrame(controlRaf)
  ballInFlight = false
  ballVisible.value = false
  movingLeft.value = false
  movingRight.value = false
  phase.value = 'result'
  emit('score', score.value)
}

function restart() { clearAll(); startGame() }
function onClosed() { clearAll(); emit('update:modelValue', false) }
function clearAll() {
  clearInterval(introTimer)
  clearInterval(gameTimer)
  cancelAnimationFrame(animRaf)
  cancelAnimationFrame(controlRaf)
  ballInFlight = false
  movingLeft.value = false
  movingRight.value = false
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
})

onBeforeUnmount(clearAll)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('keyup', handleKeyup)
})
</script>

<style scoped>
.tennis-player {
  position: absolute;
  width: 34px;
  height: 34px;
}

.tennis-player__body {
  position: absolute;
  inset: 7px auto auto 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: linear-gradient(180deg, #fff4da 0%, #ffd38b 100%);
  box-shadow: 0 8px 0 -4px #2f4550, 0 18px 0 -8px rgba(255, 255, 255, 0.45);
}

.tennis-player__body--opponent {
  background: linear-gradient(180deg, #fce7b3 0%, #f6c35b 100%);
  box-shadow: 0 8px 0 -4px #394f62, 0 18px 0 -8px rgba(255, 255, 255, 0.35);
}

.tennis-racket {
  position: absolute;
  width: 22px;
  height: 32px;
}

.tennis-racket::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 18px;
  height: 20px;
  border: 3px solid #f7fbff;
  border-radius: 48% 48% 45% 45%;
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,0.4) 0 1px, transparent 1px 5px),
    repeating-linear-gradient(0deg, rgba(255,255,255,0.25) 0 1px, transparent 1px 5px),
    rgba(90, 167, 223, 0.18);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.tennis-racket::after {
  content: '';
  position: absolute;
  left: 8px;
  top: 20px;
  width: 6px;
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(180deg, #9b6135 0%, #6f3f1d 100%);
}

.tennis-racket--self {
  right: -4px;
  top: -2px;
  transform: rotate(18deg);
}

.tennis-racket--opponent {
  left: -4px;
  top: 2px;
  transform: rotate(198deg);
}
</style>
