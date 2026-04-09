<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '钢琴块' : phase === 'playing' ? '钢琴块 - 游戏中' : '游戏结束'"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">钢琴块</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">黑块落到判定线时按对应按键，少量长按与双押会混进谱面！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKeyDown" @keyup="onKeyUp">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span>命中：{{ hitCount }} / {{ totalTiles }}</span>
        <span>漏按：{{ missCount }} / 5</span>
        <span>连击：{{ combo }}</span>
      </div>

      <div style="position:relative;width:440px;height:320px;background:#111;border-radius:12px;overflow:hidden;margin:0 auto">
        <div v-for="i in 3" :key="i" :style="{position:'absolute',top:0,left:(i*110+109)+'px',width:'2px',height:'100%',background:'rgba(255,255,255,0.08)'}"></div>

        <div v-for="(lane, laneIndex) in LANES" :key="lane.key" :style="{position:'absolute',left:(laneIndex*110)+'px',bottom:'0',width:'110px',height:'64px',background:keysHeld.has(lane.key)?'rgba(103,194,58,0.18)':'rgba(255,255,255,0.03)',transition:'background 0.05s'}"></div>
        <div style="position:absolute;left:0;right:0;bottom:64px;height:4px;background:#67c23a;box-shadow:0 0 10px rgba(103,194,58,0.6)"></div>

        <div
          v-for="note in activeNotes"
          :key="note.id"
          :style="{
            position: 'absolute',
            left: (note.lane * 110 + 18) + 'px',
            top: note.y + 'px',
            width: '74px',
            height: (note.hold ? 68 : 32) + 'px',
            background: note.hold ? 'linear-gradient(180deg,#222 0%,#000 100%)' : '#000',
            borderRadius: '8px',
            border: note.hold ? '2px solid #ffd166' : '2px solid #2f2f2f',
            boxShadow: note.hold ? '0 0 10px rgba(255,209,102,0.35)' : '0 0 10px rgba(255,255,255,0.08)',
          }"
        >
          <div v-if="note.hold" style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);font-size:10px;color:#ffd166">长按</div>
        </div>

        <div
          v-if="holdingLane >= 0"
          :style="{
            position: 'absolute',
            left: (holdingLane * 110 + 18) + 'px',
            bottom: '68px',
            width: '74px',
            height: '12px',
            background: 'rgba(255,209,102,0.18)',
            borderRadius: '999px',
            overflow: 'hidden',
          }"
        >
          <div :style="{ width: holdProgress + '%', height:'100%', background:'#ffd166' }"></div>
        </div>

        <div v-if="feedbackText" :style="{position:'absolute',top:'22px',left:'50%',transform:'translateX(-50%)',fontSize:'20px',fontWeight:'bold',color:feedbackColor,textShadow:'0 2px 8px #000'}">
          {{ feedbackText }}
        </div>

        <div style="position:absolute;left:0;right:0;bottom:18px;display:flex;justify-content:space-around;color:#ddd;font-size:13px">
          <span v-for="lane in LANES" :key="lane.label">{{ lane.label }}</span>
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 5px;border-radius:4px;border:1px solid #ccc">D</kbd>
        <kbd style="background:#f0f0f0;padding:2px 5px;border-radius:4px;border:1px solid #ccc">F</kbd>
        <kbd style="background:#f0f0f0;padding:2px 5px;border-radius:4px;border:1px solid #ccc">J</kbd>
        <kbd style="background:#f0f0f0;padding:2px 5px;border-radius:4px;border:1px solid #ccc">K</kbd>
        对应四轨
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">命中率 {{ accuracy.toFixed(0) }}% ｜ 漏按 {{ missCount }} 次</div>
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
  doubleTapProb: { type: Number, default: 0.1 },
  holdRatio: { type: Number, default: 0.2 },
  patternLength: { type: Number, default: 16 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const LANES = [
  { key: 'd', label: 'D' },
  { key: 'f', label: 'F' },
  { key: 'j', label: 'J' },
  { key: 'k', label: 'K' },
]
const HIT_Y = 224
const HIT_WINDOW = 28

const phase = ref('intro')
const introCountdown = ref(6)
const activeNotes = ref([])
const keysHeld = ref(new Set())
const hitCount = ref(0)
const missCount = ref(0)
const combo = ref(0)
const totalTiles = ref(0)
const holdingLane = ref(-1)
const holdProgress = ref(0)
const feedbackText = ref('')
const feedbackColor = ref('#fff')

let introTimer = null
let rafId = null
let feedbackTimer = null
let lastFrame = 0
let chartStart = 0
let chartIndex = 0
let noteId = 0
let chart = []
let holdState = null

const accuracy = computed(() => totalTiles.value ? (hitCount.value / totalTiles.value) * 100 : 0)
const score = computed(() => {
  if (accuracy.value >= 96) return 5
  if (accuracy.value >= 88) return 4
  if (accuracy.value >= 75) return 3
  if (accuracy.value >= 60) return 2
  if (accuracy.value >= 40) return 1
  return 0
})
const scoreTagType = computed(() => ['danger', '', 'warning', 'warning', 'success', 'success'][score.value])
const resultEmoji = computed(() => ['😢', '🥉', '🥈', '🥇', '🏆', '🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  activeNotes.value = []
  keysHeld.value = new Set()
  hitCount.value = 0
  missCount.value = 0
  combo.value = 0
  holdingLane.value = -1
  holdProgress.value = 0
  feedbackText.value = ''
  holdState = null
  noteId = 0
  chartIndex = 0
  chart = buildChart()
  totalTiles.value = chart.reduce((sum, item) => sum + item.lanes.length, 0)

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
  chartStart = lastFrame
  nextTick(() => gameArea.value?.focus())
  rafId = requestAnimationFrame(gameLoop)
}

function buildChart() {
  const length = Math.max(12, Math.min(24, Math.round(props.patternLength)))
  const result = []
  let time = 0.8
  for (let i = 0; i < length; i++) {
    const lanes = [Math.floor(Math.random() * 4)]
    if (Math.random() < props.doubleTapProb) {
      let lane = Math.floor(Math.random() * 4)
      while (lanes.includes(lane)) lane = Math.floor(Math.random() * 4)
      lanes.push(lane)
    }
    result.push({
      time,
      lanes,
      hold: Math.random() < props.holdRatio,
      holdMs: 550 + Math.random() * 250,
    })
    time += 0.42 + Math.random() * 0.12
  }
  return result
}

function gameLoop(now) {
  if (phase.value !== 'playing') return
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now
  const elapsed = (now - chartStart) / 1000
  const speed = 120 + Math.max(1, props.dropSpeed) * 28
  const travelTime = (HIT_Y + 40) / speed

  while (chartIndex < chart.length && chart[chartIndex].time <= elapsed + travelTime) {
    const event = chart[chartIndex]
    for (const lane of event.lanes) {
      activeNotes.value.push({
        id: noteId++,
        lane,
        y: -80,
        hold: event.hold,
        holdMs: event.hold ? event.holdMs : 0,
      })
    }
    chartIndex++
  }

  for (const note of activeNotes.value) {
    note.y += speed * dt
  }

  if (holdState) {
    if (!keysHeld.value.has(LANES[holdState.lane].key)) {
      failHold()
    } else {
      const progress = ((now - holdState.startedAt) / holdState.duration) * 100
      holdProgress.value = Math.min(100, progress)
      if (progress >= 100) finishHold()
    }
  }

  const survivors = []
  for (const note of activeNotes.value) {
    if (note.y > HIT_Y + HIT_WINDOW) {
      registerMiss('漏按')
      continue
    }
    survivors.push(note)
  }
  activeNotes.value = survivors

  if (missCount.value >= 5) {
    endGame()
    return
  }

  if (chartIndex >= chart.length && activeNotes.value.length === 0 && !holdState) {
    endGame()
    return
  }

  rafId = requestAnimationFrame(gameLoop)
}

function onKeyDown(e) {
  if (phase.value !== 'playing') return
  const key = e.key.toLowerCase()
  if (!LANES.some((lane) => lane.key === key)) return
  if (keysHeld.value.has(key)) return
  keysHeld.value = new Set([...keysHeld.value, key])
  tryHit(key)
}

function onKeyUp(e) {
  const key = e.key.toLowerCase()
  if (keysHeld.value.has(key)) {
    const next = new Set(keysHeld.value)
    next.delete(key)
    keysHeld.value = next
  }
}

function tryHit(key) {
  const laneIndex = LANES.findIndex((lane) => lane.key === key)
  const candidates = activeNotes.value
    .filter((note) => note.lane === laneIndex)
    .sort((a, b) => Math.abs(a.y - HIT_Y) - Math.abs(b.y - HIT_Y))
  const note = candidates.find((entry) => Math.abs(entry.y - HIT_Y) <= HIT_WINDOW)
  if (!note) {
    registerMiss('空按')
    return
  }

  activeNotes.value = activeNotes.value.filter((entry) => entry.id !== note.id)
  if (note.hold) {
    holdState = {
      lane: laneIndex,
      startedAt: performance.now(),
      duration: note.holdMs,
    }
    holdingLane.value = laneIndex
    holdProgress.value = 0
    flash('按住！', '#ffd166')
    return
  }

  registerHit('命中', '#67c23a')
}

function finishHold() {
  holdState = null
  holdingLane.value = -1
  holdProgress.value = 0
  registerHit('长按成功', '#ffd166')
}

function failHold() {
  holdState = null
  holdingLane.value = -1
  holdProgress.value = 0
  registerMiss('长按断了')
}

function registerHit(text, color) {
  hitCount.value++
  combo.value++
  flash(text, color)
}

function registerMiss(text) {
  missCount.value++
  combo.value = 0
  flash(text, '#f56c6c')
}

function flash(text, color) {
  feedbackText.value = text
  feedbackColor.value = color
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => { feedbackText.value = '' }, 650)
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
