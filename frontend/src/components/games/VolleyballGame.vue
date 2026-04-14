<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '垫球' : phase === 'playing' ? '垫球 - 游戏中' : '游戏结束'"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">垫球</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">左右移动接球，再按空格把球垫进目标传球窗。整局只处理 5 次来球！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKeyDown" @keyup="onKeyUp">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span>来球 {{ currentBall + 1 }} / {{ totalBalls }}</span>
        <span>精准 {{ preciseCount }}</span>
        <span>普通 {{ normalCount }}</span>
        <span>失误 {{ missCount }}</span>
      </div>

      <div style="position:relative;width:440px;height:300px;background:linear-gradient(180deg,#bde0fe 0%,#d9f0ff 58%,#82b366 58%,#82b366 100%);border-radius:12px;overflow:hidden;margin:0 auto">
        <div style="position:absolute;left:0;right:0;top:138px;height:4px;background:rgba(255,255,255,0.65)"></div>
        <div style="position:absolute;top:52px;left:0;right:0;height:3px;background:rgba(255,255,255,0.3)"></div>

        <div
          :style="{
            position:'absolute',
            left:(targetWindowX - targetWindowWidth / 2)+'px',
            top:'56px',
            width: targetWindowWidth + 'px',
            height:'18px',
            background:'rgba(103,194,58,0.45)',
            border:'2px solid #67c23a',
            borderRadius:'999px',
          }"
        ></div>

        <div :style="{position:'absolute',left:(ballX - 14)+'px',top:(ballY - 14)+'px',fontSize:'28px'}">🏐</div>

        <div :style="{position:'absolute',left:(playerX - 18)+'px',top:'222px',fontSize:'34px',transition:'left 0.03s linear'}">🏃</div>

        <div
          :style="{
            position:'absolute',
            left:(landingX - 16)+'px',
            top:'234px',
            width:'32px',
            height:'6px',
            background:'rgba(64,158,255,0.45)',
            borderRadius:'999px',
          }"
        ></div>

        <div style="position:absolute;left:16px;right:16px;bottom:14px;height:10px;background:rgba(255,255,255,0.25);border-radius:999px;overflow:hidden">
          <div :style="{width: hitProgress + '%',height:'100%',background:'#409eff',transition:'width 0.05s linear'}"></div>
        </div>

        <div v-if="feedbackText" :style="{position:'absolute',top:'18px',left:'50%',transform:'translateX(-50%)',fontSize:'22px',fontWeight:'bold',color:feedbackColor,textShadow:'0 2px 8px #000'}">
          {{ feedbackText }}
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd>
        移动
        &nbsp;|&nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格</kbd>
        垫传
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">精准 {{ preciseCount }} 次，普通 {{ normalCount }} 次，失误 {{ missCount }} 次</div>
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  tossSpeed: { type: Number, default: 4 },
  targetWindowWidthValue: { type: Number, default: 18 },
  spinDrift: { type: Number, default: 0.15 },
  targetBallCount: { type: Number, default: 5 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const phase = ref('intro')
const introCountdown = ref(6)
const currentBall = ref(0)
const preciseCount = ref(0)
const normalCount = ref(0)
const missCount = ref(0)
const playerX = ref(220)
const landingX = ref(220)
const ballX = ref(220)
const ballY = ref(70)
const targetWindowX = ref(220)
const targetWindowWidth = ref(80)
const hitProgress = ref(0)
const feedbackText = ref('')
const feedbackColor = ref('#fff')

let introTimer = null
let rafId = null
let lastFrame = 0
let inputDir = 0
let ballTimer = 0
let caught = false
let feedbackTimer = null

const totalBalls = computed(() => Math.max(4, Math.min(6, Math.round(props.targetBallCount))))

const score = computed(() => {
  if (preciseCount.value >= totalBalls.value) return 5
  if (preciseCount.value >= 4) return 4
  if (preciseCount.value >= 3) return 3
  if (normalCount.value + preciseCount.value >= 3) return 2
  if (preciseCount.value >= 1) return 1
  return 0
})
const scoreTagType = computed(() => ['danger', '', 'warning', 'warning', 'success', 'success'][score.value])
const resultEmoji = computed(() => ['😢', '🥉', '🥈', '🥇', '🏆', '🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  currentBall.value = 0
  preciseCount.value = 0
  normalCount.value = 0
  missCount.value = 0
  feedbackText.value = ''
  inputDir = 0
  prepareBall()

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

function prepareBall() {
  playerX.value = 220
  landingX.value = 90 + Math.random() * 260
  targetWindowX.value = 100 + Math.random() * 240
  targetWindowWidth.value = Math.max(56, Math.min(110, props.targetWindowWidthValue * 4.2))
  ballX.value = 220
  ballY.value = 70
  ballTimer = 0
  caught = false
  hitProgress.value = 0
}

function beginPlaying() {
  phase.value = 'playing'
  lastFrame = performance.now()
  nextTick(() => gameArea.value?.focus())
  rafId = requestAnimationFrame(gameLoop)
}

function gameLoop(now) {
  if (phase.value !== 'playing') return
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now

  playerX.value = clamp(playerX.value + inputDir * 220 * dt, 28, 412)

  ballTimer += dt
  const fallDuration = Math.max(1.05, 2.15 - Math.max(1, props.tossSpeed) * 0.16)
  const t = Math.min(1, ballTimer / fallDuration)
  const drift = Math.sin(t * Math.PI) * props.spinDrift * 140
  ballX.value = 220 + (landingX.value - 220) * t + drift
  ballY.value = 70 + 160 * t
  hitProgress.value = t * 100

  if (t >= 1) {
    if (!caught) {
      missCount.value++
      flash('没接到！', '#f56c6c')
      advanceBall()
    }
    if (phase.value === 'playing') {
      rafId = requestAnimationFrame(gameLoop)
    }
    return
  }

  rafId = requestAnimationFrame(gameLoop)
}

function onKeyDown(e) {
  if (phase.value !== 'playing') return
  if (e.key === 'ArrowLeft') inputDir = -1
  if (e.key === 'ArrowRight') inputDir = 1
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault()
    tryPass()
  }
}

function onKeyUp(e) {
  if (e.key === 'ArrowLeft' && inputDir === -1) inputDir = 0
  if (e.key === 'ArrowRight' && inputDir === 1) inputDir = 0
}

function tryPass() {
  if (caught) return
  const nearPlayer = Math.abs(ballX.value - playerX.value) <= 34 && ballY.value >= 160 && ballY.value <= 240
  if (!nearPlayer) {
    flash('起球点不对', '#f56c6c')
    return
  }

  caught = true
  const normalizedHeight = clamp((ballY.value - 160) / 80, 0, 1)
  const passX = playerX.value + (0.5 - normalizedHeight) * 120
  const precise = Math.abs(passX - targetWindowX.value) <= targetWindowWidth.value / 2
  const normal = Math.abs(passX - targetWindowX.value) <= targetWindowWidth.value / 2 + 28

  if (precise) {
    preciseCount.value++
    flash('精准到位！', '#67c23a')
  } else if (normal) {
    normalCount.value++
    flash('普通传球', '#ffd166')
  } else {
    missCount.value++
    flash('传偏了', '#f56c6c')
  }

  advanceBall()
}

function advanceBall() {
  if (currentBall.value >= totalBalls.value - 1) {
    endGame()
    return
  }
  currentBall.value++
  prepareBall()
}

function flash(text, color) {
  feedbackText.value = text
  feedbackColor.value = color
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => { feedbackText.value = '' }, 650)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function endGame() {
  clearLoop()
  phase.value = 'result'
  emit('score', score.value)
}

function restart() {
  clearAll()
  startGame()
}

function clearLoop() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
}

function clearAll() {
  clearLoop()
  clearInterval(introTimer)
  clearTimeout(feedbackTimer)
}

function onClosed() {
  clearAll()
  emit('update:modelValue', false)
}

onBeforeUnmount(clearAll)
</script>
