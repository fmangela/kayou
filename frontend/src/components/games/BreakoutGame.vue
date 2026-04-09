<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '打砖块' : phase === 'playing' ? '打砖块 - 游戏中' : '游戏结束'"
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">打砖块</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">不是接球版，而是 4 回合短局规划。左右调角度，空格发射整串小球，打出最大连锁！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKeyDown">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span>回合 {{ currentRound + 1 }} / {{ totalRounds }}</span>
        <span>清除率 {{ clearRate.toFixed(0) }}%</span>
        <span>角度 {{ aimAngle.toFixed(0) }}°</span>
      </div>

      <div style="position:relative;width:450px;height:320px;background:#0f172a;border-radius:12px;overflow:hidden;margin:0 auto;border:2px solid #334155">
        <div
          v-for="brick in bricks"
          :key="brick.id"
          :style="{
            position:'absolute',
            left:(brick.col * 58 + 22)+'px',
            top:(brick.row * 42 + 18)+'px',
            width:'46px',
            height:'30px',
            background: brick.hp <= 0 ? 'rgba(255,255,255,0.08)' : brick.blocked ? '#475569' : brick.hp >= 3 ? '#f97316' : '#38bdf8',
            borderRadius:'8px',
            border:'1px solid rgba(255,255,255,0.15)',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            color:'#fff',
            fontWeight:'bold',
            opacity:brick.hp <= 0 ? 0.25 : 1,
          }"
        >
          {{ brick.hp > 0 ? brick.hp : '' }}
        </div>

        <div :style="{position:'absolute',left:'225px',bottom:'16px',fontSize:'30px',transform:'translateX(-50%)'}">⚪</div>

        <div
          :style="{
            position:'absolute',
            left:'225px',
            bottom:'28px',
            width:'110px',
            height:'2px',
            background:'#ffd166',
            transformOrigin:'0 50%',
            transform:`rotate(${-aimAngle}deg)`,
            boxShadow:'0 0 8px #ffd166',
          }"
        ></div>

        <div v-if="feedbackText" :style="{position:'absolute',top:'18px',left:'50%',transform:'translateX(-50%)',fontSize:'22px',fontWeight:'bold',color:feedbackColor,textShadow:'0 2px 8px #000'}">
          {{ feedbackText }}
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd>
        调角度
        &nbsp;|&nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格</kbd>
        发射
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">清除率 {{ clearRate.toFixed(0) }}%，剩余砖块 {{ remainingBricks }}</div>
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
  initialBallCount: { type: Number, default: 10 },
  brickHp: { type: Number, default: 3 },
  obstacleRatio: { type: Number, default: 0.15 },
  roundCount: { type: Number, default: 4 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const phase = ref('intro')
const introCountdown = ref(6)
const aimAngle = ref(40)
const currentRound = ref(0)
const bricks = ref([])
const feedbackText = ref('')
const feedbackColor = ref('#fff')

let introTimer = null
let feedbackTimer = null

const totalRounds = computed(() => Math.max(3, Math.min(5, Math.round(props.roundCount))))
const totalBricks = computed(() => bricks.value.length)
const remainingBricks = computed(() => bricks.value.filter((brick) => brick.hp > 0 && !brick.blocked).length)
const clearRate = computed(() => {
  const destructible = bricks.value.filter((brick) => !brick.blocked)
  if (!destructible.length) return 0
  const cleared = destructible.filter((brick) => brick.hp <= 0).length
  return (cleared / destructible.length) * 100
})

const score = computed(() => {
  if (remainingBricks.value === 0) return 5
  if (clearRate.value >= 85) return 4
  if (clearRate.value >= 65) return 3
  if (clearRate.value >= 45) return 2
  if (clearRate.value >= 20) return 1
  return 0
})
const scoreTagType = computed(() => ['danger', '', 'warning', 'warning', 'success', 'success'][score.value])
const resultEmoji = computed(() => ['😢', '🥉', '🥈', '🥇', '🏆', '🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  aimAngle.value = 40
  currentRound.value = 0
  bricks.value = buildBricks()
  feedbackText.value = ''

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

function buildBricks() {
  const result = []
  const hpBase = Math.max(1, Math.round(props.brickHp))
  let id = 0
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 7; col++) {
      const blocked = Math.random() < props.obstacleRatio && row < 4
      result.push({
        id: id++,
        row,
        col,
        blocked,
        hp: blocked ? 1 : Math.max(1, hpBase - (row > 2 ? 1 : 0)),
      })
    }
  }
  return result
}

function beginPlaying() {
  phase.value = 'playing'
  nextTick(() => gameArea.value?.focus())
}

function onKeyDown(e) {
  if (phase.value !== 'playing') return
  if (e.key === 'ArrowLeft') aimAngle.value = clamp(aimAngle.value + 4, 18, 72)
  if (e.key === 'ArrowRight') aimAngle.value = clamp(aimAngle.value - 4, 18, 72)
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault()
    fireVolley()
  }
}

function fireVolley() {
  const shots = Math.max(6, Math.min(16, Math.round(props.initialBallCount)))
  const slope = Math.tan((aimAngle.value * Math.PI) / 180)
  let x = 3
  let dir = -1
  const live = bricks.value.map((brick) => ({ ...brick }))

  for (let step = 0; step < shots + 10; step++) {
    const row = 4 - (step % 5)
    x += dir * Math.max(0.55, slope * 0.18)
    if (x <= 0) {
      x = 0
      dir = 1
    }
    if (x >= 6) {
      x = 6
      dir = -1
    }

    const col = Math.round(x)
    const target = live.find((brick) => brick.row === row && brick.col === col && brick.hp > 0)
    if (target && !target.blocked) target.hp--
  }

  const shifted = []
  for (const brick of live) {
    if (brick.row === 4 && brick.hp > 0 && !brick.blocked) {
      flash('砖块压到底线！', '#f56c6c')
      bricks.value = live
      endGame()
      return
    }
    shifted.push({
      ...brick,
      row: Math.min(4, brick.row + (brick.hp > 0 ? 1 : 0)),
    })
  }
  bricks.value = shifted

  if (remainingBricks.value === 0) {
    flash('清空砖阵！', '#67c23a')
    endGame()
    return
  }

  currentRound.value++
  flash('一轮发射完成', '#ffd166')
  if (currentRound.value >= totalRounds.value) {
    endGame()
  }
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
  phase.value = 'result'
  emit('score', score.value)
}

function restart() {
  clearAll()
  startGame()
}

function clearAll() {
  clearInterval(introTimer)
  clearTimeout(feedbackTimer)
}

function onClosed() {
  clearAll()
  emit('update:modelValue', false)
}

onBeforeUnmount(clearAll)
</script>
