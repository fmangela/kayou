<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '足球' : phase === 'playing' ? '足球 - 游戏中' : '游戏结束'"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <!-- Intro phase -->
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">足球</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">把握时机，按空格键踢出制胜一球！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <!-- Playing phase -->
    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown.space.prevent="kick">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span>剩余机会：{{ shotsLeft }} / 5</span>
        <span>进球：{{ goals }}</span>
        <span :style="timeLeft <= 1 ? 'color:#f56c6c;font-weight:bold' : ''">剩余时间：{{ timeLeft.toFixed(1) }}s</span>
      </div>

      <!-- Game canvas -->
      <div style="position:relative;width:420px;height:300px;background:#4a9e4a;border-radius:12px;overflow:hidden;margin:0 auto">
        <!-- Goal -->
        <div style="position:absolute;left:50%;top:20px;transform:translateX(-50%);width:200px;height:70px;border:4px solid white;border-bottom:none;box-sizing:border-box">
          <!-- Goal net lines -->
          <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,0.15) 0,rgba(255,255,255,0.15) 1px,transparent 1px,transparent 20px),repeating-linear-gradient(0deg,rgba(255,255,255,0.15) 0,rgba(255,255,255,0.15) 1px,transparent 1px,transparent 20px)"></div>
        </div>

        <!-- Goalkeeper -->
        <div
          :style="{
            position: 'absolute',
            top: '52px',
            left: (goalkeeperX - 20) + 'px',
            width: '40px',
            height: '36px',
            fontSize: '32px',
            textAlign: 'center',
            lineHeight: '36px',
            transition: 'left 0.05s linear',
          }"
        >🧤</div>

        <!-- Shot result indicators -->
        <div
          v-for="(shot, i) in firedShots"
          :key="i"
          :style="{
            position: 'absolute',
            left: shot.x + 'px',
            top: shot.y + 'px',
            fontSize: '18px',
            transform: 'translate(-50%,-50%)',
          }"
        >{{ shot.goal ? '⚽' : '❌' }}</div>

        <!-- Ball + aim arrow -->
        <div style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);text-align:center">
          <!-- Aim arc indicator -->
          <div style="position:relative;width:200px;height:60px;margin:0 auto 8px">
            <svg width="200" height="60" viewBox="0 0 200 60">
              <path d="M 10 55 Q 100 5 190 55" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="4 3"/>
              <circle :cx="aimDotX" :cy="aimDotY" r="7" fill="#f1c40f" opacity="0.9"/>
            </svg>
          </div>
          <div style="font-size:32px">⚽</div>
        </div>
      </div>

      <div style="text-align:center;margin-top:12px;color:#888;font-size:13px">
        按 <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格键</kbd> 射门
      </div>
    </div>

    <!-- Result phase -->
    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">
        {{ goals >= 5 ? '🏆' : goals >= 3 ? '🥇' : goals >= 2 ? '🥈' : goals >= 1 ? '🥉' : '😢' }}
      </div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">进球 {{ goals }} / 5 次</div>
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
  goalkeeperSpeed: { type: Number, default: 1 },  // seconds per full traverse
  swingSpeed: { type: Number, default: 1 },        // seconds per full aim swing
  timeLimit: { type: Number, default: 10 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const phase = ref('intro')
const introCountdown = ref(6)
const shotsLeft = ref(5)
const goals = ref(0)
const timeLeft = ref(10)
const firedShots = ref([])

// Aim state (same arc as archery)
const aimAngle = ref(0)
const aimDotX = ref(100)
const aimDotY = ref(30)

// Goalkeeper state: x position within goal (goal spans x=110..310 on 420px canvas)
const GOAL_LEFT = 110
const GOAL_RIGHT = 310
const goalkeeperX = ref(210)
let gkDirection = 1

let introTimer = null
let gameTimer = null
let aimRaf = null
let gkRaf = null
let aimStart = null
let gkStart = null

const score = computed(() => goals.value)
const scoreTagType = computed(() => {
  if (goals.value >= 5) return 'success'
  if (goals.value >= 3) return 'warning'
  if (goals.value >= 1) return ''
  return 'danger'
})
const scoreDesc = computed(() => {
  const descs = ['一球未进，再接再厉！', '略有斩获，继续努力！', '初露锋芒！', '射门不错！', '进球如麻！', '完美射手！']
  return descs[Math.min(goals.value, 5)]
})

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  shotsLeft.value = 5
  goals.value = 0
  firedShots.value = []
  timeLeft.value = props.timeLimit
  goalkeeperX.value = 210
  gkDirection = 1

  let count = 6
  introTimer = setInterval(() => {
    count--
    introCountdown.value = count
    if (count <= 0) { clearInterval(introTimer); beginPlaying() }
  }, 1000)
}

function beginPlaying() {
  phase.value = 'playing'
  aimStart = performance.now()
  gkStart = performance.now()
  startAimLoop()
  startGkLoop()
  startGameTimer()
  nextTick(() => gameArea.value?.focus())
}

function startAimLoop() {
  function loop(now) {
    if (phase.value !== 'playing') return
    const elapsed = (now - aimStart) / 1000
    const period = Math.max(0.3, props.swingSpeed)
    const t = (elapsed % period) / period
    aimAngle.value = Math.sin(t * Math.PI * 2)
    const u = (aimAngle.value + 1) / 2
    aimDotX.value = 10 + 180 * u
    aimDotY.value = 55 - 50 * Math.sin(u * Math.PI)
    aimRaf = requestAnimationFrame(loop)
  }
  aimRaf = requestAnimationFrame(loop)
}

function startGkLoop() {
  function loop(now) {
    if (phase.value !== 'playing') return
    const elapsed = (now - gkStart) / 1000
    // goalkeeper traverses goal width in goalkeeperSpeed seconds
    const speed = (GOAL_RIGHT - GOAL_LEFT) / Math.max(0.3, props.goalkeeperSpeed)
    goalkeeperX.value += gkDirection * speed * 0.016  // ~60fps
    if (goalkeeperX.value >= GOAL_RIGHT) { goalkeeperX.value = GOAL_RIGHT; gkDirection = -1 }
    if (goalkeeperX.value <= GOAL_LEFT) { goalkeeperX.value = GOAL_LEFT; gkDirection = 1 }
    gkRaf = requestAnimationFrame(loop)
  }
  gkRaf = requestAnimationFrame(loop)
}

function startGameTimer() {
  gameTimer = setInterval(() => {
    timeLeft.value = Math.max(0, timeLeft.value - 0.1)
    if (timeLeft.value <= 0) endGame()
  }, 100)
}

function kick() {
  if (phase.value !== 'playing' || shotsLeft.value <= 0) return
  shotsLeft.value--

  // Aim angle maps to shot x position within goal (GOAL_LEFT..GOAL_RIGHT)
  const u = (aimAngle.value + 1) / 2
  const shotX = GOAL_LEFT + u * (GOAL_RIGHT - GOAL_LEFT)
  const shotY = 30 + Math.random() * 40  // within goal height

  // Goal if goalkeeper is not within ±25px of shot
  const goal = Math.abs(goalkeeperX.value - shotX) > 25
  firedShots.value.push({ x: shotX, y: shotY, goal })
  if (goal) goals.value++

  if (shotsLeft.value <= 0) endGame()
}

function endGame() {
  clearInterval(gameTimer)
  cancelAnimationFrame(aimRaf)
  cancelAnimationFrame(gkRaf)
  phase.value = 'result'
  emit('score', score.value)
}

function restart() { clearAll(); startGame() }
function onClosed() { clearAll(); emit('update:modelValue', false) }
function clearAll() {
  clearInterval(introTimer)
  clearInterval(gameTimer)
  cancelAnimationFrame(aimRaf)
  cancelAnimationFrame(gkRaf)
}

onBeforeUnmount(clearAll)
</script>
