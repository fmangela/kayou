<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '吉他' : phase === 'playing' ? '吉他 - 游戏中' : '游戏结束'"
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">吉他</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">先用左右键切和弦，再在拍点按上下扫弦。中间会插一小段即兴拨弦，做完 2 小节就结算。</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKeyDown">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span>拍点 {{ beatIndex + 1 }} / {{ totalBeats }}</span>
        <span>当前和弦 {{ currentChord.name }}</span>
        <span>命中 {{ hits }}</span>
      </div>

      <div style="position:relative;width:450px;height:300px;background:linear-gradient(180deg,#2d3142 0%,#4f5d75 55%,#bfc0c0 55%,#bfc0c0 100%);border-radius:12px;overflow:hidden;margin:0 auto">
        <div style="position:absolute;top:20px;left:18px;right:18px;padding:10px 12px;background:rgba(255,255,255,0.14);border-radius:10px;color:#fff">
          <div style="font-size:12px;opacity:0.78;margin-bottom:4px">下一小节和弦预览</div>
          <div style="display:flex;gap:8px">
            <div
              v-for="(beat, index) in beats"
              :key="index"
              :style="{
                flex:1,
                padding:'8px 0',
                borderRadius:'8px',
                background:index === beatIndex ? '#ffd166' : 'rgba(255,255,255,0.12)',
                color:index === beatIndex ? '#3d405b' : '#fff',
                textAlign:'center',
                fontWeight:'bold',
              }"
            >
              {{ beat.chord }} {{ beat.direction === 'up' ? '↑' : '↓' }}
            </div>
          </div>
        </div>

        <div style="position:absolute;left:40px;right:40px;top:136px;height:6px;background:rgba(255,255,255,0.2);border-radius:999px"></div>
        <div :style="{position:'absolute',left:(40 + beatProgress * 3.7)+'px',top:'126px',width:'14px',height:'26px',background:stage === 'fill' ? '#f28482' : '#ffd166',borderRadius:'999px',boxShadow:'0 0 10px rgba(255,255,255,0.35)'}"></div>

        <div style="position:absolute;left:36px;right:36px;bottom:34px;display:flex;justify-content:space-between">
          <div
            v-for="chord in CHORDS"
            :key="chord.key"
            :style="{
              width:'86px',
              padding:'16px 0',
              borderRadius:'12px',
              background:currentChord.key === chord.key ? '#409eff' : 'rgba(255,255,255,0.78)',
              color:currentChord.key === chord.key ? '#fff' : '#3d405b',
              textAlign:'center',
              fontWeight:'bold',
              transition:'all 0.08s linear',
            }"
          >
            {{ chord.name }}
          </div>
        </div>

        <div v-if="stage === 'fill'" style="position:absolute;top:176px;left:50%;transform:translateX(-50%);display:flex;gap:10px">
          <div
            v-for="(dir, index) in fillSequence"
            :key="index"
            :style="{
              width:'44px',
              height:'44px',
              borderRadius:'50%',
              background:index === fillIndex ? '#f28482' : 'rgba(255,255,255,0.24)',
              color:'#fff',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              fontSize:'22px',
              fontWeight:'bold',
            }"
          >
            {{ dir === 'up' ? '↑' : '↓' }}
          </div>
        </div>

        <div v-if="feedbackText" :style="{position:'absolute',top:'94px',left:'50%',transform:'translateX(-50%)',fontSize:'22px',fontWeight:'bold',color:feedbackColor,textShadow:'0 2px 8px #000'}">
          {{ feedbackText }}
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd>
        切和弦
        &nbsp;|&nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">↑</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">↓</kbd>
        扫弦
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">命中率 {{ accuracy.toFixed(0) }}%，即兴段完成 {{ fillCompleted ? '成功' : '一般' }}</div>
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
  chordPreviewTime: { type: Number, default: 1.2 },
  strumDensity: { type: Number, default: 4 },
  fillLength: { type: Number, default: 3 },
  sectionLength: { type: Number, default: 2 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const CHORDS = [
  { key: 'C', name: 'C' },
  { key: 'G', name: 'G' },
  { key: 'Am', name: 'Am' },
  { key: 'F', name: 'F' },
]

const phase = ref('intro')
const introCountdown = ref(6)
const currentChordIndex = ref(0)
const beatIndex = ref(0)
const beatProgress = ref(0)
const hits = ref(0)
const misses = ref(0)
const stage = ref('beats')
const beats = ref([])
const fillSequence = ref([])
const fillIndex = ref(0)
const fillCompleted = ref(false)
const feedbackText = ref('')
const feedbackColor = ref('#fff')

let introTimer = null
let rafId = null
let lastFrame = 0
let beatTimer = 0
let fillTimer = 0
let feedbackTimer = null
let actedInBeat = false

const totalBeats = computed(() => Math.max(8, Math.round(props.sectionLength) * 4))
const currentChord = computed(() => CHORDS[currentChordIndex.value])
const accuracy = computed(() => {
  const total = totalBeats.value + fillSequence.value.length
  return total ? (hits.value / total) * 100 : 0
})

const score = computed(() => {
  if (accuracy.value >= 96) return 5
  if (accuracy.value >= 88) return 4
  if (accuracy.value >= 75) return 3
  if (accuracy.value >= 55) return 2
  if (hits.value >= Math.ceil(totalBeats.value / 2)) return 1
  return 0
})
const scoreTagType = computed(() => ['danger', '', 'warning', 'warning', 'success', 'success'][score.value])
const resultEmoji = computed(() => ['😢', '🥉', '🥈', '🥇', '🏆', '🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  currentChordIndex.value = 0
  beatIndex.value = 0
  beatProgress.value = 0
  hits.value = 0
  misses.value = 0
  stage.value = 'beats'
  beats.value = buildBeatMap()
  fillSequence.value = buildFill()
  fillIndex.value = 0
  fillCompleted.value = false
  feedbackText.value = ''
  actedInBeat = false

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

function buildBeatMap() {
  const map = []
  for (let i = 0; i < totalBeats.value; i++) {
    map.push({
      chord: CHORDS[Math.floor(Math.random() * CHORDS.length)].key,
      direction: Math.random() < 0.5 ? 'up' : 'down',
    })
  }
  return map
}

function buildFill() {
  const len = Math.max(2, Math.min(4, Math.round(props.fillLength)))
  return Array.from({ length: len }, () => (Math.random() < 0.5 ? 'up' : 'down'))
}

function beginPlaying() {
  phase.value = 'playing'
  lastFrame = performance.now()
  beatTimer = 0
  nextTick(() => gameArea.value?.focus())
  rafId = requestAnimationFrame(gameLoop)
}

function gameLoop(now) {
  if (phase.value !== 'playing') return
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now

  if (stage.value === 'beats') {
    const beatDuration = Math.max(0.5, 1.4 - props.strumDensity * 0.12)
    beatTimer += dt
    beatProgress.value = Math.min(100, (beatTimer / beatDuration) * 100)
    if (beatTimer >= beatDuration) {
      if (!actedInBeat) misses.value++
      actedInBeat = false
      beatTimer = 0
      beatIndex.value++
      if (beatIndex.value === 4) stage.value = 'fill'
      if (beatIndex.value >= totalBeats.value) {
        endGame()
        return
      }
    }
  } else {
    const stepDuration = Math.max(0.35, props.chordPreviewTime * 0.55)
    fillTimer += dt
    beatProgress.value = Math.min(100, (fillTimer / stepDuration) * 100)
    if (fillTimer >= stepDuration) {
      misses.value++
      fillTimer = 0
      fillIndex.value++
      if (fillIndex.value >= fillSequence.value.length) {
        stage.value = 'beats'
      }
    }
  }

  rafId = requestAnimationFrame(gameLoop)
}

function onKeyDown(e) {
  if (phase.value !== 'playing') return

  if (e.key === 'ArrowLeft') {
    currentChordIndex.value = (currentChordIndex.value + CHORDS.length - 1) % CHORDS.length
    return
  }
  if (e.key === 'ArrowRight') {
    currentChordIndex.value = (currentChordIndex.value + 1) % CHORDS.length
    return
  }

  if (stage.value === 'fill') {
    const dir = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : ''
    if (!dir) return
    if (dir === fillSequence.value[fillIndex.value]) {
      hits.value++
      fillIndex.value++
      fillTimer = 0
      flash('即兴命中！', '#f28482')
      if (fillIndex.value >= fillSequence.value.length) {
        fillCompleted.value = true
        stage.value = 'beats'
      }
    } else {
      misses.value++
      fillIndex.value++
      fillTimer = 0
      flash('即兴失误', '#f56c6c')
      if (fillIndex.value >= fillSequence.value.length) stage.value = 'beats'
    }
    return
  }

  const currentBeat = beats.value[beatIndex.value]
  if (!currentBeat || actedInBeat) return
  const dir = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : ''
  if (!dir) return
  actedInBeat = true
  const chordCorrect = currentChord.value.key === currentBeat.chord
  const dirCorrect = dir === currentBeat.direction
  if (chordCorrect && dirCorrect) {
    hits.value++
    flash('扫弦到位！', '#67c23a')
  } else {
    misses.value++
    flash('和弦或方向不对', '#f56c6c')
  }
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
