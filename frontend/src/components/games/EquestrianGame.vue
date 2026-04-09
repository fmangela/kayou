<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '马术' : phase === 'playing' ? '马术 - 游戏中' : '游戏结束'"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <!-- Intro phase -->
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">马术</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">障碍物接近时，按住空格蓄力，松开起跳！时机要准确！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <!-- Playing phase -->
    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKey" @keyup="onKeyUp">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span>障碍 {{ clearedCount }} / {{ totalObstacles }}</span>
        <span>失误 {{ hitCount }} / 3</span>
        <span>{{ statusText }}</span>
      </div>

      <!-- Field -->
      <div style="position:relative;width:420px;height:260px;background:#5a9e5a;border-radius:12px;overflow:hidden;margin:0 auto">
        <!-- Sky -->
        <div style="position:absolute;top:0;left:0;right:0;height:100px;background:linear-gradient(#87ceeb,#b0e0e6)"></div>
        <!-- Ground -->
        <div style="position:absolute;bottom:0;left:0;right:0;height:80px;background:#8B6914"></div>
        <!-- Grass line -->
        <div style="position:absolute;bottom:80px;left:0;right:0;height:8px;background:#4a7c4e"></div>

        <!-- Horse -->
        <div :style="{
          position:'absolute',
          left:'60px',
          bottom: horseY + 'px',
          fontSize:'40px',
          transition:'bottom 0.05s',
          transform: isCharging ? 'scaleY(0.85)' : 'scaleY(1)',
        }">🐎</div>

        <!-- Charge indicator -->
        <div v-if="isCharging" style="position:absolute;left:40px;bottom:130px;width:60px;height:8px;background:#eee;border-radius:4px">
          <div :style="{width: chargeLevel*100+'%',height:'100%',background:'#e6a23c',borderRadius:'4px'}"></div>
        </div>

        <!-- Obstacles -->
        <div
          v-for="obs in obstacles"
          :key="obs.id"
          :style="{
            position:'absolute',
            left: obs.x + 'px',
            bottom:'80px',
            fontSize:'28px',
          }"
        >🚧</div>

        <!-- Overlay -->
        <div v-if="overlayText" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:26px;font-weight:bold;color:#fff;text-shadow:0 2px 8px #000;pointer-events:none">
          {{ overlayText }}
        </div>

        <!-- Hit indicators -->
        <div style="position:absolute;top:8px;right:8px;display:flex;gap:4px">
          <span v-for="i in 3" :key="i" style="font-size:18px">{{ i <= hitCount ? '💔' : '❤️' }}</span>
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        按住 <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格</kbd> 蓄力，松开起跳
      </div>
    </div>

    <!-- Result phase -->
    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">越过 {{ clearedCount }} / {{ totalObstacles }} 个障碍，失误 {{ hitCount }} 次</div>
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
  obstacleInterval: { type: Number, default: 2 },
  jumpWindow: { type: Number, default: 0.4 },
  horseRestless: { type: Number, default: 1 },
  obstacleCount: { type: Number, default: 8 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const phase = ref('intro')
const introCountdown = ref(6)
const clearedCount = ref(0)
const hitCount = ref(0)
const statusText = ref('')
const overlayText = ref('')
const horseY = ref(80)   // px from bottom (ground = 80)
const isCharging = ref(false)
const chargeLevel = ref(0)
const obstacles = ref([])

const GROUND_Y = 80
const JUMP_PEAK = 160
const HORSE_X = 80
const totalObstacles = computed(() => Math.max(5, Math.min(15, props.obstacleCount)))

let introTimer = null
let rafId = null
let lastFrame = 0
let obsIdCounter = 0
let nextObstacleTime = 0
let isJumping = false
let jumpStart = 0
let jumpDuration = 0.7
let chargeStart = 0
let restlessOffset = 0
let overlayTimer = null
let spawnedCount = 0

const score = computed(() => {
  const total = totalObstacles.value
  const cleared = clearedCount.value
  const hits = hitCount.value
  if (hits === 0 && cleared >= total) return 5
  if (hits === 1 && cleared >= total) return 4
  if (hits === 2 && cleared >= total) return 3
  if (cleared / total >= 0.75) return 2
  if (cleared / total >= 0.5) return 1
  return 0
})
const scoreTagType = computed(() => ['danger','','warning','warning','success','success'][score.value])
const resultEmoji = computed(() => ['😢','🥉','🥈','🥇','🏆','🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  clearedCount.value = 0
  hitCount.value = 0
  statusText.value = '准备起跳'
  overlayText.value = ''
  horseY.value = GROUND_Y
  isCharging.value = false
  chargeLevel.value = 0
  obstacles.value = []
  isJumping = false
  spawnedCount = 0
  obsIdCounter = 0

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
  nextObstacleTime = lastFrame + props.obstacleInterval * 1000
  nextTick(() => gameArea.value?.focus())
  rafId = requestAnimationFrame(gameLoop)
}

function gameLoop(now) {
  if (phase.value !== 'playing') return
  const dt = (now - lastFrame) / 1000
  lastFrame = now

  // Spawn obstacles
  if (spawnedCount < totalObstacles.value && now >= nextObstacleTime) {
    obstacles.value.push({ id: obsIdCounter++, x: 430 })
    spawnedCount++
    nextObstacleTime = now + props.obstacleInterval * 1000
  }

  // Move obstacles
  const speed = 120  // px/sec
  obstacles.value = obstacles.value.map(o => ({ ...o, x: o.x - speed * dt }))

  // Check collisions and clears
  const horseLeft = HORSE_X - 10
  const horseRight = HORSE_X + 30
  const horseBottom = horseY.value
  const horseTop = horseY.value + 40

  obstacles.value = obstacles.value.filter(o => {
    const obsLeft = o.x
    const obsRight = o.x + 28
    const obsTop = GROUND_Y + 28

    if (obsRight < horseLeft) {
      // Passed horse
      clearedCount.value++
      showOverlay('越过！', '#67c23a')
      return false
    }
    if (obsLeft < horseRight && obsRight > horseLeft) {
      // Overlap horizontally - check vertical
      if (horseBottom < obsTop) {
        // Horse is above obstacle - cleared
        return true
      } else {
        // Collision
        hitCount.value++
        showOverlay('撞到了！', '#f56c6c')
        if (hitCount.value >= 3) {
          endGame()
          return false
        }
        return false
      }
    }
    if (o.x < -40) return false
    return true
  })

  // Horse restlessness
  restlessOffset = Math.sin(now / 300) * props.horseRestless * 3

  // Jump arc
  if (isJumping) {
    const elapsed = (now - jumpStart) / 1000
    const t = elapsed / jumpDuration
    if (t >= 1) {
      isJumping = false
      horseY.value = GROUND_Y + restlessOffset
      statusText.value = '准备起跳'
    } else {
      const arc = Math.sin(t * Math.PI)
      horseY.value = GROUND_Y + arc * (JUMP_PEAK - GROUND_Y) + restlessOffset
    }
  } else {
    horseY.value = GROUND_Y + restlessOffset
  }

  // Charge level
  if (isCharging.value) {
    chargeLevel.value = Math.min(1, (now - chargeStart) / 800)
  }

  // Check if all obstacles done and none left
  if (spawnedCount >= totalObstacles.value && obstacles.value.length === 0) {
    endGame()
    return
  }

  // Proximity hint
  const nearest = obstacles.value.reduce((best, o) => {
    const dist = o.x - HORSE_X
    return dist > 0 && dist < (best?.dist ?? Infinity) ? { dist, obs: o } : best
  }, null)
  if (nearest && nearest.dist < 100 && !isJumping) {
    statusText.value = '准备！'
  }

  rafId = requestAnimationFrame(gameLoop)
}

function onKey(e) {
  if (phase.value !== 'playing') return
  if (e.key === ' ') {
    e.preventDefault()
    if (!isCharging.value && !isJumping) {
      isCharging.value = true
      chargeStart = performance.now()
    }
  }
}

function onKeyUp(e) {
  if (phase.value !== 'playing') return
  if (e.key === ' ' && isCharging.value) {
    e.preventDefault()
    isCharging.value = false
    const charge = chargeLevel.value
    chargeLevel.value = 0
    if (!isJumping) {
      isJumping = true
      jumpStart = performance.now()
      jumpDuration = 0.5 + charge * 0.4
      statusText.value = '起跳！'
    }
  }
}

function showOverlay(text, color) {
  clearTimeout(overlayTimer)
  overlayText.value = text
  overlayTimer = setTimeout(() => { overlayText.value = '' }, 600)
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
  clearTimeout(overlayTimer)
}
onBeforeUnmount(clearAll)
</script>
