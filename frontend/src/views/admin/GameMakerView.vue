<template>
  <div>
    <!-- Row 1: Game selector + test button -->
    <el-card style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <el-select v-model="selectedGameId" placeholder="选择小游戏" style="width:200px" @change="onGameChange">
          <el-option v-for="g in games" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
        <el-button type="primary" :disabled="!selectedGameId" @click="openTest">游玩测试</el-button>
      </div>
    </el-card>

    <template v-if="selectedGameId">
      <!-- Row 2: Card attribute params (always visible) -->
      <el-card style="margin-bottom:12px">
        <template #header><span style="font-weight:bold">卡牌属性参数</span></template>
        <el-row :gutter="12">
          <el-col :span="6" v-for="p in cardParams" :key="p.key">
            <el-form-item :label="p.label" label-position="top" style="margin-bottom:8px">
              <el-input-number
                v-model="cardValues[p.key]"
                :placeholder="p.placeholder"
                style="width:100%"
                :min="0"
                :max="10000"
              />
              <div style="font-size:11px;color:#999;margin-top:2px">{{ p.desc }}</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <!-- Row 3: Game-specific params (computed from formulas) -->
      <el-card v-if="currentGameDef" style="margin-bottom:12px">
        <template #header><span style="font-weight:bold">游戏参数（计算结果）</span></template>
        <el-row :gutter="12">
          <el-col :span="8" v-for="param in currentGameDef.params" :key="param.key">
            <div style="margin-bottom:12px">
              <div style="font-size:13px;color:#555;margin-bottom:4px">{{ param.label }}</div>
              <el-tag type="info" style="font-size:14px;padding:6px 12px">
                {{ computedParams[param.key] !== undefined ? computedParams[param.key].toFixed(2) : '-' }}
                <span style="font-size:11px;color:#aaa;margin-left:4px">{{ param.unit }}</span>
              </el-tag>
            </div>
          </el-col>
        </el-row>
      </el-card>

      <!-- Row 4: Formula config (editable) -->
      <el-card v-if="currentGameDef" style="margin-bottom:12px">
        <template #header>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-weight:bold">参数公式配置</span>
            <el-button size="small" text @click="resetFormulas">恢复默认</el-button>
          </div>
        </template>
        <div style="font-size:12px;color:#888;margin-bottom:12px">
          可用变量：<code>my_force</code>（我方武力）、<code>my_intellect</code>（我方智力）、<code>my_speed</code>（我方速度）、<code>my_stamina</code>（我方体力）、<code>enemy_force</code>、<code>enemy_intellect</code>、<code>enemy_speed</code>、<code>enemy_stamina</code>
        </div>
        <el-row :gutter="12">
          <el-col :span="12" v-for="param in currentGameDef.params" :key="param.key">
            <el-form-item :label="param.label + ' 公式'" label-position="top" style="margin-bottom:12px">
              <el-input
                v-model="formulaInputs[param.key]"
                :placeholder="param.defaultFormula"
                @input="onFormulaInput"
              />
              <div style="font-size:11px;color:#999;margin-top:2px">{{ param.formulaDesc }}</div>
            </el-form-item>
          </el-col>
        </el-row>
        <div v-if="formulaError" style="color:#f56c6c;font-size:12px;margin-top:4px">{{ formulaError }}</div>
      </el-card>

      <!-- Row 5: Save config -->
      <el-card v-if="currentGameDef" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:12px">
          <el-button type="success" :loading="saving" @click="saveConfig">保存公式配置</el-button>
          <span style="font-size:12px;color:#888">保存后，小游戏在实际使用时将用这些公式计算难度参数</span>
        </div>
      </el-card>

      <!-- Row 6: Test game button -->
      <el-card v-if="currentGameDef">
        <div style="display:flex;align-items:center;gap:12px">
          <el-button type="primary" size="large" @click="openTest">
            ▶ 测试游戏：{{ currentGameDef.name }}
          </el-button>
          <span v-if="lastScore !== null" style="font-size:14px;color:#555">
            上次得分：<el-tag :type="lastScore >= 4 ? 'success' : lastScore >= 2 ? 'warning' : 'danger'">{{ lastScore }} / 5</el-tag>
          </span>
        </div>
      </el-card>
    </template>

    <!-- Archery game dialog -->
    <ArcheryGame
      v-if="selectedGame?.game_key === 'archery'"
      v-model="gameVisible"
      :swing-speed="computedParams.swing_speed ?? 1"
      :time-limit="computedParams.time_limit ?? 5"
      @score="onScore"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getGames, getGame, saveGame } from '../../api/games'
import ArcheryGame from '../../components/games/ArcheryGame.vue'

// Card attribute params definition
const cardParams = [
  { key: 'my_force',       label: '我方武力',   placeholder: '如：80', desc: '我方卡牌武力值' },
  { key: 'my_intellect',   label: '我方智力',   placeholder: '如：60', desc: '我方卡牌智力值' },
  { key: 'my_speed',       label: '我方速度',   placeholder: '如：70', desc: '我方卡牌速度值' },
  { key: 'my_stamina',     label: '我方体力',   placeholder: '如：90', desc: '我方卡牌体力值' },
  { key: 'enemy_force',    label: '敌方武力',   placeholder: '如：70', desc: '敌方卡牌武力值' },
  { key: 'enemy_intellect',label: '敌方智力',   placeholder: '如：50', desc: '敌方卡牌智力值' },
  { key: 'enemy_speed',    label: '敌方速度',   placeholder: '如：60', desc: '敌方卡牌速度值' },
  { key: 'enemy_stamina',  label: '敌方体力',   placeholder: '如：80', desc: '敌方卡牌体力值' },
]

// Game definitions (client-side metadata)
const GAME_DEFS = {
  archery: {
    name: '射箭',
    params: [
      {
        key: 'swing_speed',
        label: '晃动速度',
        unit: '秒/来回',
        defaultFormula: '1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))',
        formulaDesc: '数值越小晃动越快，最低约0.3秒一个来回',
      },
      {
        key: 'time_limit',
        label: '剩余时间',
        unit: '秒',
        defaultFormula: '5*(1+(my_force-enemy_force)/enemy_force)',
        formulaDesc: '游戏总时长，我方武力越高时间越充裕',
      },
    ],
  },
}

const games = ref([])
const selectedGameId = ref(null)
const selectedGame = ref(null)
const saving = ref(false)
const gameVisible = ref(false)
const lastScore = ref(null)
const formulaError = ref('')

const cardValues = reactive({
  my_force: 80,
  my_intellect: 60,
  my_speed: 70,
  my_stamina: 90,
  enemy_force: 70,
  enemy_intellect: 50,
  enemy_speed: 60,
  enemy_stamina: 80,
})

const formulaInputs = reactive({})

const currentGameDef = computed(() => {
  if (!selectedGame.value) return null
  return GAME_DEFS[selectedGame.value.game_key] || null
})

const computedParams = computed(() => {
  if (!currentGameDef.value) return {}
  const vars = { ...cardValues }
  const allowedKeys = Object.keys(vars)
  const result = {}
  for (const param of currentGameDef.value.params) {
    const formula = formulaInputs[param.key] || param.defaultFormula
    try {
      // Restrict scope to card variable names only
      const fn = new Function(...allowedKeys, `"use strict"; return (${formula})`)
      const val = fn(...allowedKeys.map(k => vars[k]))
      result[param.key] = typeof val === 'number' && isFinite(val) ? Math.max(0.1, val) : 0
    } catch {
      result[param.key] = 0
    }
  }
  formulaError.value = ''
  return result
})

function onFormulaInput() {
  // Trigger recompute — computed handles it reactively
}

function resetFormulas() {
  if (!currentGameDef.value) return
  for (const param of currentGameDef.value.params) {
    formulaInputs[param.key] = param.defaultFormula
  }
}

async function onGameChange(id) {
  if (!id) { selectedGame.value = null; return }
  try {
    const g = await getGame(id)
    selectedGame.value = g
    const config = g.formula_config && typeof g.formula_config === 'object' ? g.formula_config : {}
    if (currentGameDef.value) {
      for (const param of currentGameDef.value.params) {
        formulaInputs[param.key] = config[param.key] || param.defaultFormula
      }
    }
  } catch (e) {
    ElMessage.error(e.message || '读取游戏配置失败')
  }
}

async function saveConfig() {
  if (!selectedGame.value || !currentGameDef.value) return
  saving.value = true
  try {
    const formula_config = {}
    for (const param of currentGameDef.value.params) {
      formula_config[param.key] = formulaInputs[param.key] || param.defaultFormula
    }
    await saveGame(selectedGame.value.id, { formula_config })
    ElMessage.success('公式配置已保存')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function openTest() {
  gameVisible.value = true
}

function onScore(s) {
  lastScore.value = s
}

onMounted(async () => {
  try {
    games.value = await getGames()
    if (games.value.length) {
      selectedGameId.value = games.value[0].id
      await onGameChange(games.value[0].id)
    }
  } catch (e) {
    ElMessage.error(e.message || '读取游戏列表失败')
  }
})
</script>
