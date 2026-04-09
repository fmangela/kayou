<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '赛车' : phase === 'playing' ? '赛车 - 游戏中' : '游戏结束'"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">赛车</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">只跑 3 个关键弯。弯里按对应方向稳住车身，出弯瞬间按空格吃到漂移加速！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKeyDown" @keyup="onKeyUp">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span>弯道 {{ clearedCurves }} / {{ totalCurves }}</span>
        <span>碰撞 {{ collisions }} / {{ collisionTolerance }}</span>
        <span>漂移加速 {{ boostCount }}</span>
      </div>

      <div style="position:relative;width:440px;height:280px;background:#31572c;border-radius:12px;overflow:hidden;margin:0 auto">
        <div style="position:absolute;left:72px;right:72px;top:0;bottom:0;background:#4f4f4f"></div>
        <div style="position:absolute;left:144px;right:144px;top:0;bottom:0;background:#3b3b3b"></div>
        <div style="position:absolute;left:214px;top:0;bottom:0;width:4px;background:repeating-linear-gradient(180deg,#f4f1de 0,#f4f1de 16px,transparent 16px,transparent 28px)"></div>

        <div
          v-for="(curve, index) in curves"
          :key="index"
          :style="{
            position:'absolute',
            left:'72px',
            right:'72px',
            top:(32 + index * 74)+'px',
            height:'54px',
            border:index === currentCurve ? '3px solid #ffd166' : '2px dashed rgba(255,255,255,0.15)',
            borderRadius:'10px',
            opacity:index < clearedCurves ? 0.35 : 1,
          }"
        >
          <div :style="{position:'absolute',right:'12px',top:'12px',fontSize:'24px',color:'#fff'}">{{ curve.dir === 'left' ? '↖' : '↗' }}</div>
        </div>

        <div
          :style="{
            position:'absolute',
            left:(carLaneX - 16)+'px',
            top:(currentCurve * 74 + 54)+'px',
            fontSize:'30px',
            transform:`rotate(${carRotation}deg)`,
            transition:'left 0.05s linear, transform 0.05s linear',
          }"
        >
          🚗
        </div>

        <div style="position:absolute;left:16px;right:16px;bottom:14px;height:10px;background:rgba(255,255,255,0.26);border-radius:999px;overflow:hidden">
          <div :style="{width: curveProgress + '%',height:'100%',background: stage === 'boost' ? '#ffd166' : '#67c23a',transition:'width 0.05s linear'}"></div>
        </div>

        <div v-if="feedbackText" :style="{position:'absolute',top:'18px',left:'50%',transform:'translateX(-50%)',fontSize:'22px',fontWeight:'bold',color:feedbackColor,textShadow:'0 2px 8px #000'}">
          {{ feedbackText }}
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd>
        过弯
        &nbsp;|&nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格</kbd>
        出弯加速
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">通过弯道 {{ clearedCurves }} 个，碰撞 {{ collisions }} 次，漂移加速 {{ boostCount }} 次</div>
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
  curveCount: { type: Number, default: 3 },
  grip: { type: Number, default: 1 },
  driftWindow: { type: Number, default: 0.35 },
  collisionTolerance: { type: Number, default: 2 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const LANE_X = [146, 220, 294]

const phase = ref('intro')
const introCountdown = ref(6)
const clearedCurves = ref(0)
const currentCurve = ref(0)
const collisions = ref(0)
const boostCount = ref(0)
const carLane = ref(1)
const carRotation = ref(0)
const curveProgress = ref(0)
const feedbackText = ref('')
const feedbackColor = ref('#fff')
const stage = ref('curve')
const curves = ref([])

let introTimer = null
let rafId = null
let lastFrame = 0
let stageTimer = 0
let steerHeld = ''
let feedbackTimer = null

const totalCurves = computed(() => Math.max(3, Math.min(4, Math.round(props.curveCount))))
const collisionTolerance = computed(() => Math.max(1, Math.round(props.collisionTolerance)))
const carLaneX = computed(() => LANE_X[carLane.value])

const score = computed(() => {
  if (clearedCurves.value >= totalCurves.value && collisions.value === 0) return 5
  if (clearedCurves.value >= totalCurves.value && collisions.value <= 1) return 4
  if (clearedCurves.value >= totalCurves.value) return 3
  if (clearedCurves.value >= 2) return 2
  if (clearedCurves.value >= 1) return 1
  return 0
})
const scoreTagType = computed(() => ['danger', '', 'warning', 'warning', 'success', 'success'][score.value])
const resultEmoji = computed(() => ['😢', '🥉', '🥈', '🥇', '🏆', '🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  clearedCurves.value = 0
  currentCurve.value = 0
  collisions.value = 0
  boostCount.value = 0
  carLane.value = 1
  carRotation.value = 0
  curveProgress.value = 0
  feedbackText.value = ''
  stage.value = 'curve'
  curves.value = Array.from({ length: totalCurves.value }, () => ({ dir: Math.random() < 0.5 ? 'left' : 'right' }))
  steerHeld = ''
  stageTimer = 1.25

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

  stageTimer -= dt
  const duration = stage.value === 'curve' ? 1.25 : Math.max(0.3, props.driftWindow)
  curveProgress.value = ((duration - Math.max(0, stageTimer)) / duration) * 100

  const dir = curves.value[currentCurve.value]?.dir
  if (stage.value === 'curve') {
    const turnValue = dir === 'left' ? -18 : 18
    carRotation.value = steerHeld === dir ? turnValue * clamp(props.grip, 0.6, 1.4) : turnValue * 0.35
    carLane.value = dir === 'left' ? (steerHeld === dir ? 0 : 1) : (steerHeld === dir ? 2 : 1)
  }

  if (stageTimer <= 0) {
    if (stage.value === 'curve') {
      if (steerHeld !== dir) {
        collisions.value++
        flash('擦到护栏！', '#f56c6c')
        if (collisions.value > collisionTolerance.value) {
          endGame()
          return
        }
      } else {
        flash('顺利过弯！', '#67c23a')
      }
      stage.value = 'boost'
      stageTimer = Math.max(0.3, props.driftWindow)
      carLane.value = 1
      carRotation.value = 0
    } else {
      clearedCurves.value++
      currentCurve.value++
      if (clearedCurves.value >= totalCurves.value) {
        endGame()
        return
      }
      stage.value = 'curve'
      stageTimer = 1.25
    }
  }

  rafId = requestAnimationFrame(gameLoop)
}

function onKeyDown(e) {
  if (phase.value !== 'playing') return
  if (e.key === 'ArrowLeft') steerHeld = 'left'
  if (e.key === 'ArrowRight') steerHeld = 'right'
  if ((e.key === ' ' || e.code === 'Space') && stage.value === 'boost') {
    e.preventDefault()
    boostCount.value++
    flash('漂移加速！', '#ffd166')
    stageTimer = 0.01
  }
}

function onKeyUp(e) {
  if (e.key === 'ArrowLeft' && steerHeld === 'left') steerHeld = ''
  if (e.key === 'ArrowRight' && steerHeld === 'right') steerHeld = ''
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
