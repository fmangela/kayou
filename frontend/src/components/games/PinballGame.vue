<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '弹球' : phase === 'playing' ? '弹球 - 游戏中' : '游戏结束'"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">弹球</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">按住空格蓄力发射，← → 控制挡板，别让球漏出！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKey" @keyup="onKeyUp">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span>球：{{ ballsLeft }}</span>
        <span>高分目标：{{ hitTargets }} / {{ targetCountValue }}</span>
        <span>倍率：{{ multiplier }}x</span>
      </div>

      <div style="position:relative;width:420px;height:300px;background:#0d0d1a;border-radius:12px;overflow:hidden;margin:0 auto;border:2px solid #333">
        <!-- Bumpers -->
        <div v-for="b in bumpers" :key="b.id" :style="{
          position:'absolute',
          left:(b.x-16)+'px', top:(b.y-16)+'px',
          width:'32px', height:'32px',
          borderRadius:'50%',
          background: b.lit ? '#f39c12' : '#555',
          border:'2px solid #888',
          display:'flex',alignItems:'center',justifyContent:'center',
          fontSize:'14px',
          transition:'background 0.1s',
        }">⭐</div>

        <!-- Multiplier targets -->
        <div v-for="t in targets" :key="t.id" :style="{
          position:'absolute',
          left:t.x+'px', top:t.y+'px',
          width:'30px', height:'12px',
          background: t.hit ? '#333' : '#e74c3c',
          borderRadius:'3px',
          fontSize:'10px',
          display:'flex',alignItems:'center',justifyContent:'center',
          color:'#fff',
        }">{{ t.hit ? '' : t.value+'x' }}</div>

        <!-- Ball -->
        <div :style="{position:'absolute',left:(ballX-8)+'px',top:(ballY-8)+'px',fontSize:'16px'}">⚪</div>

        <!-- Flippers -->
        <div :style="{
          position:'absolute',
          bottom:'20px', left:'40px',
          width:'70px', height:'10px',
          background:'#409eff',
          borderRadius:'5px',
          transformOrigin:'left center',
          transform: leftFlipperUp ? 'rotate(-30deg)' : 'rotate(20deg)',
          transition:'transform 0.05s',
        }"></div>
        <div :style="{
          position:'absolute',
          bottom:'20px', right:'40px',
          width:'70px', height:'10px',
          background:'#409eff',
          borderRadius:'5px',
          transformOrigin:'right center',
          transform: rightFlipperUp ? 'rotate(30deg)' : 'rotate(-20deg)',
          transition:'transform 0.05s',
        }"></div>

        <!-- Drain zone -->
        <div style="position:absolute;bottom:0;left:120px;right:120px;height:20px;background:rgba(244,67,54,0.2);border-top:2px solid #f44336"></div>

        <!-- Launch indicator -->
        <div v-if="!launched" style="position:absolute;bottom:30px;left:50%;transform:translateX(-50%);font-size:12px;color:#aaa">
          按住空格蓄力发射
        </div>

        <!-- Charge bar -->
        <div v-if="charging && !launched" style="position:absolute;bottom:50px;left:160px;width:100px;height:6px;background:#333;border-radius:3px">
          <div :style="{width:chargeLevel*100+'%',height:'100%',background:'#e6a23c',borderRadius:'3px'}"></div>
        </div>

        <!-- Feedback -->
        <div v-if="feedbackText" :style="{position:'absolute',top:'30%',left:'50%',transform:'translate(-50%,-50%)',fontSize:'20px',fontWeight:'bold',color:feedbackColor,textShadow:'0 2px 8px #000',pointerEvents:'none'}">
          {{ feedbackText }}
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd> 左挡板 &nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd> 右挡板 &nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格</kbd> 发射
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">命中高分目标 {{ hitTargets }} 个，累计得分 {{ gameScore }}</div>
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
  launchSpeed: { type: Number, default: 5 },
  drainWidth: { type: Number, default: 0.15 },
  multiplierFreq: { type: Number, default: 0.25 },
  ballCount: { type: Number, default: 2 },
  targetCount: { type: Number, default: 3 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const W = 420, H = 300

const phase = ref('intro')
const introCountdown = ref(6)
const gameScore = ref(0)
const ballsLeft = ref(3)
const multiplier = ref(1)
const ballX = ref(210)
const ballY = ref(250)
const leftFlipperUp = ref(false)
const rightFlipperUp = ref(false)
const charging = ref(false)
const chargeLevel = ref(0)
const launched = ref(false)
const bumpers = ref([])
const targets = ref([])
const feedbackText = ref('')
const feedbackColor = ref('#fff')

let introTimer = null
let rafId = null
let lastFrame = 0
let velX = 0, velY = 0
let keysDown = new Set()
let chargeStart = 0
let feedbackTimer = null

const drainLeft = computed(() => 120)
const drainRight = computed(() => W - 120)
const targetCountValue = computed(() => Math.max(2, Math.min(4, Math.round(props.targetCount))))
const hitTargets = computed(() => targets.value.filter((item) => item.hit).length)

const score = computed(() => {
  if (hitTargets.value >= targetCountValue.value && ballsLeft.value >= Math.max(1, Math.round(props.ballCount))) return 5
  if (hitTargets.value >= targetCountValue.value) return 4
  if (hitTargets.value >= 2) return 3
  if (hitTargets.value >= 1 && gameScore.value >= 30) return 2
  if (gameScore.value >= 10) return 1
  return 0
})
const scoreTagType = computed(() => ['danger','','warning','warning','success','success'][score.value])
const resultEmoji = computed(() => ['😢','🥉','🥈','🥇','🏆','🏆'][score.value])

const gameArea = ref(null)

function buildField() {
  bumpers.value = [
    { id: 0, x: 120, y: 80, lit: false },
    { id: 1, x: 210, y: 60, lit: false },
    { id: 2, x: 300, y: 80, lit: false },
    { id: 3, x: 160, y: 140, lit: false },
    { id: 4, x: 260, y: 140, lit: false },
  ]
  targets.value = Array.from({ length: targetCountValue.value }, (_, index) => ({
    id: index,
    x: [60, 180, 330, 250][index] ?? 60 + index * 88,
    y: [40, 30, 40, 90][index] ?? 40,
    value: index === 1 ? 3 : 2,
    hit: false,
  }))
}

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  gameScore.value = 0
  ballsLeft.value = Math.max(1, Math.round(props.ballCount))
  multiplier.value = 1
  ballX.value = 210; ballY.value = 250
  velX = 0; velY = 0
  launched.value = false
  charging.value = false
  chargeLevel.value = 0
  buildField()
  feedbackText.value = ''

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

  if (charging.value) {
    chargeLevel.value = Math.min(1, (now - chargeStart) / 1000)
  }

  if (!launched.value) { rafId = requestAnimationFrame(gameLoop); return }

  ballX.value += velX * dt
  ballY.value += velY * dt
  velY += 200 * dt  // gravity

  // Wall bounces
  if (ballX.value < 8) { ballX.value = 8; velX = Math.abs(velX) }
  if (ballX.value > W - 8) { ballX.value = W - 8; velX = -Math.abs(velX) }
  if (ballY.value < 8) { ballY.value = 8; velY = Math.abs(velY) }

  // Flipper collisions (simplified)
  const flipY = H - 25
  if (ballY.value > flipY - 8 && ballY.value < flipY + 8) {
    if (ballX.value > 40 && ballX.value < 110 && leftFlipperUp.value) {
      velY = -Math.abs(velY) * 1.1; velX += 50
    }
    if (ballX.value > 310 && ballX.value < 380 && rightFlipperUp.value) {
      velY = -Math.abs(velY) * 1.1; velX -= 50
    }
  }

  // Bumper collisions
  for (const b of bumpers.value) {
    const dx = ballX.value - b.x, dy = ballY.value - b.y
    if (Math.sqrt(dx*dx+dy*dy) < 24) {
      const len = Math.sqrt(dx*dx+dy*dy)
      velX = (dx/len) * 300; velY = (dy/len) * 300
      gameScore.value += multiplier.value * 5
      b.lit = true
      setTimeout(() => { b.lit = false }, 200)
      showFeedback(`+${multiplier.value * 5}`, '#f39c12')
    }
  }

  // Target collisions
  for (const t of targets.value) {
    if (!t.hit && ballX.value > t.x && ballX.value < t.x+30 && ballY.value > t.y && ballY.value < t.y+12) {
      t.hit = true
      multiplier.value = t.value
      gameScore.value += 10
      showFeedback(`${t.value}x 倍率！`, '#67c23a')
      if (hitTargets.value >= targetCountValue.value) {
        endGame()
        return
      }
    }
  }

  // Drain
  if (ballY.value > H - 5) {
    if (ballX.value > drainLeft.value && ballX.value < drainRight.value) {
      ballsLeft.value--
      showFeedback('漏球！', '#f56c6c')
      if (ballsLeft.value <= 0) { endGame(); return }
      ballX.value = 210; ballY.value = 250
      velX = 0; velY = 0
      launched.value = false
      multiplier.value = 1
    } else {
      velY = -Math.abs(velY)
    }
  }

  rafId = requestAnimationFrame(gameLoop)
}

function onKey(e) {
  if (phase.value !== 'playing') return
  if (['ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault()
  keysDown.add(e.key)
  if (e.key === 'ArrowLeft') leftFlipperUp.value = true
  if (e.key === 'ArrowRight') rightFlipperUp.value = true
  if (e.key === ' ' && !launched.value && !charging.value) {
    charging.value = true
    chargeStart = performance.now()
  }
}

function onKeyUp(e) {
  keysDown.delete(e.key)
  if (e.key === 'ArrowLeft') leftFlipperUp.value = false
  if (e.key === 'ArrowRight') rightFlipperUp.value = false
  if (e.key === ' ' && charging.value) {
    charging.value = false
    const speed = Math.max(3, props.launchSpeed) * 60 * (0.5 + chargeLevel.value * 0.5)
    velX = (Math.random() - 0.5) * speed * 0.5
    velY = -speed
    launched.value = true
    chargeLevel.value = 0
  }
}

function showFeedback(text, color) {
  clearTimeout(feedbackTimer)
  feedbackText.value = text
  feedbackColor.value = color
  feedbackTimer = setTimeout(() => { feedbackText.value = '' }, 600)
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
  keysDown.clear()
}
onBeforeUnmount(clearAll)
</script>
