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

    <!-- Soccer game dialog -->
    <SoccerGame
      v-if="selectedGame?.game_key === 'soccer'"
      v-model="gameVisible"
      :goalkeeper-speed="computedParams.goalkeeper_speed ?? 1"
      :swing-speed="computedParams.swing_speed ?? 1"
      :time-limit="computedParams.time_limit ?? 10"
      @score="onScore"
    />

    <!-- Tennis game dialog -->
    <TennisGame
      v-if="selectedGame?.game_key === 'tennis'"
      v-model="gameVisible"
      :ball-speed="computedParams.ball_speed ?? 1"
      :landing-range="computedParams.landing_range ?? 0.5"
      :time-limit="computedParams.time_limit ?? 15"
      @score="onScore"
    />

    <!-- Golf game dialog -->
    <GolfGame
      v-if="selectedGame?.game_key === 'golf'"
      v-model="gameVisible"
      :power-speed="computedParams.power_speed ?? 1"
      :green-zone="computedParams.green_zone ?? 0.3"
      :time-limit="computedParams.time_limit ?? 10"
      @score="onScore"
    />

    <!-- Swimming game dialog -->
    <SwimmingGame
      v-if="selectedGame?.game_key === 'swimming'"
      v-model="gameVisible"
      :opponent-speed="computedParams.opponent_speed ?? 1"
      :rhythm-window="computedParams.rhythm_window ?? 0.5"
      :time-limit="computedParams.time_limit ?? 15"
      @score="onScore"
    />

    <!-- Running game dialog -->
    <RunningGame
      v-if="selectedGame?.game_key === 'running'"
      v-model="gameVisible"
      :opponent-base-speed="computedParams.opponent_base_speed ?? 5"
      :overtake-window-count="computedParams.overtake_window_count ?? 3"
      :stamina-drain-rate="computedParams.stamina_drain_rate ?? 1"
      :sprint-reserve="computedParams.sprint_reserve ?? 2.5"
      @score="onScore"
    />

    <!-- Gymnastics game dialog -->
    <GymnasticsGame
      v-if="selectedGame?.game_key === 'gymnastics'"
      v-model="gameVisible"
      :sequence-length="computedParams.sequence_length ?? 4"
      :beat-speed="computedParams.beat_speed ?? 1"
      :balance-speed="computedParams.balance_speed ?? 1"
      :judge-window="computedParams.judge_window ?? 0.3"
      @score="onScore"
    />

    <!-- Boxing game dialog -->
    <BoxingGame
      v-if="selectedGame?.game_key === 'boxing'"
      v-model="gameVisible"
      :punch-interval="computedParams.punch_interval ?? 1.2"
      :fake-prob="computedParams.fake_prob ?? 0.2"
      :counter-window="computedParams.counter_window ?? 0.5"
      :exchange-count="computedParams.exchange_count ?? 6"
      @score="onScore"
    />

    <!-- Equestrian game dialog -->
    <EquestrianGame
      v-if="selectedGame?.game_key === 'equestrian'"
      v-model="gameVisible"
      :obstacle-interval="computedParams.obstacle_interval ?? 2"
      :jump-window="computedParams.jump_window ?? 0.4"
      :horse-restless="computedParams.horse_restless ?? 1"
      :obstacle-count="computedParams.obstacle_count ?? 8"
      @score="onScore"
    />

    <!-- Racing game dialog -->
    <RacingGame
      v-if="selectedGame?.game_key === 'racing'"
      v-model="gameVisible"
      :curve-count="computedParams.curve_count ?? 3"
      :grip="computedParams.grip ?? 1"
      :drift-window="computedParams.drift_window ?? 0.35"
      :collision-tolerance="computedParams.collision_tolerance ?? 2"
      @score="onScore"
    />

    <!-- Chopping game dialog -->
    <ChoppingGame
      v-if="selectedGame?.game_key === 'chopping'"
      v-model="gameVisible"
      :belt-speed="computedParams.belt_speed ?? 2"
      :recipe-length="computedParams.recipe_length ?? 6"
      :distract-ratio="computedParams.distract_ratio ?? 0.2"
      :mistake-limit="computedParams.mistake_limit ?? 2"
      @score="onScore"
    />

    <!-- Guitar game dialog -->
    <GuitarGame
      v-if="selectedGame?.game_key === 'guitar'"
      v-model="gameVisible"
      :chord-preview-time="computedParams.chord_preview_time ?? 1.2"
      :strum-density="computedParams.strum_density ?? 4"
      :fill-length="computedParams.fill_length ?? 3"
      :section-length="computedParams.section_length ?? 2"
      @score="onScore"
    />

    <!-- Nosehair game dialog -->
    <NosehairGame
      v-if="selectedGame?.game_key === 'nosehair'"
      v-model="gameVisible"
      :hair-swing="computedParams.hair_swing ?? 1"
      :clamp-width="computedParams.clamp_width ?? 20"
      :root-firmness="computedParams.root_firmness ?? 1"
      :target-count="computedParams.target_count ?? 5"
      @score="onScore"
    />

    <!-- Volleyball game dialog -->
    <VolleyballGame
      v-if="selectedGame?.game_key === 'volleyball'"
      v-model="gameVisible"
      :toss-speed="computedParams.toss_speed ?? 4"
      :target-window-width-value="computedParams.target_window_width_value ?? 18"
      :spin-drift="computedParams.spin_drift ?? 0.15"
      :target-ball-count="computedParams.target_ball_count ?? 5"
      @score="onScore"
    />

    <!-- Jumprope game dialog -->
    <JumpropeGame
      v-if="selectedGame?.game_key === 'jumprope'"
      v-model="gameVisible"
      :rope-speed="computedParams.rope_speed ?? 1"
      :speed-change-freq="computedParams.speed_change_freq ?? 0.2"
      :jump-window="computedParams.jump_window ?? 0.22"
      :target-jump-count="computedParams.target_jump_count ?? 12"
      @score="onScore"
    />

    <!-- Snake game dialog -->
    <SnakeGame
      v-if="selectedGame?.game_key === 'snake'"
      v-model="gameVisible"
      :move-speed="computedParams.move_speed ?? 4"
      :obstacle-freq="computedParams.obstacle_freq ?? 0.25"
      :gold-duration="computedParams.gold_duration ?? 2"
      :target-food-count="computedParams.target_food_count ?? 5"
      @score="onScore"
    />

    <!-- Tetris game dialog -->
    <TetrisGame
      v-if="selectedGame?.game_key === 'tetris'"
      v-model="gameVisible"
      :drop-speed="computedParams.drop_speed ?? 1"
      :preview-count="computedParams.preview_count ?? 3"
      :garbage-prob="computedParams.garbage_prob ?? 0.1"
      :piece-limit="computedParams.piece_limit ?? 8"
      @score="onScore"
    />

    <!-- Breakout game dialog -->
    <BreakoutGame
      v-if="selectedGame?.game_key === 'breakout'"
      v-model="gameVisible"
      :initial-ball-count="computedParams.initial_ball_count ?? 10"
      :brick-hp="computedParams.brick_hp ?? 3"
      :obstacle-ratio="computedParams.obstacle_ratio ?? 0.15"
      :round-count="computedParams.round_count ?? 4"
      @score="onScore"
    />

    <!-- Pinball game dialog -->
    <PinballGame
      v-if="selectedGame?.game_key === 'pinball'"
      v-model="gameVisible"
      :launch-speed="computedParams.launch_speed ?? 5"
      :drain-width="computedParams.drain_width ?? 0.15"
      :multiplier-freq="computedParams.multiplier_freq ?? 0.25"
      :ball-count="computedParams.ball_count ?? 2"
      :target-count="computedParams.target_count ?? 3"
      @score="onScore"
    />

    <!-- Tank game dialog -->
    <TankGame
      v-if="selectedGame?.game_key === 'tank'"
      v-model="gameVisible"
      :enemy-aim-speed="computedParams.enemy_aim_speed ?? 1"
      :shell-speed="computedParams.shell_speed ?? 6"
      :cover-count="computedParams.cover_count ?? 6"
      :battle-hp="computedParams.battle_hp ?? 2"
      @score="onScore"
    />

    <!-- Airplane game dialog -->
    <AirplaneGame
      v-if="selectedGame?.game_key === 'airplane'"
      v-model="gameVisible"
      :bullet-density="computedParams.bullet_density ?? 3"
      :item-prob="computedParams.item_prob ?? 0.2"
      :elite-freq="computedParams.elite_freq ?? 0.167"
      :wave-count="computedParams.wave_count ?? 3"
      @score="onScore"
    />

    <!-- Coin catch game dialog -->
    <CoinCatchGame
      v-if="selectedGame?.game_key === 'coincatch'"
      v-model="gameVisible"
      :drop-speed="computedParams.drop_speed ?? 4"
      :trap-ratio="computedParams.trap_ratio ?? 0.2"
      :move-inertia="computedParams.move_inertia ?? 0.15"
      :drop-count="computedParams.drop_count ?? 12"
      @score="onScore"
    />

    <!-- Fruit slice game dialog -->
    <FruitSliceGame
      v-if="selectedGame?.game_key === 'fruitslice'"
      v-model="gameVisible"
      :throw-freq="computedParams.throw_freq ?? 3"
      :bomb-ratio="computedParams.bomb_ratio ?? 0.15"
      :combo-window="computedParams.combo_window ?? 0.8"
      :throw-rounds="computedParams.throw_rounds ?? 4"
      @score="onScore"
    />

    <!-- Piano tiles game dialog -->
    <PianoTilesGame
      v-if="selectedGame?.game_key === 'pianotiles'"
      v-model="gameVisible"
      :drop-speed="computedParams.drop_speed ?? 4"
      :double-tap-prob="computedParams.double_tap_prob ?? 0.1"
      :hold-ratio="computedParams.hold_ratio ?? 0.2"
      :pattern-length="computedParams.pattern_length ?? 16"
      @score="onScore"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getGames, getGame, saveGame } from '../../api/games'
import ArcheryGame from '../../components/games/ArcheryGame.vue'
import SoccerGame from '../../components/games/SoccerGame.vue'
import TennisGame from '../../components/games/TennisGame.vue'
import GolfGame from '../../components/games/GolfGame.vue'
import SwimmingGame from '../../components/games/SwimmingGame.vue'
import RunningGame from '../../components/games/RunningGame.vue'
import GymnasticsGame from '../../components/games/GymnasticsGame.vue'
import BoxingGame from '../../components/games/BoxingGame.vue'
import EquestrianGame from '../../components/games/EquestrianGame.vue'
import RacingGame from '../../components/games/RacingGame.vue'
import ChoppingGame from '../../components/games/ChoppingGame.vue'
import GuitarGame from '../../components/games/GuitarGame.vue'
import NosehairGame from '../../components/games/NosehairGame.vue'
import VolleyballGame from '../../components/games/VolleyballGame.vue'
import JumpropeGame from '../../components/games/JumpropeGame.vue'
import SnakeGame from '../../components/games/SnakeGame.vue'
import TetrisGame from '../../components/games/TetrisGame.vue'
import BreakoutGame from '../../components/games/BreakoutGame.vue'
import PinballGame from '../../components/games/PinballGame.vue'
import TankGame from '../../components/games/TankGame.vue'
import AirplaneGame from '../../components/games/AirplaneGame.vue'
import CoinCatchGame from '../../components/games/CoinCatchGame.vue'
import FruitSliceGame from '../../components/games/FruitSliceGame.vue'
import PianoTilesGame from '../../components/games/PianoTilesGame.vue'

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
  soccer: {
    name: '足球',
    params: [
      {
        key: 'goalkeeper_speed',
        label: '守门员速度',
        unit: '秒/来回',
        defaultFormula: '1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))',
        formulaDesc: '数值越小守门员移动越快，越难射门',
      },
      {
        key: 'swing_speed',
        label: '晃动速度',
        unit: '秒/来回',
        defaultFormula: '1*(1+(enemy_intellect-my_intellect)/my_intellect)',
        formulaDesc: '射门方向箭头晃动速度，数值越小越难瞄准',
      },
      {
        key: 'time_limit',
        label: '剩余时间',
        unit: '秒',
        defaultFormula: '10*(1+(my_force-enemy_force)/enemy_force)',
        formulaDesc: '游戏总时长，我方武力越高时间越充裕',
      },
    ],
  },
  tennis: {
    name: '网球',
    params: [
      {
        key: 'ball_speed',
        label: '来球速度',
        unit: '秒/球',
        defaultFormula: '1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))',
        formulaDesc: '球从对手侧飞来的时间，数值越小越快越难接',
      },
      {
        key: 'landing_range',
        label: '落点变化范围',
        unit: '比例',
        defaultFormula: '0.5*(1+(enemy_intellect-my_intellect)/my_intellect)',
        formulaDesc: '球落点的随机偏移幅度（0~1），数值越大越难追',
      },
      {
        key: 'time_limit',
        label: '剩余时间',
        unit: '秒',
        defaultFormula: '15*(1+(my_force-enemy_force)/enemy_force)',
        formulaDesc: '游戏总时长，我方武力越高时间越充裕',
      },
    ],
  },
  golf: {
    name: '高尔夫',
    params: [
      {
        key: 'power_speed',
        label: '力度条速度',
        unit: '秒/来回',
        defaultFormula: '1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))',
        formulaDesc: '力度条上下跳动速度，数值越小越快越难控制',
      },
      {
        key: 'green_zone',
        label: '绿色区间宽度',
        unit: '比例',
        defaultFormula: '0.3*(1+(my_intellect-enemy_intellect)/enemy_intellect)',
        formulaDesc: '进洞有效区间占力度条的比例（0~1），数值越小越难命中',
      },
      {
        key: 'time_limit',
        label: '剩余时间',
        unit: '秒',
        defaultFormula: '10*(1+(my_force-enemy_force)/enemy_force)',
        formulaDesc: '游戏总时长，我方武力越高时间越充裕',
      },
    ],
  },
  swimming: {
    name: '游泳',
    params: [
      {
        key: 'opponent_speed',
        label: '对手速度',
        unit: '倍率',
        defaultFormula: '1*(1+(enemy_speed-my_speed)/my_speed)',
        formulaDesc: '对手泳者前进速度倍率，数值越大对手越快',
      },
      {
        key: 'rhythm_window',
        label: '最佳节奏窗口',
        unit: '秒',
        defaultFormula: '0.5*(1-(my_intellect-enemy_intellect)/(my_intellect+enemy_intellect))',
        formulaDesc: '每次按键的理想间隔时间，在窗口内按键速度加成最大',
      },
      {
        key: 'time_limit',
        label: '游戏时间',
        unit: '秒',
        defaultFormula: '15*(1+(my_stamina-enemy_stamina)/enemy_stamina)',
        formulaDesc: '游戏总时长，我方体力越高时间越充裕',
      },
    ],
  },
  running: {
    name: '跑步',
    params: [
      { key: 'opponent_base_speed', label: '对手基础配速', unit: '格/秒', defaultFormula: '5*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '对手直道基础速度，越高越难超越' },
      { key: 'overtake_window_count', label: '超车窗口数量', unit: '次', defaultFormula: '3*(1+0.5*(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '需要处理的抢位窗口次数' },
      { key: 'stamina_drain_rate', label: '体力消耗率', unit: '倍率', defaultFormula: '1*(1+(enemy_stamina-my_stamina)/my_stamina)', formulaDesc: '提速时体力流失速度' },
      { key: 'sprint_reserve', label: '冲刺储备', unit: '秒', defaultFormula: '2.5*(1+(my_force-enemy_force)/enemy_force)', formulaDesc: '最后冲线阶段的爆发持续时间' },
    ],
  },
  gymnastics: {
    name: '体操',
    params: [
      { key: 'sequence_length', label: '动作数量', unit: '个', defaultFormula: '3*(1+0.5*(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '短组合动作数量（建议 3-4 个）' },
      { key: 'beat_speed', label: '节拍速度', unit: '倍率', defaultFormula: '1*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '节拍指针扫动速度倍率' },
      { key: 'balance_speed', label: '平衡速度', unit: '倍率', defaultFormula: '1*(1+(enemy_stamina-my_stamina)/my_stamina)', formulaDesc: '落地平衡条摆动速度' },
      { key: 'judge_window', label: '判定窗口', unit: '比例', defaultFormula: '0.3*(1+(my_intellect-enemy_intellect)/enemy_intellect)', formulaDesc: '绿区宽度占判定区的比例' },
    ],
  },
  boxing: {
    name: '拳击',
    params: [
      { key: 'punch_interval', label: '出拳间隔', unit: '秒', defaultFormula: '1.2*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))', formulaDesc: '对手出拳的时间间隔，越小越频繁' },
      { key: 'fake_prob', label: '虚招概率', unit: '比例', defaultFormula: '0.2*(1+(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '对手使出虚招的概率（0-1）' },
      { key: 'counter_window', label: '反击窗口', unit: '秒', defaultFormula: '0.5*(1+(my_force-enemy_force)/enemy_force)', formulaDesc: '破绽出现后可反击的时间窗口' },
      { key: 'exchange_count', label: '攻防回合数', unit: '次', defaultFormula: '6*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)', formulaDesc: '需要处理的短促攻防次数' },
    ],
  },
  equestrian: {
    name: '马术',
    params: [
      { key: 'obstacle_interval', label: '障碍间隔', unit: '秒', defaultFormula: '2*(1+(my_intellect-enemy_intellect)/enemy_intellect)', formulaDesc: '障碍物出现的时间间隔' },
      { key: 'jump_window', label: '起跳窗口', unit: '秒', defaultFormula: '0.4*(1+(my_speed-enemy_speed)/enemy_speed)', formulaDesc: '障碍物到达时可起跳的时间窗口' },
      { key: 'horse_restless', label: '马匹躁动', unit: '倍率', defaultFormula: '1*(1+(enemy_stamina-my_stamina)/my_stamina)', formulaDesc: '马匹随机抖动幅度' },
      { key: 'obstacle_count', label: '障碍数量', unit: '个', defaultFormula: '8*(1+(enemy_stamina-my_stamina)/my_stamina)', formulaDesc: '总障碍物数量（5-15）' },
    ],
  },
  racing: {
    name: '赛车',
    params: [
      { key: 'curve_count', label: '关键弯道数量', unit: '个', defaultFormula: '3*(1+0.5*(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '需要处理的关键弯道数量' },
      { key: 'grip', label: '抓地力', unit: '倍率', defaultFormula: '1*(1+(my_speed-enemy_speed)/enemy_speed)', formulaDesc: '车辆抓地力，越高过弯越稳' },
      { key: 'drift_window', label: '漂移窗口', unit: '秒', defaultFormula: '0.35*(1+(my_intellect-enemy_intellect)/enemy_intellect)', formulaDesc: '弯道出口后可漂移加速的时间窗口' },
      { key: 'collision_tolerance', label: '碰撞容错', unit: '次', defaultFormula: '2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '允许的碰撞次数' },
    ],
  },
  chopping: {
    name: '切菜',
    params: [
      { key: 'belt_speed', label: '传送带速度', unit: '倍率', defaultFormula: '2*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '传送带移动速度' },
      { key: 'recipe_length', label: '菜谱长度', unit: '步', defaultFormula: '4*(1+0.5*(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '短菜谱的步骤数量' },
      { key: 'distract_ratio', label: '干扰比例', unit: '比例', defaultFormula: '0.2*(1+(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '传送带上干扰食材的比例' },
      { key: 'mistake_limit', label: '允许误切次数', unit: '次', defaultFormula: '2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '一局允许的总失误次数' },
    ],
  },
  guitar: {
    name: '吉他',
    params: [
      { key: 'chord_preview_time', label: '和弦预览时间', unit: '秒', defaultFormula: '1.2*(1+(my_intellect-enemy_intellect)/enemy_intellect)', formulaDesc: '下一拍和弦提前显示的时间' },
      { key: 'strum_density', label: '扫弦节奏密度', unit: '拍/小节', defaultFormula: '4*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '每小节需要处理的扫弦拍点数' },
      { key: 'fill_length', label: '即兴填句长度', unit: '拍', defaultFormula: '3*(1+(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '中途即兴拨弦段的长度' },
      { key: 'section_length', label: '段落长度', unit: '小节', defaultFormula: '2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '整段伴奏共几小节' },
    ],
  },
  nosehair: {
    name: '拔鼻毛',
    params: [
      { key: 'hair_swing', label: '毛发摆动速度', unit: '次/秒', defaultFormula: '1*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '目标鼻毛晃动速度，越高越难夹中' },
      { key: 'clamp_width', label: '夹取判定宽度', unit: '像素', defaultFormula: '20*(1+(my_intellect-enemy_intellect)/enemy_intellect)', formulaDesc: '镊子夹中目标的容错宽度' },
      { key: 'root_firmness', label: '根部牢固度', unit: '倍率', defaultFormula: '1*(1+(enemy_force-my_force)/my_force)', formulaDesc: '越高越难一次拔出' },
      { key: 'target_count', label: '目标数量', unit: '根', defaultFormula: '3*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)', formulaDesc: '一局需要处理的目标数量' },
    ],
  },
  volleyball: {
    name: '垫球',
    params: [
      { key: 'toss_speed', label: '抛球速度', unit: '格/秒', defaultFormula: '4*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '教练抛球速度，越高越难快速到位' },
      { key: 'target_window_width_value', label: '目标窗宽度', unit: '%', defaultFormula: '18*(1+(my_intellect-enemy_intellect)/enemy_intellect)', formulaDesc: '目标传球窗的宽度' },
      { key: 'spin_drift', label: '旋转干扰', unit: '比例', defaultFormula: '0.15*(1+(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '来球后半段的飞行偏移幅度' },
      { key: 'target_ball_count', label: '目标球数量', unit: '次', defaultFormula: '5*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)', formulaDesc: '一局需要处理的来球数量' },
    ],
  },
  jumprope: {
    name: '跳绳',
    params: [
      { key: 'rope_speed', label: '绳子转速', unit: '圈/秒', defaultFormula: '1*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '绳子旋转速度，越高越难起跳' },
      { key: 'speed_change_freq', label: '变速频率', unit: '次/秒', defaultFormula: '0.2*(1+(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '绳速变化的频率' },
      { key: 'jump_window', label: '起跳容错窗口', unit: '秒', defaultFormula: '0.22*(1+(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '按键判定的容错时间窗口' },
      { key: 'target_jump_count', label: '目标跳跃次数', unit: '次', defaultFormula: '12*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '一局需要完成的总跳跃次数' },
    ],
  },
  snake: {
    name: '贪吃蛇',
    params: [
      { key: 'move_speed', label: '移动速度', unit: '格/秒', defaultFormula: '4*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '蛇头移动速度，越快越考验预判' },
      { key: 'obstacle_freq', label: '障碍刷新频率', unit: '个/秒', defaultFormula: '0.25*(1+(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '随机障碍出现的频率' },
      { key: 'gold_duration', label: '金色食物停留时间', unit: '秒', defaultFormula: '2*(1+(my_intellect-enemy_intellect)/enemy_intellect)', formulaDesc: '高价值食物在场上的停留时间' },
      { key: 'target_food_count', label: '目标食物数量', unit: '个', defaultFormula: '5*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '一局需要吃到的食物数量' },
    ],
  },
  tetris: {
    name: '俄罗斯方块',
    params: [
      { key: 'drop_speed', label: '下落速度', unit: '层/秒', defaultFormula: '1*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '方块自动下落的速度' },
      { key: 'preview_count', label: '预览方块数量', unit: '个', defaultFormula: '3*(1+(my_intellect-enemy_intellect)/enemy_intellect)', formulaDesc: '可提前看到的后续方块数量' },
      { key: 'garbage_prob', label: '垃圾行概率', unit: '比例', defaultFormula: '0.1*(1+(enemy_force-my_force)/my_force)', formulaDesc: '随机插入垃圾行的概率' },
      { key: 'piece_limit', label: '可用方块数量', unit: '块', defaultFormula: '8*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '残局模式下可使用的方块数量' },
    ],
  },
  breakout: {
    name: '打砖块',
    params: [
      { key: 'initial_ball_count', label: '初始球数', unit: '个', defaultFormula: '10*(1+(my_speed-enemy_speed)/enemy_speed)', formulaDesc: '每回合可连续发射的小球数量' },
      { key: 'brick_hp', label: '砖块基础耐久', unit: '点', defaultFormula: '3*(1+(enemy_force-my_force)/my_force)', formulaDesc: '砖块需要命中的基础次数' },
      { key: 'obstacle_ratio', label: '障碍砖比例', unit: '比例', defaultFormula: '0.15*(1+(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '不可破坏砖块的占比' },
      { key: 'round_count', label: '目标回合数', unit: '回合', defaultFormula: '4*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '一局可进行的总回合数' },
    ],
  },
  pinball: {
    name: '弹球',
    params: [
      { key: 'launch_speed', label: '发射初速', unit: '格/秒', defaultFormula: '5*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '小球发射速度，越高越难控制' },
      { key: 'drain_width', label: '漏球口宽度', unit: '比例', defaultFormula: '0.15*(1+(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '底部漏球口宽度占比' },
      { key: 'multiplier_freq', label: '倍率切换频率', unit: '次/秒', defaultFormula: '0.25*(1+(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '高倍率区域切换频率' },
      { key: 'ball_count', label: '小球数量', unit: '个', defaultFormula: '2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '可用小球数量' },
      { key: 'target_count', label: '高分目标数量', unit: '个', defaultFormula: '3*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)', formulaDesc: '台面上需要命中的高分目标数量' },
    ],
  },
  tank: {
    name: '坦克',
    params: [
      { key: 'enemy_aim_speed', label: '敌方瞄准速度', unit: '次/秒', defaultFormula: '1*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '敌方转向与锁定的速度' },
      { key: 'shell_speed', label: '炮弹飞行速度', unit: '格/秒', defaultFormula: '6*(1+(enemy_force-my_force)/my_force)', formulaDesc: '炮弹飞行速度，越高越难闪避' },
      { key: 'cover_count', label: '掩体数量', unit: '个', defaultFormula: '6*(1+(my_intellect-enemy_intellect)/enemy_intellect)', formulaDesc: '场上可利用的掩体数量' },
      { key: 'battle_hp', label: '双方耐久', unit: '点', defaultFormula: '2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '敌我双方的生命值' },
    ],
  },
  airplane: {
    name: '飞机',
    params: [
      { key: 'bullet_density', label: '敌弹密度', unit: '发/秒', defaultFormula: '3*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '敌方子弹生成密度' },
      { key: 'item_prob', label: '道具刷新概率', unit: '比例', defaultFormula: '0.2*(1+(my_intellect-enemy_intellect)/enemy_intellect)', formulaDesc: '击落敌机后掉落道具的概率' },
      { key: 'elite_freq', label: '精英机出现频率', unit: '架/秒', defaultFormula: '0.167*(1+(enemy_force-my_force)/my_force)', formulaDesc: '精英机出现频率' },
      { key: 'wave_count', label: '目标波次', unit: '波', defaultFormula: '3*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '需要完成的敌机波次数' },
    ],
  },
  coincatch: {
    name: '接金币',
    params: [
      { key: 'drop_speed', label: '下落速度', unit: '格/秒', defaultFormula: '4*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '物体从上方下落的速度' },
      { key: 'trap_ratio', label: '陷阱比例', unit: '比例', defaultFormula: '0.2*(1+(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '炸弹与假宝箱出现的比例' },
      { key: 'move_inertia', label: '移动惯性', unit: '秒', defaultFormula: '0.15*(1+(enemy_stamina-my_stamina)/my_stamina)', formulaDesc: '角色转向时的迟滞感' },
      { key: 'drop_count', label: '掉落物数量', unit: '次', defaultFormula: '12*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '一局总共结算的掉落次数' },
    ],
  },
  fruitslice: {
    name: '切水果',
    params: [
      { key: 'throw_freq', label: '抛射频率', unit: '次/秒', defaultFormula: '3*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '每轮水果抛出的节奏频率' },
      { key: 'bomb_ratio', label: '炸弹比例', unit: '比例', defaultFormula: '0.15*(1+(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '炸弹混入水果中的比例' },
      { key: 'combo_window', label: '连击窗口', unit: '秒', defaultFormula: '0.8*(1+(my_speed-enemy_speed)/enemy_speed)', formulaDesc: '连续切中的时间窗口' },
      { key: 'throw_rounds', label: '抛射轮次', unit: '轮', defaultFormula: '4*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '一局固定抛射的轮次数' },
    ],
  },
  pianotiles: {
    name: '钢琴块',
    params: [
      { key: 'drop_speed', label: '下落速度', unit: '格/秒', defaultFormula: '4*(1+(enemy_speed-my_speed)/my_speed)', formulaDesc: '音符下落速度，越高越难反应' },
      { key: 'double_tap_prob', label: '双押概率', unit: '比例', defaultFormula: '0.1*(1+(enemy_intellect-my_intellect)/my_intellect)', formulaDesc: '同时按键音符出现的概率' },
      { key: 'hold_ratio', label: '长按比例', unit: '比例', defaultFormula: '0.2*(1+(enemy_stamina-my_stamina)/my_stamina)', formulaDesc: '长按音符在谱面中的占比' },
      { key: 'pattern_length', label: '谱面长度', unit: '块', defaultFormula: '16*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)', formulaDesc: '一局需要处理的黑块数量' },
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
