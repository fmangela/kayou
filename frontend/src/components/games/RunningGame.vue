<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '跑步' : phase === 'playing' ? '跑步 - 游戏中' : '游戏结束'"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">跑步</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">只跑最后直道。左右变道躲卡位，上键短促提速，最后按空格完成冲线！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKeyDown" @keyup="onKeyUp">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span>抢位 {{ successCount }} / {{ totalWindows }}</span>
        <span>体力 {{ stamina.toFixed(0) }}%</span>
        <span v-if="sprintPhase">冲线槽 {{ sprintMeter.toFixed(0) }}%</span>
        <span v-else>第 {{ currentWindow + 1 }} 段</span>
      </div>

      <div style="position:relative;width:440px;height:280px;background:linear-gradient(#9fd3ff 0%,#9fd3ff 34%,#5da35d 34%,#5da35d 100%);border-radius:12px;overflow:hidden;margin:0 auto">
        <div v-for="lane in 3" :key="lane" :style="{position:'absolute',left:'0',right:'0',top:(74 + (lane - 1) * 48)+'px',height:'36px',background:'#a97448',borderTop:'2px solid rgba(255,255,255,0.55)',borderBottom:'2px solid rgba(255,255,255,0.55)'}"></div>

        <div style="position:absolute;top:64px;right:24px;width:8px;height:152px;background:repeating-linear-gradient(#000 0,#000 8px,#fff 8px,#fff 16px)"></div>
        <div style="position:absolute;top:48px;right:12px;font-size:12px;color:#fff;font-weight:bold">终点</div>

        <div
          v-for="(segment, index) in windows"
          :key="index"
          :style="{
            position:'absolute',
            top:'62px',
            left:(84 + index * 96)+'px',
            width:'72px',
            height:'156px',
            border: index === currentWindow && !sprintPhase ? '3px solid #ffd166' : '2px dashed rgba(255,255,255,0.24)',
            borderRadius:'8px',
            opacity:index < currentWindow ? 0.35 : 1,
          }"
        >
          <div
            :style="{
              position:'absolute',
              left:'12px',
              top:(12 + segment.blockedLane * 48)+'px',
              width:'48px',
              height:'28px',
              background:'rgba(245,108,108,0.75)',
              borderRadius:'999px',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              color:'#fff',
              fontSize:'12px',
              fontWeight:'bold',
            }"
          >
            卡位
          </div>
        </div>

        <div
          :style="{
            position:'absolute',
            left: sprintPhase ? '336px' : (58 + currentWindow * 94) + 'px',
            top:(84 + playerLane * 48)+'px',
            fontSize:'30px',
            transition:'left 0.08s linear, top 0.08s linear',
          }"
        >
          🏃
        </div>

        <div
          :style="{
            position:'absolute',
            left: sprintPhase ? '352px' : (74 + currentWindow * 94) + 'px',
            top:(84 + windows[Math.min(currentWindow, windows.length - 1)].blockedLane * 48)+'px',
            fontSize:'28px',
            opacity: sprintPhase ? 0.45 : 1,
          }"
        >
          🏃
        </div>

        <div style="position:absolute;left:16px;right:16px;bottom:14px;height:10px;background:rgba(255,255,255,0.28);border-radius:999px;overflow:hidden">
          <div :style="{width: progressPercent + '%',height:'100%',background:sprintPhase ? '#ffd166' : '#67c23a',transition:'width 0.06s linear'}"></div>
        </div>

        <div v-if="feedbackText" :style="{position:'absolute',top:'18px',left:'50%',transform:'translateX(-50%)',fontSize:'22px',fontWeight:'bold',color:feedbackColor,textShadow:'0 2px 8px #000'}">
          {{ feedbackText }}
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd>
        变道
        &nbsp;|&nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">↑</kbd>
        提速
        &nbsp;|&nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格</kbd>
        冲线
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">抢位成功 {{ successCount }} 次，冲线槽 {{ sprintMeter.toFixed(0) }}%</div>
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
  opponentBaseSpeed: { type: Number, default: 5 },
  overtakeWindowCount: { type: Number, default: 3 },
  staminaDrainRate: { type: Number, default: 1 },
  sprintReserve: { type: Number, default: 2.5 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const phase = ref('intro')
const introCountdown = ref(6)
const currentWindow = ref(0)
const playerLane = ref(1)
const successCount = ref(0)
const blockedCount = ref(0)
const stamina = ref(100)
const sprintPhase = ref(false)
const sprintMeter = ref(0)
const feedbackText = ref('')
const feedbackColor = ref('#fff')
const progressPercent = ref(0)
const windows = ref([])

let introTimer = null
let rafId = null
let lastFrame = 0
let boostHeld = false
let boostUsedInWindow = false
let windowTimer = 0
let sprintTimer = 0
let feedbackTimer = null

const totalWindows = computed(() => Math.max(3, Math.min(4, Math.round(props.overtakeWindowCount))))

const score = computed(() => {
  if (successCount.value >= totalWindows.value && sprintMeter.value >= 80) return 5
  if (successCount.value >= Math.max(2, totalWindows.value - 1) && sprintMeter.value >= 45) return 4
  if (successCount.value >= 2) return 3
  if (successCount.value >= 1) return 2
  if (sprintMeter.value >= 25) return 1
  return 0
})
const scoreTagType = computed(() => ['danger', '', 'warning', 'warning', 'success', 'success'][score.value])
const resultEmoji = computed(() => ['😢', '🥉', '🥈', '🥇', '🏆', '🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  currentWindow.value = 0
  playerLane.value = 1
  successCount.value = 0
  blockedCount.value = 0
  stamina.value = 100
  sprintPhase.value = false
  sprintMeter.value = 0
  feedbackText.value = ''
  progressPercent.value = 0
  windows.value = buildWindows()
  boostUsedInWindow = false
  boostHeld = false
  windowTimer = 1.9
  sprintTimer = Math.max(1.4, props.sprintReserve)

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

function buildWindows() {
  const count = totalWindows.value
  const list = []
  let previous = 1
  for (let i = 0; i < count; i++) {
    const difficult = Math.max(4, props.opponentBaseSpeed) > 5.2 && i === count - 1
    let blocked = difficult ? previous : Math.floor(Math.random() * 3)
    if (i > 0 && Math.random() < 0.35) blocked = previous
    previous = blocked
    list.push({ blockedLane: blocked })
  }
  return list
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

  if (!sprintPhase.value) {
    windowTimer -= dt
    progressPercent.value = ((currentWindow.value + (1 - windowTimer / 1.9)) / (totalWindows.value + 1)) * 100
    if (boostHeld && stamina.value > 0) {
      stamina.value = Math.max(0, stamina.value - dt * (14 + props.staminaDrainRate * 6))
      boostUsedInWindow = true
    } else {
      stamina.value = Math.min(100, stamina.value + dt * 4)
    }

    if (windowTimer <= 0) {
      resolveWindow()
      if (!sprintPhase.value) {
        currentWindow.value++
        windowTimer = 1.9
        boostUsedInWindow = false
      }
    }
  } else {
    sprintTimer -= dt
    progressPercent.value = (totalWindows.value / (totalWindows.value + 1)) * 100 + (1 - sprintTimer / Math.max(1.4, props.sprintReserve)) * (100 / (totalWindows.value + 1))
    sprintMeter.value = Math.max(0, sprintMeter.value - dt * 4)
    if (sprintTimer <= 0) {
      endGame()
      return
    }
  }

  rafId = requestAnimationFrame(gameLoop)
}

function resolveWindow() {
  const blockedLaneIndex = windows.value[currentWindow.value].blockedLane
  if (playerLane.value === blockedLaneIndex) {
    blockedCount.value++
    flash('被卡位！', '#f56c6c')
    if (blockedCount.value >= 2) {
      endGame()
      return
    }
  } else {
    successCount.value++
    flash(boostUsedInWindow ? '抢位成功！' : '找到空档！', '#67c23a')
  }

  if (currentWindow.value >= totalWindows.value - 1) {
    sprintPhase.value = true
    flash('最后冲线！', '#ffd166')
  }
}

function onKeyDown(e) {
  if (phase.value !== 'playing') return
  if (e.key === 'ArrowLeft') playerLane.value = Math.max(0, playerLane.value - 1)
  if (e.key === 'ArrowRight') playerLane.value = Math.min(2, playerLane.value + 1)
  if (e.key === 'ArrowUp') boostHeld = true
  if ((e.key === ' ' || e.code === 'Space') && sprintPhase.value) {
    e.preventDefault()
    sprintMeter.value = Math.min(100, sprintMeter.value + 18)
  }
}

function onKeyUp(e) {
  if (e.key === 'ArrowUp') boostHeld = false
}

function flash(text, color) {
  feedbackText.value = text
  feedbackColor.value = color
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => { feedbackText.value = '' }, 600)
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
