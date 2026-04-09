<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '体操' : phase === 'playing' ? '体操 - 游戏中' : '游戏结束'"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <!-- Intro phase -->
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">体操</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">节拍指针扫过绿区时，按正确方向键完成动作！最后按空格保持平衡落地。</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <!-- Playing phase -->
    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKey">
      <!-- Score display -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span>动作 {{ currentActionIdx + 1 }} / {{ sequence.length }}</span>
        <span>得分：{{ actionPoints }}pt</span>
        <span v-if="!landingPhase">{{ currentAction?.label }}</span>
        <span v-else style="color:#e6a23c;font-weight:bold">落地平衡！</span>
      </div>

      <!-- Action sequence display -->
      <div style="display:flex;gap:6px;justify-content:center;margin-bottom:12px;flex-wrap:wrap">
        <div
          v-for="(a, i) in sequence"
          :key="i"
          :style="{
            padding:'4px 8px',
            borderRadius:'6px',
            fontSize:'13px',
            background: i < currentActionIdx ? '#f0f9eb' : i === currentActionIdx ? '#409eff' : '#f5f5f5',
            color: i < currentActionIdx ? '#67c23a' : i === currentActionIdx ? '#fff' : '#999',
            border: i === currentActionIdx ? '2px solid #409eff' : '2px solid transparent',
          }"
        >{{ a.label }}</div>
      </div>

      <!-- Rhythm zone -->
      <div v-if="!landingPhase" style="position:relative;width:420px;height:120px;background:#1a1a2e;border-radius:12px;overflow:hidden;margin:0 auto">
        <!-- Green zone -->
        <div :style="{
          position:'absolute',
          top:0,
          left: (200 - greenHalfWidth) + 'px',
          width: greenHalfWidth * 2 + 'px',
          height:'100%',
          background:'rgba(103,194,58,0.25)',
          borderLeft:'2px solid #67c23a',
          borderRight:'2px solid #67c23a',
        }"></div>
        <!-- Center line -->
        <div style="position:absolute;top:0;left:209px;width:2px;height:100%;background:rgba(255,255,255,0.15)"></div>
        <!-- Beat pointer -->
        <div :style="{
          position:'absolute',
          top:0,
          left: pointerX + 'px',
          width:'3px',
          height:'100%',
          background: pointerInGreen ? '#67c23a' : '#e6a23c',
          boxShadow: pointerInGreen ? '0 0 8px #67c23a' : 'none',
          transition:'background 0.05s',
        }"></div>
        <!-- Action icon -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:40px;opacity:0.15;pointer-events:none">
          {{ currentAction?.emoji }}
        </div>
        <!-- Feedback flash -->
        <div v-if="feedbackText" :style="{
          position:'absolute',top:'50%',left:'50%',
          transform:'translate(-50%,-50%)',
          fontSize:'22px',fontWeight:'bold',
          color: feedbackColor,
          textShadow:'0 2px 8px #000',
          pointerEvents:'none',
        }">{{ feedbackText }}</div>
        <!-- Key hint -->
        <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);font-size:12px;color:#aaa">
          按 {{ currentAction?.keyLabel }} 完成动作
        </div>
      </div>

      <!-- Landing balance phase -->
      <div v-else style="position:relative;width:420px;height:120px;background:#1a1a2e;border-radius:12px;overflow:hidden;margin:0 auto">
        <!-- Balance bar track -->
        <div style="position:absolute;top:50%;left:20px;right:20px;height:12px;transform:translateY(-50%);background:#333;border-radius:6px">
          <!-- Center zone -->
          <div style="position:absolute;left:calc(50% - 20px);width:40px;height:100%;background:rgba(103,194,58,0.4);border-radius:6px"></div>
          <!-- Balance indicator -->
          <div :style="{
            position:'absolute',
            top:'-4px',
            left: balanceX + '%',
            width:'20px',
            height:'20px',
            background: Math.abs(balanceX - 50) < 10 ? '#67c23a' : '#e6a23c',
            borderRadius:'50%',
            transform:'translateX(-50%)',
            transition:'left 0.05s',
          }"></div>
        </div>
        <div style="position:absolute;top:20px;left:50%;transform:translateX(-50%);font-size:32px">🤸</div>
        <div v-if="feedbackText" :style="{
          position:'absolute',bottom:'12px',left:'50%',
          transform:'translateX(-50%)',
          fontSize:'18px',fontWeight:'bold',
          color: feedbackColor,
        }">{{ feedbackText }}</div>
        <div v-else style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);font-size:12px;color:#aaa">
          指针居中时按 空格 落地！
        </div>
      </div>

      <!-- Result log -->
      <div style="display:flex;gap:4px;justify-content:center;margin-top:10px;flex-wrap:wrap">
        <el-tag
          v-for="(r, i) in actionResults"
          :key="i"
          :type="r === 'perfect' ? 'success' : r === 'ok' ? 'warning' : 'danger'"
          size="small"
        >{{ r === 'perfect' ? '完美' : r === 'ok' ? '一般' : '失误' }}</el-tag>
      </div>
    </div>

    <!-- Result phase -->
    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">{{ resultDesc }}</div>
      <el-tag :type="scoreTagType" size="large" style="font-size:18px;padding:8px 24px">
        得分：{{ score }} / 5
      </el-tag>
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
  sequenceLength: { type: Number, default: 4 },
  beatSpeed: { type: Number, default: 1 },
  balanceSpeed: { type: Number, default: 1 },
  judgeWindow: { type: Number, default: 0.3 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const ACTIONS = [
  { label: '跳跃(↑)', emoji: '⬆️', key: 'ArrowUp', keyLabel: '↑' },
  { label: '转体(←)', emoji: '⬅️', key: 'ArrowLeft', keyLabel: '←' },
  { label: '屈体(→)', emoji: '➡️', key: 'ArrowRight', keyLabel: '→' },
  { label: '落地(↓)', emoji: '⬇️', key: 'ArrowDown', keyLabel: '↓' },
]

const phase = ref('intro')
const introCountdown = ref(6)
const sequence = ref([])
const currentActionIdx = ref(0)
const actionResults = ref([])
const actionPoints = ref(0)
const landingPhase = ref(false)
const landingResult = ref(null)
const pointerX = ref(0)
const balanceX = ref(50)
const feedbackText = ref('')
const feedbackColor = ref('#fff')

const greenHalfWidth = computed(() => props.judgeWindow * 100)
const pointerInGreen = computed(() => Math.abs(pointerX.value - 200) < greenHalfWidth.value)
const currentAction = computed(() => sequence.value[currentActionIdx.value] || null)

let introTimer = null
let rafId = null
let rafStart = 0
let feedbackTimer = null
let actionHandled = false

const score = computed(() => {
  const len = sequence.value.length
  if (!len) return 0
  const perfects = actionResults.value.filter(r => r === 'perfect').length
  const oks = actionResults.value.filter(r => r === 'ok').length
  const correct = perfects + oks
  const allCorrect = correct === len
  if (allCorrect && landingResult.value === 'perfect') return 5
  if (allCorrect && landingResult.value) return 4
  const rate = correct / len
  if (rate >= 0.75) return 3
  if (rate >= 0.5) return 2
  if (rate >= 0.25) return 1
  return 0
})
const scoreTagType = computed(() => ['danger','','warning','warning','success','success'][score.value])
const resultEmoji = computed(() => ['😢','🥉','🥈','🥇','🏆','🏆'][score.value])
const resultDesc = computed(() => {
  const descs = ['动作失误较多，继续练习！','有些动作完成了！','不错的表现！','动作流畅！','完美体操！','满分体操！']
  return descs[score.value]
})

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  const len = Math.max(3, Math.min(8, props.sequenceLength))
  sequence.value = Array.from({ length: len }, () => ACTIONS[Math.floor(Math.random() * ACTIONS.length)])
  currentActionIdx.value = 0
  actionResults.value = []
  actionPoints.value = 0
  landingPhase.value = false
  landingResult.value = null
  pointerX.value = 0
  balanceX.value = 50
  feedbackText.value = ''
  actionHandled = false

  let count = 6
  introTimer = setInterval(() => {
    count--
    introCountdown.value = count
    if (count <= 0) { clearInterval(introTimer); beginPlaying() }
  }, 1000)
}

function beginPlaying() {
  phase.value = 'playing'
  rafStart = performance.now()
  nextTick(() => gameArea.value?.focus())
  rafId = requestAnimationFrame(gameLoop)
}

function gameLoop(now) {
  if (phase.value !== 'playing') return
  const elapsed = (now - rafStart) / 1000

  if (!landingPhase.value) {
    // Beat pointer: sweeps 0-420 with period = 1/beatSpeed
    const period = Math.max(0.3, 1 / props.beatSpeed)
    const t = (elapsed % period) / period
    pointerX.value = t * 420
  } else {
    // Balance bar sways
    const speed = props.balanceSpeed
    balanceX.value = 50 + 45 * Math.sin(elapsed * speed * 2)
  }

  rafId = requestAnimationFrame(gameLoop)
}

function showFeedback(text, color, duration = 600) {
  clearTimeout(feedbackTimer)
  feedbackText.value = text
  feedbackColor.value = color
  feedbackTimer = setTimeout(() => { feedbackText.value = '' }, duration)
}

function onKey(e) {
  if (phase.value !== 'playing') return
  const key = e.key
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(key)) e.preventDefault()

  if (landingPhase.value) {
    if (key === ' ') {
      const centered = Math.abs(balanceX.value - 50) < 10
      landingResult.value = centered ? 'perfect' : 'ok'
      showFeedback(centered ? '完美落地！' : '落地成功', centered ? '#67c23a' : '#e6a23c')
      setTimeout(endGame, 800)
    }
    return
  }

  if (actionHandled) return
  const action = currentAction.value
  if (!action) return

  const correct = key === action.key
  const inGreen = pointerInGreen.value

  let result
  if (correct && inGreen) {
    result = 'perfect'
    actionPoints.value += 2
    showFeedback('完美！', '#67c23a')
  } else if (correct) {
    result = 'ok'
    actionPoints.value += 1
    showFeedback('一般', '#e6a23c')
  } else {
    result = 'miss'
    showFeedback('失误！', '#f56c6c')
  }

  actionHandled = true
  actionResults.value.push(result)

  setTimeout(() => {
    actionHandled = false
    currentActionIdx.value++
    if (currentActionIdx.value >= sequence.value.length) {
      landingPhase.value = true
    }
  }, 400)
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
}
onBeforeUnmount(clearAll)
</script>
