<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'intro' ? '切菜' : phase === 'playing' ? '切菜 - 游戏中' : '游戏结束'"
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="phase === 'result'"
    @closed="onClosed"
  >
    <div v-if="phase === 'intro'" style="text-align:center;padding:24px 0">
      <div style="font-size:22px;font-weight:bold;margin-bottom:12px">切菜</div>
      <div style="font-size:15px;color:#555;margin-bottom:24px">只做一份 4 步短菜谱。左右选食材，空格下刀；如果是特殊步骤，再补一次空格完成连切。</div>
      <div v-if="introCountdown > 3" style="font-size:14px;color:#aaa">即将开始…</div>
      <div v-else style="font-size:56px;font-weight:bold;color:#409eff;line-height:1">{{ introCountdown }}</div>
    </div>

    <div v-else-if="phase === 'playing'" style="outline:none" tabindex="0" ref="gameArea" @keydown="onKeyDown">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span>步骤 {{ currentStep + 1 }} / {{ totalSteps }}</span>
        <span>正确 {{ correctCount }}</span>
        <span>失误 {{ errorCount }} / {{ mistakeLimit }}</span>
      </div>

      <div style="position:relative;width:450px;height:300px;background:linear-gradient(180deg,#f6bd60 0%,#f7ede2 48%,#ddb892 48%,#ddb892 100%);border-radius:12px;overflow:hidden;margin:0 auto">
        <div style="position:absolute;top:16px;left:16px;right:16px;padding:10px 12px;background:rgba(255,255,255,0.75);border-radius:10px">
          <div style="font-size:13px;color:#666;margin-bottom:4px">当前菜谱</div>
          <div style="font-size:18px;font-weight:bold;color:#8d5524">{{ currentRecipeLabel }}</div>
          <div v-if="selectedStep?.mode === 'double'" style="font-size:12px;color:#f56c6c;margin-top:4px">这一步需要连切两下</div>
        </div>

        <div
          v-for="(option, index) in options"
          :key="option.key"
          :style="{
            position:'absolute',
            left:(72 + index * 186)+'px',
            top:'122px',
            width:'120px',
            height:'92px',
            background:selectedOption === index ? '#409eff' : 'rgba(255,255,255,0.8)',
            color:selectedOption === index ? '#fff' : '#8d5524',
            borderRadius:'14px',
            border:selectedOption === index ? '3px solid #1d4ed8' : '2px solid rgba(0,0,0,0.08)',
            display:'flex',
            flexDirection:'column',
            alignItems:'center',
            justifyContent:'center',
            transition:'all 0.08s linear',
          }"
        >
          <div style="font-size:40px;line-height:1">{{ option.emoji }}</div>
          <div style="font-size:14px;font-weight:bold;margin-top:8px">{{ option.name }}</div>
        </div>

        <div v-if="feedbackText" :style="{position:'absolute',bottom:'30px',left:'50%',transform:'translateX(-50%)',fontSize:'22px',fontWeight:'bold',color:feedbackColor,textShadow:'0 2px 8px #fff'}">
          {{ feedbackText }}
        </div>
      </div>

      <div style="text-align:center;margin-top:10px;color:#888;font-size:13px">
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">←</kbd>
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">→</kbd>
        选食材
        &nbsp;|&nbsp;
        <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:4px;border:1px solid #ccc">空格</kbd>
        下刀
      </div>
    </div>

    <div v-else-if="phase === 'result'" style="text-align:center;padding:24px 0">
      <div style="font-size:48px;margin-bottom:12px">{{ resultEmoji }}</div>
      <div style="font-size:22px;font-weight:bold;margin-bottom:8px">游戏结束</div>
      <div style="font-size:16px;color:#555;margin-bottom:16px">正确完成 {{ correctCount }} 步，失误 {{ errorCount }} 次</div>
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
  beltSpeed: { type: Number, default: 2 },
  recipeLength: { type: Number, default: 4 },
  distractRatio: { type: Number, default: 0.2 },
  mistakeLimit: { type: Number, default: 2 },
})
const emit = defineEmits(['update:modelValue', 'score'])

const visible = ref(false)
watch(() => props.modelValue, (v) => { if (v) startGame(); visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const FOODS = [
  { key: 'carrot', emoji: '🥕', name: '胡萝卜' },
  { key: 'onion', emoji: '🧅', name: '洋葱' },
  { key: 'pepper', emoji: '🌶️', name: '辣椒' },
  { key: 'broccoli', emoji: '🥦', name: '西兰花' },
]

const phase = ref('intro')
const introCountdown = ref(6)
const recipe = ref([])
const currentStep = ref(0)
const selectedOption = ref(0)
const options = ref([])
const correctCount = ref(0)
const errorCount = ref(0)
const feedbackText = ref('')
const feedbackColor = ref('#fff')
const awaitingSecondCut = ref(false)

let introTimer = null
let feedbackTimer = null

const totalSteps = computed(() => Math.max(4, Math.min(5, Math.round(props.recipeLength))))
const selectedStep = computed(() => recipe.value[currentStep.value] || null)
const mistakeLimit = computed(() => Math.max(1, Math.round(props.mistakeLimit)))
const currentRecipeLabel = computed(() => {
  const step = selectedStep.value
  if (!step) return '-'
  return `${step.emoji} ${step.name}${step.mode === 'double' ? ' 连切两下' : ' 一刀到位'}`
})

const score = computed(() => {
  const total = recipe.value.length || 1
  const rate = correctCount.value / total
  if (correctCount.value >= total && errorCount.value === 0) return 5
  if (correctCount.value >= total && errorCount.value <= 1) return 4
  if (rate >= 0.75) return 3
  if (rate >= 0.5) return 2
  if (rate >= 0.25) return 1
  return 0
})
const scoreTagType = computed(() => ['danger', '', 'warning', 'warning', 'success', 'success'][score.value])
const resultEmoji = computed(() => ['😢', '🥉', '🥈', '🥇', '🏆', '🏆'][score.value])

const gameArea = ref(null)

function startGame() {
  phase.value = 'intro'
  introCountdown.value = 6
  recipe.value = buildRecipe()
  currentStep.value = 0
  selectedOption.value = 0
  correctCount.value = 0
  errorCount.value = 0
  feedbackText.value = ''
  awaitingSecondCut.value = false
  prepareOptions()

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

function buildRecipe() {
  const list = []
  const total = totalSteps.value
  const specialIndex = Math.random() < 0.65 ? Math.floor(Math.random() * total) : -1
  for (let i = 0; i < total; i++) {
    const food = FOODS[Math.floor(Math.random() * FOODS.length)]
    list.push({ ...food, mode: i === specialIndex ? 'double' : 'single' })
  }
  return list
}

function prepareOptions() {
  const step = selectedStep.value
  if (!step) return
  let distract = FOODS[Math.floor(Math.random() * FOODS.length)]
  while (distract.key === step.key && FOODS.length > 1) distract = FOODS[Math.floor(Math.random() * FOODS.length)]
  options.value = Math.random() < props.distractRatio + 0.4 ? [step, distract] : [distract, step]
  if (Math.random() < 0.5) options.value.reverse()
  selectedOption.value = 0
}

function beginPlaying() {
  phase.value = 'playing'
  nextTick(() => gameArea.value?.focus())
}

function onKeyDown(e) {
  if (phase.value !== 'playing') return
  if (e.key === 'ArrowLeft') selectedOption.value = 0
  if (e.key === 'ArrowRight') selectedOption.value = 1
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault()
    confirmCut()
  }
}

function confirmCut() {
  const step = selectedStep.value
  const option = options.value[selectedOption.value]
  if (!step || !option) return

  if (option.key !== step.key) {
    errorCount.value++
    awaitingSecondCut.value = false
    flash('切错食材！', '#f56c6c')
    if (errorCount.value >= mistakeLimit.value) {
      endGame()
      return
    }
    advanceStep(false)
    return
  }

  if (step.mode === 'double' && !awaitingSecondCut.value) {
    awaitingSecondCut.value = true
    flash('再切一下！', '#ffd166')
    return
  }

  correctCount.value++
  awaitingSecondCut.value = false
  flash(step.mode === 'double' ? '连切完成！' : '切得漂亮！', '#67c23a')
  advanceStep(true)
}

function advanceStep() {
  if (currentStep.value >= recipe.value.length - 1) {
    endGame()
    return
  }
  currentStep.value++
  prepareOptions()
}

function flash(text, color) {
  feedbackText.value = text
  feedbackColor.value = color
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => { feedbackText.value = '' }, 650)
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
