<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '俄罗斯方块' : phase === 'playing' ? '俄罗斯方块 - 游戏中' : '游戏结束'"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">俄罗斯方块</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">← → 移动，↑ 旋转，↓ 加速下落，空格 直接落底！</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKey">
      <div style="display:flex;gap:12px;justify-content:center">
        <!-- Board -->
        <div style="position:relative;width:200px;height:280px;background:#111;border:2px solid #333;border-radius:4px;overflow:hidden">
          <!-- Placed cells -->
          <div v-for="(row, r) in board" :key="r">
            <div v-for="(cell, c) in row" :key="c"
              v-if="cell"
              :style="{
                position:'absolute',
                left: c*20+'px', top: r*20+'px',
                width:'18px', height:'18px',
                background: cell,
                borderRadius:'2px',
                border:'1px solid rgba(255,255,255,0.2)',
              }"
            ></div>
          </div>
          <!-- Current piece -->
          <div v-for="(block, i) in currentBlocks" :key="'b'+i"
            :style="{
              position:'absolute',
              left: block.x*20+'px', top: block.y*20+'px',
              width:'18px', height:'18px',
              background: currentColor,
              borderRadius:'2px',
              border:'1px solid rgba(255,255,255,0.3)',
            }"
          ></div>
          <!-- Ghost piece -->
          <div v-for="(block, i) in ghostBlocks" :key="'g'+i"
            :style="{
              position:'absolute',
              left: block.x*20+'px', top: block.y*20+'px',
              width:'18px', height:'18px',
              background: currentColor,
              borderRadius:'2px',
              opacity:0.2,
            }"
          ></div>
        </div>

        <!-- Side panel -->
        <div style="width:120px">
          <div style="font-size:13px;color:#888;margin-bottom:4px">下一个</div>
          <div style="width:80px;height:60px;background:#111;border:1px solid #333;border-radius:4px;position:relative;margin-bottom:12px">
            <div v-for="(block, i) in nextBlocks" :key="i"
              :style="{
                position:'absolute',
                left: (block.x+1)*16+'px', top: (block.y+1)*16+'px',
                width:'14px', height:'14px',
                background: nextColor,
                borderRadius:'2px',
              }"
            ></div>
          </div>
          <div style="font-size:13px;color:#888;margin-bottom:2px">得分</div>
          <div style="font-size:20px;font-weight:bold;color:#fff;margin-bottom:8px">{{ gameScore }}</div>
          <div style="font-size:13px;color:#888;margin-bottom:2px">消行</div>
          <div style="font-size:18px;font-weight:bold;color:#67c23a;margin-bottom:8px">{{ linesCleared }}</div>
          <div style="font-size:13px;color:#888;margin-bottom:2px">剩余方块</div>
          <div style="font-size:16px;font-weight:bold;color:#fff">{{ Math.max(0, pieceLimit - usedPieces) }}</div>
        </div>
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">得分 {{ gameScore }}，消除 {{ linesCleared }} 行</div>
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
  dropSpeed: { type: Number, default: 1 },
  previewCount: { type: Number, default: 3 },
  garbageProb: { type: Number, default: 0.1 },
  pieceLimit: { type: Number, default: 8 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const COLS = 10, ROWS = 14
const PIECES = [
  { shape: [[1,1,1,1]], color: '#00bcd4' },
  { shape: [[1,1],[1,1]], color: '#ffc107' },
  { shape: [[1,1,1],[0,1,0]], color: '#9c27b0' },
  { shape: [[1,1,1],[1,0,0]], color: '#ff9800' },
  { shape: [[1,1,1],[0,0,1]], color: '#2196f3' },
  { shape: [[1,1,0],[0,1,1]], color: '#4caf50' },
  { shape: [[0,1,1],[1,1,0]], color: '#f44336' },
]

const phase = ref('intro')
const introCountdown = ref(6)
const gameScore = ref(0)
const linesCleared = ref(0)
const usedPieces = ref(0)
const board = ref([])
const currentPiece = ref(null)
const currentX = ref(0)
const currentY = ref(0)
const nextPiece = ref(null)

const currentBlocks = computed(() => pieceToBlocks(currentPiece.value, currentX.value, currentY.value))
const currentColor = computed(() => currentPiece.value?.color || '#fff')
const nextBlocks = computed(() => nextPiece.value ? pieceToBlocks(nextPiece.value, 0, 0) : [])
const nextColor = computed(() => nextPiece.value?.color || '#fff')
const ghostBlocks = computed(() => {
  if (!currentPiece.value) return []
  let gy = currentY.value
  while (!collides(currentPiece.value, currentX.value, gy + 1)) gy++
  return pieceToBlocks(currentPiece.value, currentX.value, gy)
})

let introTimer = null
let dropTimer = null
let garbageTimer = null

const score = computed(() => {
  const l = linesCleared.value
  if (l >= 4) return 5
  if (l >= 3) return 4
  if (l >= 2) return 3
  if (l >= 1) return 2
  if (usedPieces.value > 0) return 1
  return 0
})
const scoreTagType = computed(() => ['danger','','warning','warning','success','success'][score.value])
const resultEmoji = computed(() => ['😢','🥉','🥈','🥇','🏆','🏆'][score.value])

const gameArea = ref(null)

function pieceToBlocks(piece, ox, oy) {
  if (!piece) return []
  const blocks = []
  piece.shape.forEach((row, r) => row.forEach((cell, c) => {
    if (cell) blocks.push({ x: ox + c, y: oy + r })
  }))
  return blocks
}

function collides(piece, ox, oy) {
  return pieceToBlocks(piece, ox, oy).some(b =>
    b.x < 0 || b.x >= COLS || b.y >= ROWS || (b.y >= 0 && board.value[b.y]?.[b.x])
  )
}

function rotatePiece(piece) {
  const rows = piece.shape.length, cols = piece.shape[0].length
  const rotated = Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) => piece.shape[rows - 1 - r][c])
  )
  return { ...piece, shape: rotated }
}

function spawnPiece() {
  currentPiece.value = nextPiece.value || PIECES[Math.floor(Math.random() * PIECES.length)]
  nextPiece.value = PIECES[Math.floor(Math.random() * PIECES.length)]
  currentX.value = Math.floor(COLS / 2) - 1
  currentY.value = 0
  usedPieces.value++
  if (collides(currentPiece.value, currentX.value, currentY.value)) {
    endGame()
  }
}

function lockPiece() {
  const blocks = currentBlocks.value
  const newBoard = board.value.map(r => [...r])
  blocks.forEach(b => {
    if (b.y >= 0) newBoard[b.y][b.x] = currentColor.value
  })
  // Clear full lines
  let cleared = 0
  const filtered = newBoard.filter(row => !row.every(c => c))
  cleared = ROWS - filtered.length
  while (filtered.length < ROWS) filtered.unshift(Array(COLS).fill(null))
  board.value = filtered
  if (cleared > 0) {
    linesCleared.value += cleared
    gameScore.value += [0, 1, 3, 6, 10][Math.min(cleared, 4)]
  }
  spawnPiece()
}

function dropOne() {
  if (!currentPiece.value) return
  if (!collides(currentPiece.value, currentX.value, currentY.value + 1)) {
    currentY.value++
  } else {
    lockPiece()
  }
}

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  gameScore.value = 0
  linesCleared.value = 0
  usedPieces.value = 0
  board.value = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
  currentPiece.value = null
  nextPiece.value = PIECES[Math.floor(Math.random() * PIECES.length)]

  let count = 6
  introTimer = setInterval(() => {
    count--
    introCountdown.value = count
    if (count <= 0) { clearInterval(introTimer); beginPlaying() }
  }, 1000)
}

function beginPlaying() {
  phase.value = 'playing'
  spawnPiece()
  nextTick(() => gameArea.value?.focus())
  const interval = Math.max(100, 800 / props.dropSpeed)
  dropTimer = setInterval(dropOne, interval)
  // Garbage rows
  if (props.garbageProb > 0) {
    garbageTimer = setInterval(() => {
      if (Math.random() < props.garbageProb) {
        const newBoard = board.value.slice(1)
        const garbageRow = Array.from({ length: COLS }, () => Math.random() < 0.7 ? '#555' : null)
        newBoard.push(garbageRow)
        board.value = newBoard
      }
    }, 5000)
  }
}

function onKey(e) {
  if (phase.value !== 'playing' || !currentPiece.value) return
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault()

  if (e.key === 'ArrowLeft' && !collides(currentPiece.value, currentX.value - 1, currentY.value)) currentX.value--
  else if (e.key === 'ArrowRight' && !collides(currentPiece.value, currentX.value + 1, currentY.value)) currentX.value++
  else if (e.key === 'ArrowDown') dropOne()
  else if (e.key === 'ArrowUp') {
    const rotated = rotatePiece(currentPiece.value)
    if (!collides(rotated, currentX.value, currentY.value)) currentPiece.value = rotated
  } else if (e.key === ' ') {
    while (!collides(currentPiece.value, currentX.value, currentY.value + 1)) currentY.value++
    lockPiece()
  }
}

watch(usedPieces, (value) => {
  if (phase.value === 'playing' && value > Math.max(4, Math.round(props.pieceLimit))) {
    endGame()
  }
})

function endGame() {
  clearInterval(dropTimer)
  clearInterval(garbageTimer)
  phase.value = 'result'
  emit('score', score.value)
}

function restart() { clearAll(); startGame() }
function onClosed() { clearAll(); emit('update:modelValue', false) }
function clearAll() {
  clearInterval(introTimer)
  clearInterval(dropTimer)
  clearInterval(garbageTimer)
}
onBeforeUnmount(clearAll)
</script>
