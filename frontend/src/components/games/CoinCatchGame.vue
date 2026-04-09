<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '接金币' : phase === 'playing' ? '接金币 - 游戏中' : '游戏结束'"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">接金币</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">左右移动接住金币和宝箱，躲开炸弹与假宝箱，12 次掉落后立即结算！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKeyDown" @keyup="onKeyUp">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span>金币值：{{ goldValue }}</span>
        <span>连击：{{ combo }}</span>
        <span>剩余掉落：{{ Math.max(0, totalDrops - processedDrops) }}</span>
      </div>

      <div style="position:relative;width:440px;height:300px;background:linear-gradient(180deg,#102542 0%,#234567 60%,#2d6a4f 100%);border-radius:12px;overflow:hidden;margin:0 auto">
        <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0,transparent 36px,rgba(255,255,255,0.04) 36px,rgba(255,255,255,0.04) 38px)"></div>
        <div style="position:absolute;left:0;right:0;bottom:0;height:56px;background:rgba(0,0,0,0.22)"></div>

        <div
          v-for="item in items"
          :key="item.id"
          :style="{
            position: 'absolute',
            left: item.x + 'px',
            top: item.y + 'px',
            fontSize: '28px',
            filter: item.type === 'combo' ? 'drop-shadow(0 0 8px #ffd166)' : 'none',
          }"
        >
          {{ item.emoji }}
        </div>

        <div
          :style="{
            position: 'absolute',
            left: catcherX + 'px',
            bottom: '14px',
            width: catcherWidth + 'px',
            textAlign: 'center',
            transition: 'left 0.04s linear',
          }"
        >
          <div style="font-size:34px;line-height:1">🧺</div>
        </div>

        <div v-if="feedbackText" :style="{ position:'absolute', top:'18px', left:'50%', transform:'translateX(-50%)', fontSize:'20px', fontWeight:'bold', color:feedbackColor, textShadow:'0 2px 8px #000' }">
          {{ feedbackText }}
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd>
        移动接物
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">
        金币值 {{ goldValue }} ｜ 接住 {{ caughtCount }} 次 ｜ 踩雷 {{ trapHits }} 次
      </div>
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
  dropSpeed: { type: Number, default: 4 },
  trapRatio: { type: Number, default: 0.2 },
  moveInertia: { type: Number, default: 0.15 },
  dropCount: { type: Number, default: 12 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const phase = ref('intro')
const introCountdown = ref(6)
const catcherX = ref(190)
const items = ref([])
const combo = ref(0)
const goldValue = ref(0)
const caughtCount = ref(0)
const trapHits = ref(0)
const processedDrops = ref(0)
const feedbackText = ref('')
const feedbackColor = ref('#fff')

const totalDrops = computed(() => Math.max(8, Math.min(18, Math.round(props.dropCount))))
const catcherWidth = 62

let introTimer = null
let rafId = null
let spawnTimer = 0
let lastFrame = 0
let itemId = 0
let feedbackTimer = null
let direction = 0
let velocity = 0

const score = computed(() => {
  const total = goldValue.value
  if (total >= 18) return 5
  if (total >= 14) return 4
  if (total >= 10) return 3
  if (total >= 6) return 2
  if (total >= 3) return 1
  return 0
})
const scoreTagType = computed(() => ['danger', '', 'warning', 'warning', 'success', 'success'][score.value])
const resultEmoji = computed(() => ['😢', '🥉', '🥈', '🥇', '🏆', '🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  catcherX.value = 190
  items.value = []
  combo.value = 0
  goldValue.value = 0
  caughtCount.value = 0
  trapHits.value = 0
  processedDrops.value = 0
  feedbackText.value = ''
  direction = 0
  velocity = 0
  spawnTimer = 0
  itemId = 0

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

  const inertia = Math.max(0.06, Math.min(0.4, props.moveInertia))
  const targetVelocity = direction * 320
  velocity += (targetVelocity - velocity) * Math.min(1, dt / (inertia * 2.8))
  catcherX.value = clamp(catcherX.value + velocity * dt, 10, 440 - catcherWidth - 10)

  spawnTimer += dt
  const spawnInterval = Math.max(0.45, 1.2 / Math.max(1, props.dropSpeed))
  if (processedDrops.value + items.value.length < totalDrops.value && spawnTimer >= spawnInterval) {
    spawnTimer = 0
    spawnItem()
  }

  const fallSpeed = 90 + Math.max(1, props.dropSpeed) * 38
  for (const item of items.value) {
    item.y += fallSpeed * dt
  }

  const remaining = []
  for (const item of items.value) {
    const caught = item.y >= 236 && item.y <= 276 && item.x + 20 >= catcherX.value && item.x <= catcherX.value + catcherWidth
    if (caught) {
      resolveCatch(item)
      continue
    }
    if (item.y > 300) {
      processedDrops.value++
      if (item.type === 'combo') combo.value = 0
      continue
    }
    remaining.push(item)
  }
  items.value = remaining

  if (processedDrops.value >= totalDrops.value && items.value.length === 0) {
    endGame()
    return
  }

  rafId = requestAnimationFrame(gameLoop)
}

function spawnItem() {
  const trapChance = clamp(props.trapRatio, 0.05, 0.55)
  const roll = Math.random()
  let type = 'coin'
  if (roll < trapChance * 0.45) type = 'bomb'
  else if (roll < trapChance) type = 'fake_chest'
  else if (roll < trapChance + 0.18) type = 'chest'
  else if (roll < trapChance + 0.38) type = 'combo'

  const meta = {
    coin: { emoji: '🪙', value: 1 },
    combo: { emoji: '✨', value: 2 },
    chest: { emoji: '🎁', value: 3 },
    fake_chest: { emoji: '📦', value: -1 },
    bomb: { emoji: '💣', value: -2 },
  }[type]

  items.value.push({
    id: itemId++,
    type,
    emoji: meta.emoji,
    value: meta.value,
    x: 18 + Math.random() * 386,
    y: -12,
  })
}

function resolveCatch(item) {
  processedDrops.value++
  caughtCount.value++
  if (item.type === 'coin') {
    combo.value = 0
    goldValue.value += 1
    flash('接到金币 +1', '#ffd166')
  } else if (item.type === 'combo') {
    combo.value += 1
    goldValue.value += 1 + combo.value
    flash(`连击 +${1 + combo.value}`, '#ffe66d')
  } else if (item.type === 'chest') {
    combo.value = 0
    goldValue.value += 3
    flash('宝箱奖励 +3', '#67c23a')
  } else if (item.type === 'fake_chest') {
    combo.value = 0
    trapHits.value++
    goldValue.value = Math.max(0, goldValue.value - 1)
    flash('假宝箱！ -1', '#f56c6c')
  } else {
    combo.value = 0
    trapHits.value++
    flash('炸弹！连击清空', '#f56c6c')
  }
}

function endGame() {
  clearLoop()
  phase.value = 'result'
  emit('score', score.value)
}

function flash(text, color) {
  feedbackText.value = text
  feedbackColor.value = color
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => { feedbackText.value = '' }, 700)
}

function onKeyDown(e) {
  if (phase.value !== 'playing') return
  if (e.key === 'ArrowLeft') direction = -1
  if (e.key === 'ArrowRight') direction = 1
}

function onKeyUp(e) {
  if (e.key === 'ArrowLeft' && direction === -1) direction = 0
  if (e.key === 'ArrowRight' && direction === 1) direction = 0
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

onBeforeUnmount(clearAll)
</script>
