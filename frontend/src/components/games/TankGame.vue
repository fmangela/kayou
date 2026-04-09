<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '坦克' : phase === 'playing' ? '坦克 - 游戏中' : '游戏结束'"
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">坦克</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">方向键移动与转向，空格开火。利用掩体和中间反弹墙，6 轮交火内抢到优势！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKeyDown" @keyup="onKeyUp">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span>我方生命：{{ playerHP }}</span>
        <span>交火轮次：{{ roundsUsed }} / {{ maxRounds }}</span>
        <span>敌方生命：{{ enemyHP }}</span>
      </div>

      <div style="position:relative;width:460px;height:300px;background:#31473a;border-radius:12px;overflow:hidden;margin:0 auto;border:4px solid #202f27">
        <div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,0.03) 0,rgba(255,255,255,0.03) 22px,transparent 22px,transparent 24px),repeating-linear-gradient(90deg,rgba(0,0,0,0.04) 0,rgba(0,0,0,0.04) 22px,transparent 22px,transparent 24px)"></div>

        <div
          v-for="cover in covers"
          :key="cover.id"
          :style="{
            position: 'absolute',
            left: cover.x + 'px',
            top: cover.y + 'px',
            width: cover.w + 'px',
            height: cover.h + 'px',
            background: cover.reflective ? '#90caf9' : '#8d6e63',
            border: cover.reflective ? '2px solid #bbdefb' : '2px solid #6d4c41',
            borderRadius: '6px',
            opacity: cover.hp <= 0 ? 0.2 : 1,
          }"
        ></div>

        <div
          :style="{
            position: 'absolute',
            left: enemyX - 18 + 'px',
            top: enemyY - 18 + 'px',
            width: '36px',
            height: '36px',
            background: '#e57373',
            borderRadius: '8px',
            border: '3px solid #b71c1c',
            transform: `rotate(${enemyAngle}deg)`,
            transition: 'left 0.08s linear, top 0.08s linear, transform 0.08s linear',
          }"
        >
          <div style="position:absolute;left:14px;top:-10px;width:8px;height:18px;background:#ffcdd2;border-radius:4px"></div>
        </div>

        <div
          :style="{
            position: 'absolute',
            left: playerX - 18 + 'px',
            top: playerY - 18 + 'px',
            width: '36px',
            height: '36px',
            background: '#81c784',
            borderRadius: '8px',
            border: '3px solid #1b5e20',
            transform: `rotate(${playerAngle}deg)`,
            transition: 'left 0.03s linear, top 0.03s linear, transform 0.03s linear',
          }"
        >
          <div style="position:absolute;left:14px;top:-10px;width:8px;height:18px;background:#e8f5e9;border-radius:4px"></div>
        </div>

        <div
          v-for="shell in shells"
          :key="shell.id"
          :style="{
            position: 'absolute',
            left: shell.x - 5 + 'px',
            top: shell.y - 5 + 'px',
            width: '10px',
            height: '10px',
            background: shell.owner === 'player' ? '#fff59d' : '#ffcc80',
            borderRadius: '50%',
            boxShadow: shell.owner === 'player' ? '0 0 8px #fff59d' : '0 0 8px #ffcc80',
          }"
        ></div>

        <div v-if="feedbackText" :style="{position:'absolute',top:'18px',left:'50%',transform:'translateX(-50%)',fontSize:'20px',fontWeight:'bold',color:feedbackColor,textShadow:'0 2px 8px #000'}">
          {{ feedbackText }}
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">↑</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">↓</kbd>
        移动
        &nbsp;|&nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格</kbd>
        开火
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">我方 {{ playerHP }} 血 ｜ 敌方 {{ enemyHP }} 血 ｜ 命中 {{ playerHits }} 次</div>
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
  enemyAimSpeed: { type: Number, default: 1 },
  shellSpeed: { type: Number, default: 6 },
  coverCount: { type: Number, default: 6 },
  battleHp: { type: Number, default: 2 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const W = 460
const H = 300
const maxRounds = 6

const phase = ref('intro')
const introCountdown = ref(6)
const playerX = ref(110)
const playerY = ref(236)
const enemyX = ref(350)
const enemyY = ref(72)
const playerAngle = ref(0)
const enemyAngle = ref(180)
const playerHP = ref(2)
const enemyHP = ref(2)
const playerHits = ref(0)
const roundsUsed = ref(0)
const covers = ref([])
const shells = ref([])
const feedbackText = ref('')
const feedbackColor = ref('#fff')

let introTimer = null
let rafId = null
let lastFrame = 0
let shellId = 0
let feedbackTimer = null
let playerCooldown = 0
let enemyCooldown = 0
let enemyDir = 1
let input = { left: false, right: false, up: false, down: false }

const score = computed(() => {
  const hpMax = Math.max(1, Math.round(props.battleHp))
  if (enemyHP.value <= 0 && playerHP.value >= hpMax) return 5
  if (enemyHP.value <= 0) return 4
  if (enemyHP.value === 1 && playerHP.value >= hpMax) return 3
  if (enemyHP.value === 1) return 2
  if (playerHits.value >= 1) return 1
  return 0
})
const scoreTagType = computed(() => ['danger', '', 'warning', 'warning', 'success', 'success'][score.value])
const resultEmoji = computed(() => ['😢', '🥉', '🥈', '🥇', '🏆', '🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  playerX.value = 110
  playerY.value = 236
  enemyX.value = 350
  enemyY.value = 72
  playerAngle.value = 0
  enemyAngle.value = 180
  playerHP.value = Math.max(1, Math.round(props.battleHp))
  enemyHP.value = Math.max(1, Math.round(props.battleHp))
  playerHits.value = 0
  roundsUsed.value = 0
  shells.value = []
  covers.value = buildCovers()
  feedbackText.value = ''
  shellId = 0
  playerCooldown = 0
  enemyCooldown = 0.8
  enemyDir = 1
  input = { left: false, right: false, up: false, down: false }

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

function buildCovers() {
  const count = Math.max(3, Math.min(8, Math.round(props.coverCount)))
  const base = [
    { id: 'reflect', x: 218, y: 92, w: 24, h: 120, hp: 999, reflective: true },
  ]
  for (let i = 0; i < count - 1; i++) {
    const leftSide = i % 2 === 0
    base.push({
      id: `cover-${i}`,
      x: leftSide ? 50 + (i % 3) * 28 : 320 + (i % 3) * 24,
      y: 90 + Math.floor(i / 2) * 52,
      w: 28,
      h: 40,
      hp: 1,
      reflective: false,
    })
  }
  return base
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

  playerCooldown = Math.max(0, playerCooldown - dt)
  enemyCooldown = Math.max(0, enemyCooldown - dt)

  const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const moveY = (input.down ? 1 : 0) - (input.up ? 1 : 0)
  if (moveX || moveY) {
    playerX.value = clamp(playerX.value + moveX * 150 * dt, 22, W - 22)
    playerY.value = clamp(playerY.value + moveY * 150 * dt, 22, H - 22)
    playerAngle.value = Math.round((Math.atan2(moveY, moveX) * 180) / Math.PI) + 90
  }

  enemyX.value += enemyDir * 58 * dt
  if (enemyX.value >= 392 || enemyX.value <= 68) enemyDir *= -1
  enemyAngle.value = Math.round((Math.atan2(playerY.value - enemyY.value, playerX.value - enemyX.value) * 180) / Math.PI) + 90

  if (enemyCooldown <= 0 && roundsUsed.value < maxRounds) {
    fireShell('enemy')
    const aimFactor = clamp(props.enemyAimSpeed, 0.5, 2.2)
    enemyCooldown = Math.max(0.8, 2 / aimFactor)
  }

  const speed = 120 + Math.max(1, props.shellSpeed) * 22
  const remaining = []
  for (const shell of shells.value) {
    shell.x += shell.vx * speed * dt
    shell.y += shell.vy * speed * dt

    if (shell.x <= 8 || shell.x >= W - 8) shell.vx *= -1
    if (shell.y <= 8 || shell.y >= H - 8) shell.vy *= -1

    const cover = covers.value.find((item) => item.hp > 0 && pointInRect(shell.x, shell.y, item))
    if (cover) {
      if (cover.reflective && shell.bouncesLeft > 0) {
        shell.vx *= -1
        shell.bouncesLeft--
      } else {
        if (!cover.reflective) cover.hp--
        continue
      }
    }

    const hitPlayer = shell.owner === 'enemy' && distance(shell.x, shell.y, playerX.value, playerY.value) < 18
    const hitEnemy = shell.owner === 'player' && distance(shell.x, shell.y, enemyX.value, enemyY.value) < 18
    if (hitPlayer) {
      playerHP.value--
      flash('被命中！', '#f56c6c')
      if (playerHP.value <= 0) {
        endGame()
        return
      }
      continue
    }
    if (hitEnemy) {
      enemyHP.value--
      playerHits.value++
      flash('命中敌方！', '#ffd166')
      if (enemyHP.value <= 0) {
        endGame()
        return
      }
      continue
    }

    remaining.push(shell)
  }
  shells.value = remaining

  if (roundsUsed.value >= maxRounds && shells.value.length === 0) {
    endGame()
    return
  }

  rafId = requestAnimationFrame(gameLoop)
}

function fireShell(owner) {
  if (roundsUsed.value >= maxRounds) return
  const fromPlayer = owner === 'player'
  const fromX = fromPlayer ? playerX.value : enemyX.value
  const fromY = fromPlayer ? playerY.value : enemyY.value
  const targetX = fromPlayer ? enemyX.value : playerX.value
  const targetY = fromPlayer ? enemyY.value : playerY.value
  const dirX = targetX - fromX
  const dirY = targetY - fromY
  const length = Math.max(1, Math.sqrt(dirX * dirX + dirY * dirY))
  shells.value.push({
    id: shellId++,
    owner,
    x: fromX,
    y: fromY,
    vx: dirX / length,
    vy: dirY / length,
    bouncesLeft: 1,
  })
  roundsUsed.value++
}

function onKeyDown(e) {
  if (phase.value !== 'playing') return
  if (e.key === 'ArrowLeft') input.left = true
  if (e.key === 'ArrowRight') input.right = true
  if (e.key === 'ArrowUp') input.up = true
  if (e.key === 'ArrowDown') input.down = true
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault()
    if (playerCooldown <= 0 && roundsUsed.value < maxRounds) {
      playerCooldown = 0.5
      fireShell('player')
    }
  }
}

function onKeyUp(e) {
  if (e.key === 'ArrowLeft') input.left = false
  if (e.key === 'ArrowRight') input.right = false
  if (e.key === 'ArrowUp') input.up = false
  if (e.key === 'ArrowDown') input.down = false
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
  feedbackTimer = setTimeout(() => { feedbackText.value = '' }, 650)
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}

function distance(ax, ay, bx, by) {
  const dx = ax - bx
  const dy = ay - by
  return Math.sqrt(dx * dx + dy * dy)
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
  clearTimeout(feedbackTimer)
}

function onClosed() {
  clearAll()
  emit('update:modelValue', false)
}

onBeforeUnmount(clearAll)
</script>
