<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '高尔夫' : phase === 'playing' ? '高尔夫 - 游戏中' : '游戏结束'"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <!-- Intro phase -->
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">高尔夫</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">控制好力度，一杆进洞！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <!-- Playing phase -->
    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown.space.prevent="hit">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span>剩余机会：{{ shotsLeft }} / 5</span>
        <span>进洞：{{ holes }}</span>
        <span :style="timeLeft <= 1 ? 'color:#f56c6c;font-weight:bold' : ''">剩余时间：{{ timeLeft.toFixed(1) }}s</span>
      </div>

      <!-- Game canvas -->
      <div style="position:relative;width:420px;height:300px;background:#5b9e3a;border-radius:12px;overflow:hidden;margin:0 auto">
        <!-- Fairway -->
        <div style="position:absolute;left:50%;top:0;bottom:0;width:80px;transform:translateX(-50%);background:rgba(255,255,255,0.08)"></div>

        <!-- Hole (top center) -->
        <div style="position:absolute;top:30px;left:50%;transform:translateX(-50%);text-align:center">
          <div style="width:24px;height:24px;border-radius:50%;background:#111;margin:0 auto"></div>
          <div style="font-size:10px;color:rgba(255,255,255,0.7);margin-top:2px">⛳</div>
        </div>

        <!-- Shot result indicators -->
        <div
          v-for="(r, i) in results"
          :key="i"
          :style="{
            position: 'absolute',
            left: '50%',
            top: r.y + 'px',
            fontSize: '16px',
            transform: 'translateX(-50%)',
          }"
        >{{ r.hole ? '⛳' : r.short ? '🔵' : '🔴' }}</div>

        <!-- Power bar (right side) -->
        <div style="position:absolute;right:24px;top:20px;bottom:20px;width:28px">
          <!-- Track -->
          <div style="position:absolute;inset:0;background:rgba(0,0,0,0.3);border-radius:14px"></div>
          <!-- Green zone -->
          <div
            :style="{
              position: 'absolute',
              left: 0,
              right: 0,
              top: greenZoneTop + '%',
              height: greenZoneHeight + '%',
              background: '#2ecc71',
              borderRadius: '4px',
              opacity: 0.85,
            }"
          ></div>
          <!-- Power indicator dot -->
          <div
            :style="{
              position: 'absolute',
              left: '50%',
              top: powerPos + '%',
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: '#f1c40f',
              border: '2px solid white',
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            }"
          ></div>
          <!-- Labels -->
          <div style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:10px;color:rgba(255,255,255,0.7)">强</div>
          <div style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);font-size:10px;color:rgba(255,255,255,0.7)">弱</div>
        </div>

        <!-- Ball + club -->
        <div style="position:absolute;bottom:30px;left:50%;transform:translateX(-50%);text-align:center">
          <div style="font-size:28px">⛳</div>
        </div>
      </div>

      <div style="text-align:center;margin-top:12px;color:#888;font-size:13px">
        按 <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格键</kbd> 锁定力度击球
        &nbsp;|&nbsp; 绿色区间 = 进洞
      </div>
    </div>

    <!-- Result phase -->
    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">
        {{ holes >= 5 ? '🏆' : holes >= 3 ? '🥇' : holes >= 2 ? '🥈' : holes >= 1 ? '🥉' : '😢' }}
      </div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">进洞 {{ holes }} / 5 次</div>
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
  powerSpeed: { type: Number, default: 1 },    // seconds per full up-down cycle
  greenZone: { type: Number, default: 0.3 },   // fraction of bar that is green (0..1)
  timeLimit: { type: Number, default: 10 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const phase = ref('intro')
const introCountdown = ref(6)
const shotsLeft = ref(5)
const holes = ref(0)
const timeLeft = ref(10)
const results = ref([])

// Power bar: powerPos is 0 (top=strong) to 100 (bottom=weak)
const powerPos = ref(0)
// Green zone position (top %) — randomized each shot, centered around ideal power
const greenZoneTop = ref(35)
const greenZoneHeight = computed(() => Math.max(5, Math.min(50, props.greenZone * 100)))

let introTimer = null
let gameTimer = null
let powerRaf = null
let powerStart = null
let powerDirection = 1

const score = computed(() => holes.value)
const scoreTagType = computed(() => {
  if (holes.value >= 5) return 'success'
  if (holes.value >= 3) return 'warning'
  if (holes.value >= 1) return ''
  return 'danger'
})
const scoreDesc = computed(() => {
  const descs = ['一洞未进，再接再厉！', '略有斩获，继续努力！', '初露锋芒！', '球技不错！', '进洞如流！', '完美球手！']
  return descs[Math.min(holes.value, 5)]
})

const gameArea = ref(null)

function randomizeGreenZone() {
  const h = greenZoneHeight.value
  // Place green zone randomly but fully within 0..100
  greenZoneTop.value = Math.random() * (100 - h)
}

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  shotsLeft.value = 5
  holes.value = 0
  results.value = []
  timeLeft.value = props.timeLimit
  powerPos.value = 0
  powerDirection = 1
  randomizeGreenZone()

  let count = 6
  introTimer = setInterval(() => {
    count--
    introCountdown.value = count
    if (count <= 0) { clearInterval(introTimer); beginPlaying() }
  }, 1000)
}

function beginPlaying() {
  phase.value = 'playing'
  powerStart = performance.now()
  startPowerLoop()
  startGameTimer()
  nextTick(() => gameArea.value?.focus())
}

function startPowerLoop() {
  function loop(now) {
    if (phase.value !== 'playing') return
    const elapsed = (now - powerStart) / 1000
    const period = Math.max(0.3, props.powerSpeed)
    const t = (elapsed % period) / period
    // 0→100→0 triangle wave
    powerPos.value = t < 0.5 ? t * 200 : (1 - t) * 200
    powerRaf = requestAnimationFrame(loop)
  }
  powerRaf = requestAnimationFrame(loop)
}

function startGameTimer() {
  gameTimer = setInterval(() => {
    timeLeft.value = Math.max(0, timeLeft.value - 0.1)
    if (timeLeft.value <= 0) endGame()
  }, 100)
}

function hit() {
  if (phase.value !== 'playing' || shotsLeft.value <= 0) return
  shotsLeft.value--

  const pos = powerPos.value
  const top = greenZoneTop.value
  const bottom = top + greenZoneHeight.value
  const inGreen = pos >= top && pos <= bottom

  // Visual: show result at a y position proportional to power (top=strong=near hole, bottom=weak=far)
  const resultY = 50 + (pos / 100) * 180
  results.value.push({ hole: inGreen, short: pos > bottom, y: resultY })
  if (inGreen) holes.value++

  // Randomize green zone for next shot
  randomizeGreenZone()

  if (shotsLeft.value <= 0) endGame()
}

function endGame() {
  clearInterval(gameTimer)
  cancelAnimationFrame(powerRaf)
  phase.value = 'result'
  emit('score', score.value)
}

function restart() { clearAll(); startGame() }
function onClosed() { clearAll(); emit('update:modelValue', false) }
function clearAll() {
  clearInterval(introTimer)
  clearInterval(gameTimer)
  cancelAnimationFrame(powerRaf)
}

onBeforeUnmount(clearAll)
</script>
