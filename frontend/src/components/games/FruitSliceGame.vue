<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '切水果' : phase === 'playing' ? '切水果 - 游戏中' : '游戏结束'"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">切水果</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">方向键移动刀光准星，空格挥刀切水果，4 轮抛射后立即结算！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKeyDown" @keyup="onKeyUp">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span>轮次：{{ currentRound }} / {{ totalRounds }}</span>
        <span>水果：{{ fruitsCut }}</span>
        <span>连击：{{ combo }}</span>
        <span>炸弹：{{ bombHits }}/2</span>
      </div>

      <div style="position:relative;width:440px;height:300px;background:radial-gradient(circle at top,#355070 0%,#1d3557 45%,#0b132b 100%);border-radius:12px;overflow:hidden;margin:0 auto">
        <div style="position:absolute;inset:0;background:radial-gradient(circle at 20% 20%,rgba(255,255,255,0.08),transparent 28%),radial-gradient(circle at 80% 18%,rgba(255,255,255,0.06),transparent 24%)"></div>

        <div
          v-for="item in items"
          :key="item.id"
          :style="{
            position: 'absolute',
            left: item.x + 'px',
            top: item.y + 'px',
            fontSize: '30px',
            opacity: item.cut ? 0.35 : 1,
            transform: item.cut ? 'scale(1.2)' : 'scale(1)',
            transition: 'transform 0.12s, opacity 0.12s',
          }"
        >
          {{ item.emoji }}
        </div>

        <div
          :style="{
            position: 'absolute',
            left: cursorX - 18 + 'px',
            top: cursorY - 18 + 'px',
            width: '36px',
            height: '36px',
            border: slashActive ? '3px solid #ffd166' : '2px dashed rgba(255,255,255,0.6)',
            borderRadius: '50%',
            boxShadow: slashActive ? '0 0 14px #ffd166' : 'none',
            pointerEvents: 'none',
            transition: 'left 0.03s linear, top 0.03s linear, box-shadow 0.08s',
          }"
        ></div>

        <div
          v-if="slashActive"
          :style="{
            position: 'absolute',
            left: cursorX - 48 + 'px',
            top: cursorY - 10 + 'px',
            width: '96px',
            height: '20px',
            background: 'linear-gradient(90deg,transparent,rgba(255,209,102,0.95),transparent)',
            transform: 'rotate(-25deg)',
            borderRadius: '999px',
            pointerEvents: 'none',
          }"
        ></div>

        <div v-if="feedbackText" :style="{ position:'absolute', top:'20px', left:'50%', transform:'translateX(-50%)', fontSize:'20px', fontWeight:'bold', color:feedbackColor, textShadow:'0 2px 8px #000' }">
          {{ feedbackText }}
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">↑</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">↓</kbd>
        移动 &nbsp;|&nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格</kbd>
        挥刀
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">有效切中 {{ fruitsCut }} 个水果，炸弹命中 {{ bombHits }} 次</div>
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
  throwFreq: { type: Number, default: 3 },
  bombRatio: { type: Number, default: 0.15 },
  comboWindow: { type: Number, default: 0.8 },
  throwRounds: { type: Number, default: 4 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const phase = ref('intro')
const introCountdown = ref(6)
const items = ref([])
const currentRound = ref(1)
const fruitsCut = ref(0)
const bombHits = ref(0)
const combo = ref(0)
const cursorX = ref(220)
const cursorY = ref(220)
const slashActive = ref(false)
const feedbackText = ref('')
const feedbackColor = ref('#fff')

const totalRounds = computed(() => Math.max(3, Math.min(6, Math.round(props.throwRounds))))

let introTimer = null
let rafId = null
let lastFrame = 0
let itemId = 0
let slashTimer = null
let roundTimer = null
let feedbackTimer = null
let spawnedRound = false
let moveX = 0
let moveY = 0
let lastCutAt = 0

const score = computed(() => {
  if (fruitsCut.value >= 12 && bombHits.value === 0) return 5
  if (fruitsCut.value >= 10) return 4
  if (fruitsCut.value >= 8) return 3
  if (fruitsCut.value >= 5) return 2
  if (fruitsCut.value >= 3) return 1
  return 0
})
const scoreTagType = computed(() => ['danger', '', 'warning', 'warning', 'success', 'success'][score.value])
const resultEmoji = computed(() => ['😢', '🥉', '🥈', '🥇', '🏆', '🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  items.value = []
  currentRound.value = 1
  fruitsCut.value = 0
  bombHits.value = 0
  combo.value = 0
  cursorX.value = 220
  cursorY.value = 220
  slashActive.value = false
  feedbackText.value = ''
  itemId = 0
  spawnedRound = false
  moveX = 0
  moveY = 0
  lastCutAt = 0

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
  lastFrame = performance.now()
  nextTick(() => gameArea.value?.focus())
  rafId = requestAnimationFrame(gameLoop)
}

function gameLoop(now) {
  if (phase.value !== 'playing') return
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now

  cursorX.value = clamp(cursorX.value + moveX * 240 * dt, 24, 416)
  cursorY.value = clamp(cursorY.value + moveY * 240 * dt, 36, 264)

  if (!spawnedRound) {
    spawnRound()
    spawnedRound = true
  }

  for (const item of items.value) {
    item.x += item.vx * dt
    item.y += item.vy * dt
    item.vy += 360 * dt
  }

  items.value = items.value.filter((item) => item.y < 340 && item.x > -40 && item.x < 460)

  if (spawnedRound && items.value.length === 0) {
    if (currentRound.value >= totalRounds.value || bombHits.value >= 2) {
      endGame()
      return
    }
    spawnedRound = false
    currentRound.value++
  }

  rafId = requestAnimationFrame(gameLoop)
}

function spawnRound() {
  const round = currentRound.value
  const burst = Math.max(3, Math.min(5, Math.round(props.throwFreq / 2) + round))
  const bombChance = clamp(props.bombRatio, 0.05, 0.45)
  for (let i = 0; i < burst; i++) {
    const isBomb = Math.random() < bombChance && i > 0
    items.value.push({
      id: itemId++,
      type: isBomb ? 'bomb' : 'fruit',
      emoji: isBomb ? '💣' : randomFruit(),
      x: 50 + Math.random() * 340,
      y: 300 + Math.random() * 20,
      vx: -110 + Math.random() * 220,
      vy: -(260 + Math.random() * 80 + round * 10),
      cut: false,
    })
  }
}

function onKeyDown(e) {
  if (phase.value !== 'playing') return
  if (e.key === 'ArrowLeft') moveX = -1
  if (e.key === 'ArrowRight') moveX = 1
  if (e.key === 'ArrowUp') moveY = -1
  if (e.key === 'ArrowDown') moveY = 1
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault()
    slash()
  }
}

function onKeyUp(e) {
  if (e.key === 'ArrowLeft' && moveX === -1) moveX = 0
  if (e.key === 'ArrowRight' && moveX === 1) moveX = 0
  if (e.key === 'ArrowUp' && moveY === -1) moveY = 0
  if (e.key === 'ArrowDown' && moveY === 1) moveY = 0
}

function slash() {
  if (slashActive.value || phase.value !== 'playing') return
  slashActive.value = true
  clearTimeout(slashTimer)
  slashTimer = setTimeout(() => { slashActive.value = false }, 120)

  let hitSomething = false
  const radius = 54
  const remaining = []
  for (const item of items.value) {
    const dx = item.x + 14 - cursorX.value
    const dy = item.y + 14 - cursorY.value
    if (Math.sqrt(dx * dx + dy * dy) <= radius) {
      hitSomething = true
      item.cut = true
      if (item.type === 'bomb') {
        bombHits.value++
        combo.value = 0
        flash('炸弹！', '#f56c6c')
      } else {
        const now = performance.now()
        if (lastCutAt && now - lastCutAt <= Math.max(300, props.comboWindow * 1000)) combo.value++
        else combo.value = 1
        lastCutAt = now
        fruitsCut.value++
        flash(combo.value >= 3 ? `连切 x${combo.value}` : '切中！', '#ffd166')
      }
      continue
    }
    remaining.push(item)
  }
  items.value = remaining
  if (!hitSomething) {
    combo.value = 0
    flash('挥空', '#d3d3d3')
  }
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

function flash(text, color) {
  feedbackText.value = text
  feedbackColor.value = color
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => { feedbackText.value = '' }, 700)
}

function randomFruit() {
  const fruits = ['🍎', '🍊', '🍉', '🍐', '🍋', '🥝']
  return fruits[Math.floor(Math.random() * fruits.length)]
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function clearLoop() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
}

function clearAll() {
  clearLoop()
  clearInterval(introTimer)
  clearTimeout(slashTimer)
  clearTimeout(roundTimer)
  clearTimeout(feedbackTimer)
}

function onClosed() {
  clearAll()
  emit('update:modelValue', false)
}

onBeforeUnmount(clearAll)
</script>
