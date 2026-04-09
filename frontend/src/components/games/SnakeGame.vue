<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '贪吃蛇' : phase === 'playing' ? '贪吃蛇 - 游戏中' : '游戏结束'"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">贪吃蛇</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">用方向键控制蛇吃食物，别撞墙或咬到自己！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKey">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span>食物：{{ gameScore }} / {{ targetFoodCount }}</span>
        <span>长度：{{ snake.length }}</span>
        <span>{{ goldFood ? '金色食物出现中' : '规划短路线' }}</span>
      </div>

      <!-- Grid -->
      <div style="position:relative;width:420px;height:280px;background:#1a1a2e;border-radius:12px;overflow:hidden;margin:0 auto;border:2px solid #333">
        <!-- Snake segments -->
        <div
          v-for="(seg, i) in snake"
          :key="i"
          :style="{
            position:'absolute',
            left: seg.x * CELL + 'px',
            top: seg.y * CELL + 'px',
            width: CELL + 'px',
            height: CELL + 'px',
            background: i === 0 ? '#67c23a' : '#4a9e2a',
            borderRadius: i === 0 ? '4px' : '2px',
            fontSize: i === 0 ? '14px' : '10px',
            display:'flex',alignItems:'center',justifyContent:'center',
          }"
        >{{ i === 0 ? '🐍' : '' }}</div>

        <!-- Food -->
        <div v-if="food" :style="{
          position:'absolute',
          left: food.x * CELL + 'px',
          top: food.y * CELL + 'px',
          width: CELL + 'px',
          height: CELL + 'px',
          fontSize:'16px',
          display:'flex',alignItems:'center',justifyContent:'center',
        }">{{ food.emoji }}</div>
        <div v-if="goldFood" :style="{
          position:'absolute',
          left: goldFood.x * CELL + 'px',
          top: goldFood.y * CELL + 'px',
          width: CELL + 'px',
          height: CELL + 'px',
          fontSize:'16px',
          display:'flex',alignItems:'center',justifyContent:'center',
          filter:'drop-shadow(0 0 6px #ffd166)',
        }">⭐</div>

        <!-- Obstacles -->
        <div v-for="(obs, i) in obstacles" :key="'o'+i" :style="{
          position:'absolute',
          left: obs.x * CELL + 'px',
          top: obs.y * CELL + 'px',
          width: CELL + 'px',
          height: CELL + 'px',
          background:'#555',
          borderRadius:'2px',
          fontSize:'12px',
          display:'flex',alignItems:'center',justifyContent:'center',
        }">🧱</div>

        <!-- Game over overlay -->
        <div v-if="dead" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:#f56c6c">
          撞了！
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        方向键控制方向
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">得分 {{ gameScore }}，蛇长 {{ snake.length }}</div>
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
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  moveSpeed: { type: Number, default: 4 },
  obstacleFreq: { type: Number, default: 0.25 },
  goldDuration: { type: Number, default: 2 },
  targetFoodCount: { type: Number, default: 5 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const CELL = 20
const COLS = 21
const ROWS = 14
const FOODS = ['🍎','🍊','🍇','⭐','💎']

const phase = ref('intro')
const introCountdown = ref(6)
const gameScore = ref(0)
const snake = ref([])
const food = ref(null)
const goldFood = ref(null)
const obstacles = ref([])
const dead = ref(false)

let introTimer = null
let moveTimer = null
let dir = { x: 1, y: 0 }
let nextDir = { x: 1, y: 0 }
let goldTimer = null

const score = computed(() => {
  const s = gameScore.value
  if (s >= Math.max(5, Math.round(props.targetFoodCount)) + 1) return 5
  if (s >= Math.max(5, Math.round(props.targetFoodCount))) return 4
  if (s >= 4) return 3
  if (s >= 3) return 2
  if (s >= 2) return 1
  return 0
})
const scoreTagType = computed(() => ['danger','','warning','warning','success','success'][score.value])
const resultEmoji = computed(() => ['😢','🥉','🥈','🥇','🏆','🏆'][score.value])

const gameArea = ref(null)

function randCell(exclude = []) {
  let cell
  do {
    cell = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }
  } while (exclude.some(e => e.x === cell.x && e.y === cell.y))
  return cell
}

function spawnFood() {
  const exclude = [...snake.value, ...obstacles.value]
  const pos = randCell(exclude)
  food.value = { ...pos, emoji: FOODS[Math.floor(Math.random() * FOODS.length)] }
}

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  gameScore.value = 0
  dead.value = false
  dir = { x: 1, y: 0 }
  nextDir = { x: 1, y: 0 }
  snake.value = [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }]
  obstacles.value = []
  food.value = null
  goldFood.value = null

  let count = 6
  introTimer = setInterval(() => {
    count--
    introCountdown.value = count
    if (count <= 0) { clearInterval(introTimer); beginPlaying() }
  }, 1000)
}

function beginPlaying() {
  phase.value = 'playing'
  spawnFood()
  nextTick(() => gameArea.value?.focus())
  const interval = Math.max(80, 1000 / props.moveSpeed)
  moveTimer = setInterval(moveSnake, interval)
  maybeSpawnGoldFood()
}

function moveSnake() {
  if (dead.value) return
  dir = { ...nextDir }
  const head = snake.value[0]
  const newHead = { x: head.x + dir.x, y: head.y + dir.y }

  // Wall collision
  if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
    dead.value = true; setTimeout(endGame, 600); return
  }
  // Self collision
  if (snake.value.some(s => s.x === newHead.x && s.y === newHead.y)) {
    dead.value = true; setTimeout(endGame, 600); return
  }
  // Obstacle collision
  if (obstacles.value.some(o => o.x === newHead.x && o.y === newHead.y)) {
    dead.value = true; setTimeout(endGame, 600); return
  }

  const newSnake = [newHead, ...snake.value]

  // Eat food
  if (food.value && newHead.x === food.value.x && newHead.y === food.value.y) {
    gameScore.value++
    // Maybe spawn obstacle
    if (Math.random() < props.obstacleFreq) {
      const obs = randCell([...newSnake, ...(food.value ? [food.value] : []), ...obstacles.value])
      obstacles.value = [...obstacles.value, obs]
    }
    spawnFood()
    maybeSpawnGoldFood()
  } else if (goldFood.value && newHead.x === goldFood.value.x && newHead.y === goldFood.value.y) {
    gameScore.value += 1
    goldFood.value = null
  } else {
    newSnake.pop()
  }

  snake.value = newSnake
  if (gameScore.value >= Math.max(3, Math.round(props.targetFoodCount))) endGame()
}

function onKey(e) {
  if (phase.value !== 'playing') return
  const map = { ArrowUp: {x:0,y:-1}, ArrowDown: {x:0,y:1}, ArrowLeft: {x:-1,y:0}, ArrowRight: {x:1,y:0} }
  const d = map[e.key]
  if (!d) return
  e.preventDefault()
  // Prevent reversing
  if (d.x === -dir.x && d.y === -dir.y) return
  nextDir = d
}

function endGame() {
  clearInterval(moveTimer)
  clearTimeout(goldTimer)
  phase.value = 'result'
  emit('score', score.value)
}

function maybeSpawnGoldFood() {
  clearTimeout(goldTimer)
  if (Math.random() < 0.45) {
    const exclude = [...snake.value, ...obstacles.value, ...(food.value ? [food.value] : [])]
    goldFood.value = randCell(exclude)
    goldTimer = setTimeout(() => { goldFood.value = null }, Math.max(1000, props.goldDuration * 1000))
  }
}

function restart() { clearAll(); startGame() }
function onClosed() { clearAll(); emit('update:modelValue', false) }
function clearAll() {
  clearInterval(introTimer)
  clearInterval(moveTimer)
  clearTimeout(goldTimer)
}
onBeforeUnmount(clearAll)
</script>
