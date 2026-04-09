<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '拳击' : phase === 'playing' ? '拳击 - 游戏中' : '游戏结束'"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">拳击</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">防住 6 次进攻里的出拳方向，看到“破绽”后马上按空格反击！连续两次反击可直接压制对手。</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKeyDown">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span>攻防 {{ currentRound + 1 }} / {{ totalRounds }}</span>
        <span>防住 {{ successfulDefenses }}</span>
        <span>反击 {{ counterHits }}</span>
      </div>

      <div style="position:relative;width:430px;height:280px;background:#6d4c41;border-radius:12px;overflow:hidden;margin:0 auto;border:4px solid #4e342e">
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,0.08),transparent 40%),radial-gradient(circle at center,rgba(255,255,255,0.06),transparent 55%)"></div>
        <div style="position:absolute;top:22px;left:0;right:0;height:4px;background:rgba(255,255,255,0.28)"></div>
        <div style="position:absolute;top:38px;left:0;right:0;height:4px;background:rgba(255,255,255,0.2)"></div>

        <div style="position:absolute;top:56px;left:50%;transform:translateX(-50%);text-align:center">
          <div :style="{fontSize:'68px',transform:attackPulse?'scale(1.12)':'scale(1)',transition:'transform 0.1s linear'}">🥊</div>
          <div style="font-size:15px;font-weight:bold;color:#fff;text-shadow:0 2px 6px #000">{{ stageTitle }}</div>
          <div v-if="stageHint" style="font-size:13px;color:#ffe082;margin-top:4px;text-shadow:0 2px 4px #000">{{ stageHint }}</div>
        </div>

        <div style="position:absolute;left:50%;bottom:28px;transform:translateX(-50%);font-size:52px">🧍</div>

        <div v-if="feedbackText" :style="{position:'absolute',top:'48%',left:'50%',transform:'translate(-50%,-50%)',fontSize:'24px',fontWeight:'bold',color:feedbackColor,textShadow:'0 2px 8px #000'}">
          {{ feedbackText }}
        </div>

        <div style="position:absolute;left:16px;right:16px;bottom:10px;height:10px;background:rgba(255,255,255,0.22);border-radius:999px;overflow:hidden">
          <div :style="{width: progressPercent + '%',height:'100%',background: stage === 'opening' ? '#ffd166' : '#67c23a',transition:'width 0.05s linear'}"></div>
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        躲左勾
        &nbsp;|&nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd>
        躲右直
        &nbsp;|&nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">↓</kbd>
        格挡上勾
        &nbsp;|&nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格</kbd>
        反击
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">防住 {{ successfulDefenses }} 次，反击 {{ counterHits }} 次，连击 {{ bestCounterStreak }} 次</div>
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
  punchInterval: { type: Number, default: 1.2 },
  fakeProb: { type: Number, default: 0.2 },
  counterWindow: { type: Number, default: 0.5 },
  exchangeCount: { type: Number, default: 6 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const ATTACKS = [
  { key: 'ArrowLeft', label: '左勾拳', hint: '按 ← 闪避' },
  { key: 'ArrowRight', label: '右直拳', hint: '按 → 闪避' },
  { key: 'ArrowDown', label: '上勾拳', hint: '按 ↓ 格挡' },
]

const phase = ref('intro')
const introCountdown = ref(6)
const currentRound = ref(0)
const stage = ref('warning')
const stageTitle = ref('准备')
const stageHint = ref('')
const successfulDefenses = ref(0)
const counterHits = ref(0)
const currentCounterStreak = ref(0)
const bestCounterStreak = ref(0)
const playerDown = ref(false)
const opponentDown = ref(false)
const progressPercent = ref(0)
const feedbackText = ref('')
const feedbackColor = ref('#fff')
const attackPulse = ref(false)

let introTimer = null
let rafId = null
let lastFrame = 0
let stageTimer = 0
let activeAttack = null
let feedbackTimer = null
let playerResponded = false

const totalRounds = computed(() => Math.max(4, Math.min(8, Math.round(props.exchangeCount))))

const score = computed(() => {
  if (opponentDown.value) return 5
  if (counterHits.value >= 4 && !playerDown.value) return 4
  if (counterHits.value >= 3) return 3
  if (counterHits.value >= 2) return 2
  if (successfulDefenses.value >= 3) return 1
  return 0
})
const scoreTagType = computed(() => ['danger', '', 'warning', 'warning', 'success', 'success'][score.value])
const resultEmoji = computed(() => opponentDown.value ? '🏆' : playerDown.value ? '😵' : ['😢', '🥉', '🥈', '🥇', '🏆', '🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  currentRound.value = 0
  stage.value = 'warning'
  stageTitle.value = '准备'
  stageHint.value = ''
  successfulDefenses.value = 0
  counterHits.value = 0
  currentCounterStreak.value = 0
  bestCounterStreak.value = 0
  playerDown.value = false
  opponentDown.value = false
  progressPercent.value = 0
  feedbackText.value = ''
  activeAttack = null
  playerResponded = false

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
  nextRound()
  lastFrame = performance.now()
  nextTick(() => gameArea.value?.focus())
  rafId = requestAnimationFrame(gameLoop)
}

function nextRound() {
  if (currentRound.value >= totalRounds.value) {
    endGame()
    return
  }
  activeAttack = ATTACKS[Math.floor(Math.random() * ATTACKS.length)]
  if (Math.random() < props.fakeProb) {
    const others = ATTACKS.filter((item) => item.key !== activeAttack.key)
    activeAttack = others[Math.floor(Math.random() * others.length)]
    stageHint.value = `${activeAttack.hint}（变招）`
  } else {
    stageHint.value = activeAttack.hint
  }
  stage.value = 'warning'
  stageTitle.value = activeAttack.label
  stageTimer = 0.85
  progressPercent.value = 0
  playerResponded = false
}

function gameLoop(now) {
  if (phase.value !== 'playing') return
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now

  stageTimer -= dt
  attackPulse.value = stage.value === 'attack'
  const baseDuration = stage.value === 'warning' ? 0.85 : stage.value === 'attack' ? 0.38 : Math.max(0.35, props.counterWindow)
  progressPercent.value = ((baseDuration - Math.max(0, stageTimer)) / baseDuration) * 100

  if (stageTimer <= 0) {
    if (stage.value === 'warning') {
      stage.value = 'attack'
      stageTitle.value = `${activeAttack.label} 出手`
      stageHint.value = activeAttack.hint
      stageTimer = 0.38
      playerResponded = false
    } else if (stage.value === 'attack') {
      if (!playerResponded) {
        playerDown.value = true
        currentCounterStreak.value = 0
        flash('被命中！', '#f56c6c')
      }
      stage.value = 'opening'
      stageTitle.value = '破绽！'
      stageHint.value = '按空格反击'
      stageTimer = Math.max(0.35, props.counterWindow)
    } else {
      currentRound.value++
      nextRound()
    }
  }

  if (opponentDown.value) {
    endGame()
    return
  }
  if (playerDown.value && stage.value !== 'opening') {
    endGame()
    return
  }

  rafId = requestAnimationFrame(gameLoop)
}

function onKeyDown(e) {
  if (phase.value !== 'playing') return
  if (stage.value === 'warning' || stage.value === 'attack') {
    if (!playerResponded && e.key === activeAttack?.key) {
      playerResponded = true
      successfulDefenses.value++
      flash(e.key === 'ArrowDown' ? '格挡成功！' : '闪避成功！', '#67c23a')
    }
    return
  }

  if (stage.value === 'opening' && (e.key === ' ' || e.code === 'Space')) {
    e.preventDefault()
    counterHits.value++
    currentCounterStreak.value++
    bestCounterStreak.value = Math.max(bestCounterStreak.value, currentCounterStreak.value)
    flash(currentCounterStreak.value >= 2 ? '连续反击压制！' : '反击命中！', '#ffd166')
    if (currentCounterStreak.value >= 2) {
      opponentDown.value = true
    }
    stageTimer = 0.01
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
