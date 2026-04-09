<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '飞机' : phase === 'playing' ? '飞机 - 游戏中' : '游戏结束'"
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">飞机</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">方向键移动战机，自动射击清完 3 波敌机。护盾和清屏道具会随机掉落！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKeyDown" @keyup="onKeyUp">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span>波次：{{ currentWave }} / {{ totalWaves }}</span>
        <span>生命：{{ playerHP }} <span v-if="shield > 0" style="color:#67c23a">+盾{{ shield }}</span></span>
        <span>击落：{{ killCount }}</span>
      </div>

      <div style="position:relative;width:460px;height:320px;background:linear-gradient(180deg,#102a43 0%,#1b4965 45%,#274c77 100%);border-radius:12px;overflow:hidden;margin:0 auto">
        <div style="position:absolute;inset:0;background:radial-gradient(circle at 20% 18%,rgba(255,255,255,0.15),transparent 22%),radial-gradient(circle at 80% 32%,rgba(255,255,255,0.1),transparent 16%)"></div>

        <div
          v-for="bullet in playerBullets"
          :key="bullet.id"
          :style="{position:'absolute',left:bullet.x+'px',top:bullet.y+'px',width:'4px',height:'14px',background:'#ffd166',borderRadius:'999px',boxShadow:'0 0 8px #ffd166'}"
        ></div>

        <div
          v-for="bullet in enemyBullets"
          :key="bullet.id"
          :style="{position:'absolute',left:bullet.x+'px',top:bullet.y+'px',width:'6px',height:'14px',background:'#ff6b6b',borderRadius:'999px',boxShadow:'0 0 8px #ff6b6b'}"
        ></div>

        <div
          v-for="enemy in enemies"
          :key="enemy.id"
          :style="{
            position:'absolute',
            left: enemy.x + 'px',
            top: enemy.y + 'px',
            fontSize: enemy.elite ? '30px' : '24px',
            filter: enemy.elite ? 'drop-shadow(0 0 8px #f56c6c)' : 'drop-shadow(0 0 6px rgba(255,255,255,0.2))',
          }"
        >
          {{ enemy.elite ? '🛸' : '✈️' }}
        </div>

        <div
          v-for="item in items"
          :key="item.id"
          :style="{position:'absolute',left:item.x+'px',top:item.y+'px',fontSize:'24px',filter:'drop-shadow(0 0 8px rgba(255,255,255,0.25))'}"
        >
          {{ item.type === 'shield' ? '🛡️' : '💥' }}
        </div>

        <div :style="{position:'absolute',left:playerX+'px',top:playerY+'px',fontSize:'30px',filter:'drop-shadow(0 0 10px rgba(255,255,255,0.35))'}">🚀</div>

        <div v-if="feedbackText" :style="{position:'absolute',top:'20px',left:'50%',transform:'translateX(-50%)',fontSize:'20px',fontWeight:'bold',color:feedbackColor,textShadow:'0 2px 8px #000'}">
          {{ feedbackText }}
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">↑</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">↓</kbd>
        移动躲弹幕
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">完成 {{ completedWaves }} 波 ｜ 击落 {{ killCount }} 架 ｜ 精英击落 {{ eliteKills }}</div>
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
  bulletDensity: { type: Number, default: 3 },
  itemProb: { type: Number, default: 0.2 },
  eliteFreq: { type: Number, default: 0.167 },
  waveCount: { type: Number, default: 3 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const W = 460
const H = 320

const phase = ref('intro')
const introCountdown = ref(6)
const currentWave = ref(1)
const completedWaves = ref(0)
const playerX = ref(214)
const playerY = ref(270)
const playerHP = ref(3)
const shield = ref(0)
const killCount = ref(0)
const eliteKills = ref(0)
const enemies = ref([])
const items = ref([])
const playerBullets = ref([])
const enemyBullets = ref([])
const feedbackText = ref('')
const feedbackColor = ref('#fff')

const totalWaves = computed(() => Math.max(3, Math.min(5, Math.round(props.waveCount))))

let introTimer = null
let rafId = null
let lastFrame = 0
let bulletId = 0
let enemyId = 0
let itemId = 0
let playerShootTimer = 0
let waveSpawned = 0
let waveTarget = 0
let spawnCooldown = 0
let feedbackTimer = null
let input = { left: false, right: false, up: false, down: false }

const score = computed(() => {
  if (completedWaves.value >= totalWaves.value && playerHP.value === 3 && eliteKills.value >= totalWaves.value) return 5
  if (completedWaves.value >= totalWaves.value && eliteKills.value >= totalWaves.value) return 4
  if (completedWaves.value >= totalWaves.value) return 3
  if (completedWaves.value >= 2) return 2
  if (killCount.value >= 4) return 1
  return 0
})
const scoreTagType = computed(() => ['danger', '', 'warning', 'warning', 'success', 'success'][score.value])
const resultEmoji = computed(() => ['😢', '🥉', '🥈', '🥇', '🏆', '🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  currentWave.value = 1
  completedWaves.value = 0
  playerX.value = 214
  playerY.value = 270
  playerHP.value = 3
  shield.value = 0
  killCount.value = 0
  eliteKills.value = 0
  enemies.value = []
  items.value = []
  playerBullets.value = []
  enemyBullets.value = []
  feedbackText.value = ''
  bulletId = 0
  enemyId = 0
  itemId = 0
  playerShootTimer = 0
  waveSpawned = 0
  waveTarget = 3
  spawnCooldown = 0.4
  input = { left: false, right: false, up: false, down: false }
  configureWave()

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

function configureWave() {
  waveSpawned = 0
  waveTarget = 3 + currentWave.value * 2
  spawnCooldown = 0.4
}

function gameLoop(now) {
  if (phase.value !== 'playing') return
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now

  const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const moveY = (input.down ? 1 : 0) - (input.up ? 1 : 0)
  playerX.value = clamp(playerX.value + moveX * 220 * dt, 8, W - 30)
  playerY.value = clamp(playerY.value + moveY * 220 * dt, 120, H - 42)

  playerShootTimer += dt
  if (playerShootTimer >= 0.22) {
    playerShootTimer = 0
    playerBullets.value.push({ id: bulletId++, x: playerX.value + 12, y: playerY.value - 4 })
  }

  spawnCooldown -= dt
  if (waveSpawned < waveTarget && spawnCooldown <= 0) {
    spawnEnemy()
    waveSpawned++
    spawnCooldown = 0.45
  }

  for (const bullet of playerBullets.value) bullet.y -= 360 * dt
  for (const bullet of enemyBullets.value) bullet.y += (160 + props.bulletDensity * 25) * dt
  playerBullets.value = playerBullets.value.filter((bullet) => bullet.y > -20)
  enemyBullets.value = enemyBullets.value.filter((bullet) => bullet.y < H + 20)

  const enemyFireBase = Math.max(0.9, 2.1 - Math.max(1, props.bulletDensity) * 0.2)
  for (const enemy of enemies.value) {
    enemy.y += enemy.speedY * dt
    enemy.x += Math.sin((now / 1000) * enemy.swing + enemy.seed) * 18 * dt
    enemy.fireCooldown -= dt
    if (enemy.fireCooldown <= 0) {
      enemy.fireCooldown = enemyFireBase + Math.random() * 0.5
      enemyBullets.value.push({ id: bulletId++, x: enemy.x + 10, y: enemy.y + 18 })
    }
  }
  enemies.value = enemies.value.filter((enemy) => enemy.y < H + 40 && enemy.hp > 0)

  for (const item of items.value) item.y += 120 * dt
  items.value = items.value.filter((item) => item.y < H + 30)

  resolvePlayerBulletHits()
  resolveEnemyBulletHits()
  resolveItems()

  if (waveSpawned >= waveTarget && enemies.value.length === 0) {
    completedWaves.value = Math.max(completedWaves.value, currentWave.value)
    if (currentWave.value >= totalWaves.value) {
      endGame()
      return
    }
    currentWave.value++
    configureWave()
    flash(`第 ${currentWave.value} 波`, '#67c23a')
  }

  rafId = requestAnimationFrame(gameLoop)
}

function spawnEnemy() {
  const elite = Math.random() < props.eliteFreq
  enemies.value.push({
    id: enemyId++,
    x: 26 + Math.random() * 390,
    y: -24 - Math.random() * 18,
    hp: elite ? 2 : 1,
    elite,
    speedY: elite ? 42 : 56,
    fireCooldown: 0.9 + Math.random() * 0.6,
    swing: 1.6 + Math.random(),
    seed: Math.random() * Math.PI * 2,
  })
}

function resolvePlayerBulletHits() {
  const remainingBullets = []
  for (const bullet of playerBullets.value) {
    const target = enemies.value.find((enemy) => distance(bullet.x, bullet.y, enemy.x + 12, enemy.y + 12) < 18)
    if (!target) {
      remainingBullets.push(bullet)
      continue
    }
    target.hp--
    if (target.hp <= 0) {
      killCount.value++
      if (target.elite) eliteKills.value++
      if (Math.random() < props.itemProb) {
        items.value.push({
          id: itemId++,
          x: target.x,
          y: target.y,
          type: Math.random() < 0.55 ? 'shield' : 'bomb',
        })
      }
      flash(target.elite ? '击落精英机！' : '击落敌机！', '#ffd166')
    }
  }
  playerBullets.value = remainingBullets
}

function resolveEnemyBulletHits() {
  const remainingBullets = []
  for (const bullet of enemyBullets.value) {
    if (distance(bullet.x, bullet.y, playerX.value + 12, playerY.value + 12) < 18) {
      if (shield.value > 0) {
        shield.value--
        flash('护盾抵消', '#67c23a')
      } else {
        playerHP.value--
        flash('中弹！', '#f56c6c')
      }
      if (playerHP.value <= 0) {
        endGame()
        return
      }
      continue
    }
    remainingBullets.push(bullet)
  }
  enemyBullets.value = remainingBullets
}

function resolveItems() {
  const keep = []
  for (const item of items.value) {
    if (distance(item.x, item.y, playerX.value + 12, playerY.value + 12) < 24) {
      if (item.type === 'shield') {
        shield.value = Math.min(2, shield.value + 1)
        flash('获得护盾', '#67c23a')
      } else {
        enemies.value = []
        enemyBullets.value = []
        flash('清屏！', '#409eff')
      }
      continue
    }
    keep.push(item)
  }
  items.value = keep
}

function onKeyDown(e) {
  if (phase.value !== 'playing') return
  if (e.key === 'ArrowLeft') input.left = true
  if (e.key === 'ArrowRight') input.right = true
  if (e.key === 'ArrowUp') input.up = true
  if (e.key === 'ArrowDown') input.down = true
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
  feedbackTimer = setTimeout(() => { feedbackText.value = '' }, 700)
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
