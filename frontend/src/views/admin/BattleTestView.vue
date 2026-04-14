<template>
  <div>
    <el-card style="margin-bottom:12px">
      <template #header><span style="font-weight:bold">电脑卡组（4张）</span></template>
      <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div
          v-for="(slot, i) in 4"
          :key="'cpu-' + i"
          style="display:flex;flex-direction:column;align-items:center;gap:6px"
        >
          <div
            :draggable="!!cpuCards[i]"
            @dragstart="onDragStart('cpu', i)"
            @dragover.prevent
            @drop="onDrop('cpu', i)"
            style="cursor:pointer"
            @click="openPicker('cpu', i)"
          >
            <CardPreview
              v-if="cpuCards[i]"
              :attribute="cpuCards[i]"
              :design="sharedDesign"
              :webp-path="cpuCards[i].webp_paths && cpuCards[i].webp_paths[0]"
              :width="188"
              :is-captain="i === 0"
            />
            <div v-else :style="emptySlotStyle">
              <el-icon style="font-size:24px;color:#ccc"><Plus /></el-icon>
              <div style="font-size:11px;color:#aaa;margin-top:4px">{{ i === 0 ? '队长' : '牌位' + (i+1) }}</div>
            </div>
          </div>
          <div style="font-size:11px;color:#666">{{ i === 0 ? '队长' : '牌位' + (i+1) }}</div>
        </div>
        <el-button style="align-self:center" @click="openPickerBatch('cpu')">批量选择</el-button>
      </div>
    </el-card>

    <el-card style="margin-bottom:12px">
      <template #header><span style="font-weight:bold">玩家卡组（4张）</span></template>
      <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div
          v-for="(slot, i) in 4"
          :key="'player-' + i"
          style="display:flex;flex-direction:column;align-items:center;gap:6px"
        >
          <div
            :draggable="!!playerCards[i]"
            @dragstart="onDragStart('player', i)"
            @dragover.prevent
            @drop="onDrop('player', i)"
            style="cursor:pointer"
            @click="openPicker('player', i)"
          >
            <CardPreview
              v-if="playerCards[i]"
              :attribute="playerCards[i]"
              :design="sharedDesign"
              :webp-path="playerCards[i].webp_paths && playerCards[i].webp_paths[0]"
              :width="188"
              :is-captain="i === 0"
            />
            <div v-else :style="emptySlotStyle">
              <el-icon style="font-size:24px;color:#ccc"><Plus /></el-icon>
              <div style="font-size:11px;color:#aaa;margin-top:4px">{{ i === 0 ? '队长' : '牌位' + (i+1) }}</div>
            </div>
          </div>
          <div style="font-size:11px;color:#666">{{ i === 0 ? '队长' : '牌位' + (i+1) }}</div>
        </div>
        <el-button style="align-self:center" @click="openPickerBatch('player')">批量选择</el-button>
      </div>
    </el-card>

    <el-card>
      <el-button
        type="primary"
        size="large"
        :disabled="cpuCards.filter(Boolean).length < 4 || playerCards.filter(Boolean).length < 4"
        @click="startBattle"
      >开始测试</el-button>
      <span style="margin-left:12px;font-size:12px;color:#999">需要双方各选满4张卡牌</span>
    </el-card>

     <el-dialog
      v-model="battleDialogVisible"
      :title="phase === 'result' ? '对战结果' : '对战测试'"
      width="1320px"
      top="4vh"
      :close-on-click-modal="false"
      :close-on-press-escape="true"
      :show-close="true"
      @closed="onBattleDialogClosed"
    >
      <div style="max-height:78vh;overflow-y:auto;padding-right:4px">
        <el-alert
          v-if="phase === 'battle' || phase === 'result'"
          title="当前测试模式已暂时关闭小游戏加载，双方回合都会自动模拟得分。"
          type="info"
          :closable="false"
          style="margin-bottom:12px"
        />

        <template v-if="phase === 'battle' || phase === 'result'">
          <el-card style="margin-bottom:12px">
            <template #header>
              <div style="display:flex;align-items:center;justify-content:space-between">
                <span style="font-weight:bold">对战场地</span>
                <el-tag v-if="phase === 'result'" :type="resultTag">{{ resultText }}</el-tag>
                <span v-else style="font-size:13px;color:#666">第 {{ roundNum }} 轮 · {{ turnLabel }}</span>
              </div>
            </template>

            <div v-if="dicePhase" style="text-align:center;padding:24px 0">
              <div style="font-size:15px;color:#666;margin-bottom:12px">掷骰子决定先后手（1-20）</div>
              <div style="display:flex;justify-content:center;gap:48px;margin-bottom:16px">
                <div style="text-align:center">
                  <div style="font-size:13px;color:#666;margin-bottom:6px">电脑</div>
                  <div :style="diceStyle(cpuDiceRoll, diceRolling)">{{ diceRolling ? diceAnim : (cpuDiceRoll || '?') }}</div>
                </div>
                <div style="text-align:center">
                  <div style="font-size:13px;color:#666;margin-bottom:6px">玩家</div>
                  <div :style="diceStyle(playerDiceRoll, diceRolling)">{{ diceRolling ? diceAnim : (playerDiceRoll || '?') }}</div>
                </div>
              </div>
               <div v-if="!diceRolling && cpuDiceRoll && playerDiceRoll" style="font-size:15px;font-weight:bold;color:#409eff;margin-bottom:16px">
                 {{ cpuDiceRoll === playerDiceRoll ? '平局，重新掷骰！' : (cpuDiceRoll > playerDiceRoll ? '电脑先手' : '玩家先手') }}
               </div>
             </div>

            <div v-else>
              <div style="font-size:13px;color:#666;text-align:center;margin-bottom:8px">电脑</div>
              <div style="overflow-x:auto;padding-bottom:8px;margin-bottom:16px">
                <div style="display:flex;gap:14px;justify-content:center;min-width:max-content">
                  <div
                    v-for="(card, i) in battleCpuCards"
                    :key="'bc-' + i"
                    :style="battleCardWrapStyle('cpu', i)"
                  >
                    <CardPreview
                      :attribute="card"
                      :design="sharedDesign"
                      :webp-path="card && card.webp_paths && card.webp_paths[0]"
                      :width="375"
                      :is-captain="i === 0"
                      :show-hp="true"
                      :current-hp="cpuHp[i]"
                      :max-hp="card ? (card.stamina_value || 100) : 100"
                      :is-dead="cpuHp[i] <= 0"
                    />
                    <el-tag v-if="cpuPlaying && currentSlot === i && currentTurn === 'cpu'" size="small" type="warning">进行中</el-tag>
                  </div>
                </div>
              </div>

              <el-divider style="margin:8px 0 14px" />

              <div style="font-size:13px;color:#666;text-align:center;margin-bottom:8px">玩家</div>
              <div style="overflow-x:auto;padding-bottom:8px">
                <div style="display:flex;gap:14px;justify-content:center;min-width:max-content">
                  <div
                    v-for="(card, i) in battlePlayerCards"
                    :key="'bp-' + i"
                    :style="battleCardWrapStyle('player', i)"
                  >
                    <CardPreview
                      :attribute="card"
                      :design="sharedDesign"
                      :webp-path="card && card.webp_paths && card.webp_paths[0]"
                      :width="375"
                      :is-captain="i === 0"
                      :show-hp="true"
                      :current-hp="playerHp[i]"
                      :max-hp="card ? (card.stamina_value || 100) : 100"
                      :is-dead="playerHp[i] <= 0"
                    />
                    <el-tag v-if="cpuPlaying && currentSlot === i && currentTurn === 'player'" size="small" type="success">进行中</el-tag>
                  </div>
                </div>
              </div>
            </div>
          </el-card>

          <el-card v-if="cpuPlaying && phase === 'battle'" style="margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:10px;color:#909399">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>{{ simulationStatusText }}</span>
            </div>
          </el-card>

          <el-card>
            <template #header><span style="font-weight:bold">对战日志</span></template>
            <div ref="logRef" style="max-height:280px;overflow-y:auto;font-size:13px;line-height:1.8">
              <div v-for="(entry, i) in battleLog" :key="i" :style="logStyle(entry)">{{ entry.text }}</div>
              <div v-if="battleLog.length === 0" style="color:#aaa">等待开始…</div>
            </div>
          </el-card>
        </template>
      </div>

      <template #footer>
        <div v-if="phase === 'result'" style="display:flex;justify-content:center;gap:12px">
          <el-button @click="battleDialogVisible = false">关闭</el-button>
          <el-button type="primary" @click="restartBattle">再来一局</el-button>
        </div>
      </template>
    </el-dialog>

     <!-- Card picker dialog (single slot) -->
     <el-dialog v-model="pickerVisible" title="选择卡牌" width="960px" :close-on-click-modal="false" @open="onPickerOpen">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <el-input v-model="pickerFilter.keyword" placeholder="搜索名字/系列/阵营..." clearable style="width:200px" @input="pickerPage = 1" />
        <el-select v-model="pickerFilter.faction_name" placeholder="阵营" clearable style="width:120px" @change="pickerPage = 1">
          <el-option v-for="o in pickerOptions.factions" :key="o" :label="o" :value="o" />
        </el-select>
        <el-select v-model="pickerFilter.rarity" placeholder="稀有度" clearable style="width:100px" @change="pickerPage = 1">
          <el-option v-for="o in pickerOptions.rarities" :key="o" :label="o" :value="o" />
        </el-select>
        <el-select v-model="pickerFilter.series_name" placeholder="系列" clearable style="width:130px" @change="pickerPage = 1">
          <el-option v-for="o in pickerOptions.series" :key="o" :label="o" :value="o" />
        </el-select>
        <el-select v-model="pickerSort.field" placeholder="排序字段" style="width:130px" @change="pickerPage = 1">
          <el-option label="人物ID" value="character_id" />
          <el-option label="名字" value="name" />
          <el-option label="稀有度" value="rarity" />
          <el-option label="武力" value="force_value" />
          <el-option label="智力" value="intellect_value" />
          <el-option label="速度" value="speed_value" />
          <el-option label="体力" value="stamina_value" />
        </el-select>
        <el-select v-model="pickerSort.order" placeholder="排序方式" style="width:110px" @change="pickerPage = 1">
          <el-option label="升序" value="asc" />
          <el-option label="降序" value="desc" />
        </el-select>
      </div>
      <div v-loading="pickerLoading" style="min-height:200px">
        <div style="display:flex;flex-wrap:wrap;gap:18px 16px;align-items:flex-start">
          <div
            v-for="card in pickerPaged"
            :key="card.character_id"
            style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;padding:8px;border-radius:12px"
            @click="confirmPickerCard(card)"
          >
             <CardPreview
               :attribute="card"
               :design="sharedDesign"
               :webp-path="card.webp_paths && card.webp_paths[0]"
               :width="188"
             />
             <div style="text-align:center">
               <div style="color:#333;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:188px">{{ card.name }}</div>
              <div style="color:#666;font-size:10px">{{ card.rarity }}</div>
            </div>
          </div>
        </div>
        <el-empty v-if="!pickerLoading && pickerFiltered.length === 0" description="没有找到卡牌" />
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <el-pagination v-model:current-page="pickerPage" :page-size="20" :total="pickerFiltered.length" layout="total, prev, pager, next" small />
      </div>
    </el-dialog>

    <!-- Batch picker dialog -->
    <CardPickerDialog
      v-model="batchPickerVisible"
      :initial-selected="batchTarget === 'cpu' ? cpuCards.filter(Boolean) : playerCards.filter(Boolean)"
      :design="sharedDesign"
      @confirm="onBatchConfirm"
    />

  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { Plus, Loading } from '@element-plus/icons-vue'
import { getCardAttributeOptions, getCardMakerCharacters, getCardMakerGlobalDesign } from '../../api/cards'
import { getGames } from '../../api/games'
import { buildAssetUrl } from '../../api/runtime'
import CardPreview from '../../components/battle/CardPreview.vue'
import CardPickerDialog from '../../components/battle/CardPickerDialog.vue'

// ── GAME DEFS (公式定义，与 GameMakerView 保持一致) ──────────────────────────
const GAME_DEFS = {
  archery:    { name:'射箭',    params:[{key:'swing_speed',df:'1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))'},{key:'time_limit',df:'5*(1+(my_force-enemy_force)/enemy_force)'}] },
  soccer:     { name:'足球',    params:[{key:'goalkeeper_speed',df:'1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))'},{key:'swing_speed',df:'1*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'time_limit',df:'10*(1+(my_force-enemy_force)/enemy_force)'}] },
  tennis:     { name:'网球',    params:[{key:'ball_speed',df:'1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))'},{key:'landing_range',df:'0.5*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'time_limit',df:'15*(1+(my_force-enemy_force)/enemy_force)'}] },
  golf:       { name:'高尔夫',  params:[{key:'power_speed',df:'1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))'},{key:'green_zone',df:'0.3*(1+(my_intellect-enemy_intellect)/enemy_intellect)'},{key:'time_limit',df:'10*(1+(my_force-enemy_force)/enemy_force)'}] },
  swimming:   { name:'游泳',    params:[{key:'opponent_speed',df:'1*(1+(enemy_speed-my_speed)/my_speed)'},{key:'rhythm_window',df:'0.5*(1-(my_intellect-enemy_intellect)/(my_intellect+enemy_intellect))'},{key:'time_limit',df:'15*(1+(my_stamina-enemy_stamina)/enemy_stamina)'}] },
  running:    { name:'跑步',    params:[{key:'opponent_base_speed',df:'5*(1+(enemy_speed-my_speed)/my_speed)'},{key:'overtake_window_count',df:'3*(1+0.5*(enemy_intellect-my_intellect)/my_intellect)'},{key:'stamina_drain_rate',df:'1*(1+(enemy_stamina-my_stamina)/my_stamina)'},{key:'sprint_reserve',df:'2.5*(1+(my_force-enemy_force)/enemy_force)'}] },
  gymnastics: { name:'体操',    params:[{key:'sequence_length',df:'3*(1+0.5*(enemy_intellect-my_intellect)/my_intellect)'},{key:'beat_speed',df:'1*(1+(enemy_speed-my_speed)/my_speed)'},{key:'balance_speed',df:'1*(1+(enemy_stamina-my_stamina)/my_stamina)'},{key:'judge_window',df:'0.3*(1+(my_intellect-enemy_intellect)/enemy_intellect)'}] },
  boxing:     { name:'拳击',    params:[{key:'punch_interval',df:'1.2*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))'},{key:'fake_prob',df:'0.2*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'counter_window',df:'0.5*(1+(my_force-enemy_force)/enemy_force)'},{key:'exchange_count',df:'6*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)'}] },
  equestrian: { name:'马术',    params:[{key:'obstacle_interval',df:'2*(1+(my_intellect-enemy_intellect)/enemy_intellect)'},{key:'jump_window',df:'0.4*(1+(my_speed-enemy_speed)/enemy_speed)'},{key:'horse_restless',df:'1*(1+(enemy_stamina-my_stamina)/my_stamina)'},{key:'obstacle_count',df:'8*(1+(enemy_stamina-my_stamina)/my_stamina)'}] },
  racing:     { name:'赛车',    params:[{key:'curve_count',df:'3*(1+0.5*(enemy_intellect-my_intellect)/my_intellect)'},{key:'grip',df:'1*(1+(my_speed-enemy_speed)/enemy_speed)'},{key:'drift_window',df:'0.35*(1+(my_intellect-enemy_intellect)/enemy_intellect)'},{key:'collision_tolerance',df:'2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'}] },
  chopping:   { name:'切菜',    params:[{key:'belt_speed',df:'2*(1+(enemy_speed-my_speed)/my_speed)'},{key:'recipe_length',df:'4*(1+0.5*(enemy_intellect-my_intellect)/my_intellect)'},{key:'distract_ratio',df:'0.2*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'mistake_limit',df:'2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'}] },
  guitar:     { name:'吉他',    params:[{key:'chord_preview_time',df:'1.2*(1+(my_intellect-enemy_intellect)/enemy_intellect)'},{key:'strum_density',df:'4*(1+(enemy_speed-my_speed)/my_speed)'},{key:'fill_length',df:'3*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'section_length',df:'2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'}] },
  nosehair:   { name:'拔鼻毛',  params:[{key:'hair_swing',df:'1*(1+(enemy_speed-my_speed)/my_speed)'},{key:'clamp_width',df:'20*(1+(my_intellect-enemy_intellect)/enemy_intellect)'},{key:'root_firmness',df:'1*(1+(enemy_force-my_force)/my_force)'},{key:'target_count',df:'3*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)'}] },
  volleyball: { name:'垫球',    params:[{key:'toss_speed',df:'4*(1+(enemy_speed-my_speed)/my_speed)'},{key:'target_window_width_value',df:'18*(1+(my_intellect-enemy_intellect)/enemy_intellect)'},{key:'spin_drift',df:'0.15*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'target_ball_count',df:'5*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)'}] },
  jumprope:   { name:'跳绳',    params:[{key:'rope_speed',df:'1*(1+(enemy_speed-my_speed)/my_speed)'},{key:'speed_change_freq',df:'0.2*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'jump_window',df:'0.22*(1+(my_stamina-enemy_stamina)/enemy_stamina)'},{key:'target_jump_count',df:'12*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'}] },
  snake:      { name:'贪吃蛇',  params:[{key:'move_speed',df:'4*(1+(enemy_speed-my_speed)/my_speed)'},{key:'obstacle_freq',df:'0.25*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'gold_duration',df:'2*(1+(my_intellect-enemy_intellect)/enemy_intellect)'},{key:'target_food_count',df:'5*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'}] },
  tetris:     { name:'俄罗斯方块',params:[{key:'drop_speed',df:'1*(1+(enemy_speed-my_speed)/my_speed)'},{key:'preview_count',df:'3*(1+(my_intellect-enemy_intellect)/enemy_intellect)'},{key:'garbage_prob',df:'0.1*(1+(enemy_force-my_force)/my_force)'},{key:'piece_limit',df:'8*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'}] },
  breakout:   { name:'打砖块',  params:[{key:'initial_ball_count',df:'10*(1+(my_speed-enemy_speed)/enemy_speed)'},{key:'brick_hp',df:'3*(1+(enemy_force-my_force)/my_force)'},{key:'obstacle_ratio',df:'0.15*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'round_count',df:'4*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'}] },
  pinball:    { name:'弹球',    params:[{key:'launch_speed',df:'5*(1+(enemy_speed-my_speed)/my_speed)'},{key:'drain_width',df:'0.15*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'multiplier_freq',df:'0.25*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'ball_count',df:'2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'},{key:'target_count',df:'3*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)'}] },
  tank:       { name:'坦克',    params:[{key:'enemy_aim_speed',df:'1*(1+(enemy_speed-my_speed)/my_speed)'},{key:'shell_speed',df:'6*(1+(enemy_force-my_force)/my_force)'},{key:'cover_count',df:'6*(1+(my_intellect-enemy_intellect)/enemy_intellect)'},{key:'battle_hp',df:'2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'}] },
  airplane:   { name:'飞机',    params:[{key:'bullet_density',df:'3*(1+(enemy_speed-my_speed)/my_speed)'},{key:'item_prob',df:'0.2*(1+(my_intellect-enemy_intellect)/enemy_intellect)'},{key:'elite_freq',df:'0.167*(1+(enemy_force-my_force)/my_force)'},{key:'wave_count',df:'3*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'}] },
  coincatch:  { name:'接金币',  params:[{key:'drop_speed',df:'4*(1+(enemy_speed-my_speed)/my_speed)'},{key:'trap_ratio',df:'0.2*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'move_inertia',df:'0.15*(1+(enemy_stamina-my_stamina)/my_stamina)'},{key:'drop_count',df:'12*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'}] },
  fruitslice: { name:'切水果',  params:[{key:'throw_freq',df:'3*(1+(enemy_speed-my_speed)/my_speed)'},{key:'bomb_ratio',df:'0.15*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'combo_window',df:'0.8*(1+(my_speed-enemy_speed)/enemy_speed)'},{key:'throw_rounds',df:'4*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'}] },
  pianotiles: { name:'钢琴块',  params:[{key:'drop_speed',df:'4*(1+(enemy_speed-my_speed)/my_speed)'},{key:'double_tap_prob',df:'0.1*(1+(enemy_intellect-my_intellect)/my_intellect)'},{key:'hold_ratio',df:'0.2*(1+(enemy_stamina-my_stamina)/my_stamina)'},{key:'pattern_length',df:'16*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)'}] },
}

const RARITY_SORT_ORDER = ['N', 'R', 'CP', 'SR', 'SSR', 'PR', 'HR', 'UR']
const rarityRankMap = Object.fromEntries(RARITY_SORT_ORDER.map((item, index) => [item, index]))

// ── STATE ────────────────────────────────────────────────────────────────────
const phase = ref('setup') // setup | battle | result
const battleDialogVisible = ref(false)
const cpuCards = ref([null, null, null, null])
const playerCards = ref([null, null, null, null])
const sharedDesign = ref(null)
const allGames = ref([])

// Setup drag state
const dragState = reactive({ side: '', index: -1 })

// Battle state
const battleCpuCards = ref([])
const battlePlayerCards = ref([])
const cpuHp = ref([0, 0, 0, 0])
const playerHp = ref([0, 0, 0, 0])
const roundNum = ref(1)
const currentTurn = ref('player') // player | cpu
const currentSlot = ref(-1)
const activeBoardSlot = ref(-1)
const cpuPlaying = ref(false)
const battleLog = ref([])
const logRef = ref(null)

// Dice
const dicePhase = ref(false)
const diceRolling = ref(false)
const diceAnim = ref('?')
const cpuDiceRoll = ref(0)
const playerDiceRoll = ref(0)

// Turn queue: list of {side, slot} to process this round

// Picker (single slot)
const pickerVisible = ref(false)
const pickerTarget = reactive({ side: '', index: -1 })
const pickerLoading = ref(false)
const pickerAllCards = ref([])
const pickerOptions = reactive({ series: [], factions: [], rarities: [], elements: [] })
const pickerFilter = reactive({ keyword: '', rarity: '', series_name: '', faction_name: '' })
const pickerSort = reactive({ field: 'character_id', order: 'asc' })
const pickerPage = ref(1)

// Batch picker
const batchPickerVisible = ref(false)
const batchTarget = ref('cpu')

const turnLabel = computed(() => currentTurn.value === 'player' ? '玩家进攻' : '电脑进攻')
const simulationStatusText = computed(() => currentTurn.value === 'cpu' ? '电脑正在自动出战，请稍候…' : '玩家回合自动结算中…')

const resultText = computed(() => {
  const cpuAlive = cpuHp.value.some(h => h > 0)
  const playerAlive = playerHp.value.some(h => h > 0)
  if (!cpuAlive && !playerAlive) return '平局'
  if (!cpuAlive) return '玩家胜利！'
  if (!playerAlive) return '电脑胜利！'
  return '对战结束'
})

const resultTag = computed(() => {
  if (resultText.value === '玩家胜利！') return 'success'
  if (resultText.value === '电脑胜利！') return 'danger'
  return 'info'
})

const emptySlotStyle = {
  width: '188px',
  height: '282px',
  border: '2px dashed #ddd',
  borderRadius: '12px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#fafafa',
  cursor: 'pointer',
}

function raritySortValue(value) {
  const key = String(value || '').toUpperCase()
  return Object.prototype.hasOwnProperty.call(rarityRankMap, key) ? rarityRankMap[key] : Number.MAX_SAFE_INTEGER
}

function compareCardValues(left, right, field, order) {
  const direction = order === 'desc' ? -1 : 1
  const leftValue = left?.[field]
  const rightValue = right?.[field]

  if (field === 'rarity') {
    return (raritySortValue(leftValue) - raritySortValue(rightValue)) * direction
  }

  if (['character_id', 'force_value', 'intellect_value', 'speed_value', 'stamina_value'].includes(field)) {
    return ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * direction
  }

  return String(leftValue || '').localeCompare(String(rightValue || ''), 'zh-Hans-CN') * direction
}

function sortCards(list, sortState) {
  return [...list].sort((left, right) => {
    const primary = compareCardValues(left, right, sortState.field, sortState.order)
    if (primary !== 0) return primary
    return compareCardValues(left, right, 'character_id', 'asc')
  })
}

function battleCardWrapStyle(side, index) {
  const isActive = cpuPlaying.value && currentTurn.value === side && currentSlot.value === index
  const activeColor = side === 'cpu' ? '#e6a23c' : '#67c23a'
  const activeBg = side === 'cpu' ? 'rgba(230,162,60,0.12)' : 'rgba(103,194,58,0.12)'
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '10px',
    borderRadius: '14px',
    background: isActive ? activeBg : 'rgba(255,255,255,0.72)',
    border: `1px solid ${isActive ? activeColor : '#ebeef5'}`,
    transition: 'all 0.2s ease',
  }
}

function getSideCards(side) {
  return side === 'cpu' ? battleCpuCards.value : battlePlayerCards.value
}

function getSideHp(side) {
  return side === 'cpu' ? cpuHp.value : playerHp.value
}

function resolveRepresentativeSlot(side, boardSlot) {
  const hpList = getSideHp(side)
  for (let index = boardSlot; index >= 0; index -= 1) {
    if ((hpList[index] || 0) > 0) return index
  }
  return -1
}

function getCardByResolvedSlot(side, boardSlot) {
  const resolvedSlot = resolveRepresentativeSlot(side, boardSlot)
  if (resolvedSlot < 0) return null
  return getSideCards(side)[resolvedSlot] || null
}

function slotActorLabel(side, boardSlot, actualSlot, card) {
  const sideLabel = side === 'cpu' ? '电脑' : '玩家'
  if (!card || actualSlot < 0) {
    return `${sideLabel} 牌位${boardSlot + 1}（空）`
  }
  if (actualSlot === boardSlot) {
    return `${sideLabel} 牌位${boardSlot + 1}（${card.name || '未命名'}）`
  }
  return `${sideLabel} 牌位${boardSlot + 1}（由牌位${actualSlot + 1} ${card.name || '未命名'} 代打）`
}

function mergeCardIntoTeam(teamCards, targetIndex, card) {
  const next = [...teamCards]
  const existedIndex = next.findIndex((item, index) => index !== targetIndex && item?.character_id === card.character_id)

  if (existedIndex >= 0) {
    const temp = next[targetIndex]
    next[targetIndex] = next[existedIndex]
    next[existedIndex] = temp
    return next
  }

  next[targetIndex] = card
  return next
}

// ── PICKER (single slot) ─────────────────────────────────────────────────────
const pickerFiltered = computed(() => {
  let list = pickerAllCards.value
  const kw = pickerFilter.keyword.trim().toLowerCase()
  if (kw) list = list.filter(c => (c.name||'').toLowerCase().includes(kw) || (c.series_name||'').toLowerCase().includes(kw) || (c.faction_name||'').toLowerCase().includes(kw))
  if (pickerFilter.rarity) list = list.filter(c => c.rarity === pickerFilter.rarity)
  if (pickerFilter.series_name) list = list.filter(c => c.series_name === pickerFilter.series_name)
  if (pickerFilter.faction_name) list = list.filter(c => c.faction_name === pickerFilter.faction_name)
  return list
})

const pickerSorted = computed(() => sortCards(pickerFiltered.value, pickerSort))

const pickerPaged = computed(() => {
  const start = (pickerPage.value - 1) * 20
  return pickerSorted.value.slice(start, start + 20)
})

function openPicker(side, index) {
  pickerTarget.side = side
  pickerTarget.index = index
  pickerFilter.keyword = ''
  pickerFilter.rarity = ''
  pickerFilter.series_name = ''
  pickerFilter.faction_name = ''
  pickerPage.value = 1
  pickerVisible.value = true
}

async function onPickerOpen() {
  if (pickerAllCards.value.length > 0) return
  pickerLoading.value = true
  try {
    const [cards, opts] = await Promise.all([getCardMakerCharacters(), getCardAttributeOptions()])
    pickerAllCards.value = cards
    pickerOptions.series = opts.series || []
    pickerOptions.factions = opts.factions || []
    pickerOptions.rarities = opts.rarities || []
    pickerOptions.elements = opts.elements || []
  } finally {
    pickerLoading.value = false
  }
}

function confirmPickerCard(card) {
  const arr = pickerTarget.side === 'cpu' ? cpuCards : playerCards
  arr.value = mergeCardIntoTeam(arr.value, pickerTarget.index, card)
  pickerVisible.value = false
}

// ── BATCH PICKER ─────────────────────────────────────────────────────────────
function openPickerBatch(side) {
  batchTarget.value = side
  batchPickerVisible.value = true
}

function onBatchConfirm(cards) {
  const padded = [null, null, null, null]
  cards.forEach((c, i) => { padded[i] = c })
  if (batchTarget.value === 'cpu') cpuCards.value = padded
  else playerCards.value = padded
}

// ── DRAG REORDER ─────────────────────────────────────────────────────────────
function onDragStart(side, index) {
  dragState.side = side
  dragState.index = index
}

function onDrop(side, index) {
  if (dragState.side !== side || dragState.index === index) return
  const arr = side === 'cpu' ? cpuCards : playerCards
  const next = [...arr.value]
  const tmp = next[index]
  next[index] = next[dragState.index]
  next[dragState.index] = tmp
  arr.value = next
}

// ── FORMULA COMPUTE ───────────────────────────────────────────────────────────
function computeParams(gameDef, myCard, enemyCard) {
  const vars = {
    my_force: myCard.force_value || 50,
    my_intellect: myCard.intellect_value || 50,
    my_speed: myCard.speed_value || 50,
    my_stamina: myCard.stamina_value || 50,
    enemy_force: enemyCard.force_value || 50,
    enemy_intellect: enemyCard.intellect_value || 50,
    enemy_speed: enemyCard.speed_value || 50,
    enemy_stamina: enemyCard.stamina_value || 50,
  }
  const keys = Object.keys(vars)
  const result = {}
  for (const p of gameDef.params) {
    try {
      const fn = new Function(...keys, `"use strict"; return (${p.df})`)
      const val = fn(...keys.map(k => vars[k]))
      result[p.key] = typeof val === 'number' && isFinite(val) ? Math.max(0.1, val) : 0.1
    } catch {
      result[p.key] = 0.1
    }
  }
  return result
}

// ── BATTLE SETUP ──────────────────────────────────────────────────────────────
function startBattle() {
  battleDialogVisible.value = true
  battleCpuCards.value = [...cpuCards.value]
  battlePlayerCards.value = [...playerCards.value]
  cpuHp.value = battleCpuCards.value.map(c => c ? (c.stamina_value || 100) : 0)
  playerHp.value = battlePlayerCards.value.map(c => c ? (c.stamina_value || 100) : 0)
  battleLog.value = []
  roundNum.value = 1
  currentTurn.value = 'player'
  currentSlot.value = -1
  activeBoardSlot.value = -1
  attackPhase.value = null
  phaseResults.value = []
  cpuPlaying.value = false
  phase.value = 'battle'
  addLog('=== 对战开始 ===', 'info')
  addLog('当前测试模式已关闭小游戏加载，双方回合自动模拟得分。', 'info')
  rollDice()
}

function resetBattle() {
  phase.value = 'setup'
  battleDialogVisible.value = false
  battleLog.value = []
  dicePhase.value = false
  diceRolling.value = false
  currentTurn.value = 'player'
  currentSlot.value = -1
  activeBoardSlot.value = -1
  attackPhase.value = null
  phaseResults.value = []
  cpuPlaying.value = false
  cpuDiceRoll.value = 0
  playerDiceRoll.value = 0
}

function restartBattle() {
  startBattle()
}

function onBattleDialogClosed() {
  resetBattle()
}

// ── DICE ──────────────────────────────────────────────────────────────────────
function rollDice() {
  dicePhase.value = true
  diceRolling.value = true
  cpuDiceRoll.value = 0
  playerDiceRoll.value = 0
  let ticks = 0
  const faces = ['⚀','⚁','⚂','⚃','⚄','⚅','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20']
  const timer = setInterval(() => {
    diceAnim.value = faces[Math.floor(Math.random() * faces.length)]
    ticks++
    if (ticks >= 20) {
      clearInterval(timer)
      diceRolling.value = false
      cpuDiceRoll.value = Math.floor(Math.random() * 20) + 1
      playerDiceRoll.value = Math.floor(Math.random() * 20) + 1
      addLog(`掷骰：电脑 ${cpuDiceRoll.value} vs 玩家 ${playerDiceRoll.value}`, 'info')
      // 等待 2 秒后自动继续
      setTimeout(() => {
        afterDice()
      }, 2000)
    }
  }, 80)
}

function afterDice() {
  if (cpuDiceRoll.value === playerDiceRoll.value) {
    addLog('平局，重新掷骰！', 'info')
    rollDice()
    return
  }
  const firstTurn = cpuDiceRoll.value > playerDiceRoll.value ? 'cpu' : 'player'
  addLog(`${firstTurn === 'cpu' ? '电脑' : '玩家'} 先手`, 'info')
  dicePhase.value = false
  startRound(firstTurn)
}

// ── ROUND LOGIC ───────────────────────────────────────────────────────────────
// 每轮结构：
//   1. 掷骰决定先手
//   2. 先手方4张牌同时出战（玩家手动打/电脑自动模拟），收集4个得分
//   3. 按牌位1234顺序依次结算伤害
//   4. 攻守互换，后手方同样4张牌同时出战
//   5. 按顺序结算
//   6. 检查胜负，否则继续下一轮

// 当前攻击阶段状态
const attackPhase = ref(null) // { side, slots: [{ boardSlot, attackSlot, attackCard, defSide, defSlot, defCard, gameKey, gameDef, params }] }
const phaseResults = ref([])   // 收集到的得分结果
const roundFirstSide = ref('player')

function findMatchingDefSlot(side, attackBoardSlot) {
  const hpList = getSideHp(side)
  // 需求：永远对应相同牌位序号，如果对方对应序号阵亡，则：
  // 从这个序号往后找第一个存活，如果找不到，从这个序号往前找最后一个存活
  // 这样实现 1对1, 2对2, 3对3, 4对4，阵亡后自动越级
  
  // 先尝试同序号
  if (hpList[attackBoardSlot] > 0) {
    return attackBoardSlot
  }
  // 往后找第一个存活
  for (let i = attackBoardSlot + 1; i < 4; i++) {
    if (hpList[i] > 0) {
      return i
    }
  }
  // 往前找最后一个存活
  for (let i = attackBoardSlot - 1; i >= 0; i--) {
    if (hpList[i] > 0) {
      return i
    }
  }
  // 没找到
  return -1
}

function buildAttackSlots(side) {
  const slots = []
  const attackHp = getSideHp(side)
  const defSide = side === 'player' ? 'cpu' : 'player'
  
  // 进攻方按牌位顺序 0,1,2,3，每个存活的进攻牌找对应序号的防守牌
  for (let boardSlot = 0; boardSlot < 4; boardSlot += 1) {
    if (attackHp[boardSlot] <= 0) continue // 进攻方自己阵亡了跳过
    
    const attackSlot = resolveRepresentativeSlot(side, boardSlot)
    const defSlot = findMatchingDefSlot(defSide, boardSlot)
    
    if (attackSlot < 0 || defSlot < 0) continue

    const attackCard = getSideCards(side)[attackSlot]
    const defCard = getSideCards(defSide)[defSlot]
    if (!attackCard || !defCard) continue

    const gameKeys = Object.keys(GAME_DEFS)
    const randomKey = gameKeys[Math.floor(Math.random() * gameKeys.length)]
    const gameDef = GAME_DEFS[randomKey]
    const gameObj = allGames.value.find(g => g.game_key === randomKey)
    const formulaConfig = gameObj?.formula_config || {}
    const defWithFormula = {
      ...gameDef,
      params: gameDef.params.map(p => ({ ...p, df: formulaConfig[p.key] || p.df }))
    }
    const params = computeParams(defWithFormula, attackCard, defCard)

    slots.push({
      boardSlot,
      attackBoardSide: side,
      attackSlot,
      attackCard,
      defSide,
      defSlot,
      defCard,
      gameKey: randomKey,
      gameDef,
      params,
    })
  }
  return slots
}

function startRound(firstSide) {
  addLog(`─── 第 ${roundNum.value} 轮开始 ───`, 'round')
  roundFirstSide.value = firstSide
  startAttackPhase(firstSide)
}

function startAttackPhase(side) {
  const slots = buildAttackSlots(side)
  currentTurn.value = side
  currentSlot.value = -1
  activeBoardSlot.value = -1

  if (slots.length === 0) {
    // 该方没有存活卡牌，直接进入下一阶段
    onAttackPhaseDone(side, [])
    return
  }

  attackPhase.value = { side, slots }
  phaseResults.value = []

  const sideLabel = side === 'player' ? '玩家' : '电脑'
  addLog(`【${sideLabel}进攻】牌位 ${slots.map(s => s.boardSlot + 1).join('、')} 同时出战`, 'round')
  addLog(`${sideLabel}回合自动结算中，本轮不加载小游戏。`, 'info')
  simulateAllSlots(side, slots)
}

function simulateSlotScore(slot) {
  const attack = slot.attackCard || {}
  const defend = getCardByResolvedSlot(slot.defSide, slot.boardSlot) || slot.defCard || {}
  const attackPower =
    (Number(attack.force_value) || 0) * 0.38 +
    (Number(attack.speed_value) || 0) * 0.24 +
    (Number(attack.intellect_value) || 0) * 0.18 +
    (Number(attack.stamina_value) || 0) * 0.20
  const defendPower =
    (Number(defend.force_value) || 0) * 0.30 +
    (Number(defend.speed_value) || 0) * 0.25 +
    (Number(defend.intellect_value) || 0) * 0.20 +
    (Number(defend.stamina_value) || 0) * 0.25

  const ratioBase = (attackPower - defendPower) / Math.max(attackPower + defendPower, 1)
  const randomVariance = (Math.random() - 0.5) * 1.4
  const rawScore = 2.5 + ratioBase * 4 + randomVariance
  return Math.max(0, Math.min(5, Math.round(rawScore)))
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function simulateAllSlots(side, slots) {
  cpuPlaying.value = true
  const logType = side === 'cpu' ? 'cpu' : 'action'
  const results = []

  for (const slot of [...slots].sort((left, right) => left.boardSlot - right.boardSlot)) {
    currentSlot.value = slot.boardSlot
    activeBoardSlot.value = slot.boardSlot
    await wait(280 + Math.random() * 180)
    const score = simulateSlotScore(slot)
    const result = { ...slot, score }
    results.push(result)
    phaseResults.value = [...results]
    addLog(`${slotActorLabel(side, slot.boardSlot, slot.attackSlot, slot.attackCard)} · ${slot.gameDef.name}（自动模拟） → 得分 ${score}/5`, logType)
    await wait(180)
  }

  cpuPlaying.value = false
  currentSlot.value = -1
  activeBoardSlot.value = -1
  onAttackPhaseDone(side, results)
}

// 统一结算一个攻击阶段的所有结果
function onAttackPhaseDone(side, results) {
  addLog(`【结算】${side === 'player' ? '玩家' : '电脑'}进攻结果：`, 'round')

  for (const r of [...results].sort((left, right) => left.boardSlot - right.boardSlot)) {
    const damage = Math.max(0, Math.round(r.score * (r.attackCard?.force_value || 50) / 10))

    // 按牌位结算；若该牌位卡牌已阵亡，则退到左边最近存活牌位
    const currentDefSlot = resolveRepresentativeSlot(r.defSide, r.boardSlot)
    if (currentDefSlot < 0 || r.score <= 0) {
      addLog(`  牌位${r.boardSlot + 1} 得分${r.score}/5 → 无有效目标`, 'miss')
      continue
    }

    const defHp = r.defSide === 'cpu' ? cpuHp.value : playerHp.value
    const defCards = r.defSide === 'cpu' ? battleCpuCards.value : battlePlayerCards.value
    const newHp = [...defHp]
    newHp[currentDefSlot] = Math.max(0, newHp[currentDefSlot] - damage)
    if (r.defSide === 'cpu') cpuHp.value = newHp
    else playerHp.value = newHp

    const defCard = defCards[currentDefSlot]
    addLog(`  ${slotActorLabel(side, r.boardSlot, r.attackSlot, r.attackCard)} 得分${r.score}/5 → 伤害${damage} → ${slotActorLabel(r.defSide, r.boardSlot, currentDefSlot, defCard)} 剩余HP:${newHp[currentDefSlot]}`, 'damage')

    if (newHp[currentDefSlot] <= 0) {
      addLog(`  ${slotActorLabel(r.defSide, r.boardSlot, currentDefSlot, defCard)} 阵亡！`, 'death')
    }
  }

  attackPhase.value = null
  phaseResults.value = []
  cpuPlaying.value = false
  currentSlot.value = -1
  activeBoardSlot.value = -1

  // 检查胜负
  const cpuAlive = cpuHp.value.some(h => h > 0)
  const playerAlive = playerHp.value.some(h => h > 0)
  if (!cpuAlive || !playerAlive) {
    endBattle()
    return
  }

  // 攻守互换
  const secondSide = side === 'player' ? 'cpu' : 'player'
  const isSecondPhase = side !== roundFirstSide.value
  if (isSecondPhase) {
    // 两个阶段都完成，进入下一轮
    roundNum.value++
    addLog(`─── 第 ${roundNum.value - 1} 轮结束 ───`, 'round')
    rollDice()
  } else {
    // 进入后手阶段
    startAttackPhase(secondSide)
  }
}

// ── END BATTLE ────────────────────────────────────────────────────────────────
function endBattle() {
  phase.value = 'result'
  attackPhase.value = null
  phaseResults.value = []
  cpuPlaying.value = false
  currentSlot.value = -1
  activeBoardSlot.value = -1
  const cpuAlive = cpuHp.value.some(h => h > 0)
  const playerAlive = playerHp.value.some(h => h > 0)
  if (!cpuAlive && !playerAlive) addLog('=== 平局！ ===', 'result')
  else if (!cpuAlive) addLog('=== 玩家胜利！ ===', 'result')
  else addLog('=== 电脑胜利！ ===', 'result')
}


// ── LOG ───────────────────────────────────────────────────────────────────────
function addLog(text, type = 'info') {
  battleLog.value.push({ text, type })
  nextTick(() => {
    if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight
  })
}

function logStyle(entry) {
  const colors = {
    info: '#666', round: '#409eff', action: '#333', damage: '#e6a23c',
    death: '#f56c6c', miss: '#aaa', cpu: '#909399', result: '#67c23a',
  }
  return { color: colors[entry.type] || '#333', fontWeight: entry.type === 'round' || entry.type === 'result' ? '700' : '400' }
}

// ── DICE STYLE ────────────────────────────────────────────────────────────────
function diceStyle(val, rolling) {
  return {
    fontSize: '56px',
    fontWeight: '700',
    color: rolling ? '#aaa' : (val >= 15 ? '#67c23a' : val >= 8 ? '#409eff' : '#f56c6c'),
    lineHeight: 1,
    minWidth: '80px',
    display: 'inline-block',
    textAlign: 'center',
    transition: 'color 0.3s',
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    allGames.value = await getGames()
    // Load shared card design for preview rendering
    const design = await getCardMakerGlobalDesign()
    if (design) {
      sharedDesign.value = design
    }
  } catch {
    // design stays null, CardPreview uses defaults
  }
})
</script>
