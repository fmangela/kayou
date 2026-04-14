<template>
  <el-dialog
    :model-value="modelValue"
    title="选择卡牌"
    width="960px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <!-- Filters -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索名字/系列/阵营/技能..."
        clearable
        style="width:200px"
        @input="onFilterChange"
      />
      <el-select v-model="filters.series_name" placeholder="系列" clearable style="width:130px" @change="onFilterChange">
        <el-option v-for="o in options.series" :key="o" :label="o" :value="o" />
      </el-select>
      <el-select v-model="filters.faction_name" placeholder="阵营" clearable style="width:110px" @change="onFilterChange">
        <el-option v-for="o in options.factions" :key="o" :label="o" :value="o" />
      </el-select>
      <el-select v-model="filters.rarity" placeholder="稀有度" clearable style="width:100px" @change="onFilterChange">
        <el-option v-for="o in options.rarities" :key="o" :label="o" :value="o" />
      </el-select>
      <el-select v-model="filters.element_name" placeholder="属性" clearable style="width:100px" @change="onFilterChange">
        <el-option v-for="o in options.elements" :key="o" :label="o" :value="o" />
      </el-select>
      <el-select v-model="sort.field" placeholder="排序字段" style="width:130px" @change="onFilterChange">
        <el-option label="人物ID" value="character_id" />
        <el-option label="名字" value="name" />
        <el-option label="稀有度" value="rarity" />
        <el-option label="武力" value="force_value" />
        <el-option label="智力" value="intellect_value" />
        <el-option label="速度" value="speed_value" />
        <el-option label="体力" value="stamina_value" />
      </el-select>
      <el-select v-model="sort.order" placeholder="排序方式" style="width:110px" @change="onFilterChange">
        <el-option label="升序" value="asc" />
        <el-option label="降序" value="desc" />
      </el-select>
    </div>

    <!-- Card grid -->
    <div v-loading="loading" style="min-height:200px">
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start">
        <div
          v-for="card in pagedCards"
          :key="card.character_id"
          :style="cardItemStyle(card)"
          @click="selectCard(card)"
        >
          <div style="position:relative">
            <CardPreview
              :attribute="card"
              :design="design"
              :webp-path="card.webp_paths && card.webp_paths[0]"
              :width="100"
            />
            <div v-if="isSelected(card)" style="position:absolute;inset:0;background:rgba(64,158,255,0.35);display:flex;align-items:center;justify-content:center;border-radius:12px">
              <el-icon style="color:#fff;font-size:32px"><Check /></el-icon>
            </div>
          </div>
          <div style="text-align:center;margin-top:6px">
            <div style="color:#333;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px">{{ card.name }}</div>
            <div style="color:#666;font-size:10px">{{ card.rarity }} · {{ card.series_name || '-' }}</div>
          </div>
        </div>
      </div>
      <el-empty v-if="!loading && filteredCards.length === 0" description="没有找到卡牌" />
    </div>

    <!-- Pagination -->
    <div style="display:flex;justify-content:flex-end;margin-top:12px">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="filteredCards.length"
        layout="total, prev, pager, next"
        small
      />
    </div>

    <!-- Selected slots -->
    <div style="margin-top:12px;padding:10px;background:#f5f7fa;border-radius:6px">
      <div style="font-size:12px;color:#666;margin-bottom:8px">已选（{{ selected.length }}/4，第一张为队长）：</div>
      <div style="display:flex;gap:10px;align-items:center">
        <div
          v-for="(slot, i) in 4"
          :key="i"
          style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer"
          @click="removeSlot(i)"
        >
          <template v-if="selected[i]">
            <CardPreview
              :attribute="selected[i]"
              :design="design"
              :webp-path="selected[i].webp_paths && selected[i].webp_paths[0]"
              :width="70"
              :is-captain="i === 0"
            />
          </template>
          <div v-else style="width:70px;height:105px;border:2px dashed #ccc;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:24px;background:#fff">+</div>
        </div>
        <span style="font-size:11px;color:#999;margin-left:8px">点击已选卡牌可取消</span>
      </div>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="selected.length !== 4" @click="confirm">确认选择</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { Check } from '@element-plus/icons-vue'
import { getCardAttributeOptions, getCardMakerCharacters } from '../../api/cards'
import { buildAssetUrl } from '../../api/runtime'
import CardPreview from './CardPreview.vue'

const props = defineProps({
  modelValue: Boolean,
  initialSelected: { type: Array, default: () => [] },
  design: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const loading = ref(false)
const allCards = ref([])
const options = reactive({ series: [], factions: [], rarities: [], elements: [] })
const filters = reactive({ keyword: '', series_name: '', faction_name: '', rarity: '', element_name: '' })
const sort = reactive({ field: 'character_id', order: 'asc' })
const page = ref(1)
const pageSize = 20
const selected = ref([])

const RARITY_SORT_ORDER = ['N', 'R', 'CP', 'SR', 'SSR', 'PR', 'HR', 'UR']
const rarityRankMap = Object.fromEntries(RARITY_SORT_ORDER.map((item, index) => [item, index]))

let filterTimer = null
function onFilterChange() {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => { page.value = 1 }, 300)
}

const filteredCards = computed(() => {
  let list = allCards.value
  const kw = filters.keyword.trim().toLowerCase()
  if (kw) {
    list = list.filter(c =>
      (c.name || '').toLowerCase().includes(kw) ||
      (c.series_name || '').toLowerCase().includes(kw) ||
      (c.faction_name || '').toLowerCase().includes(kw) ||
      (c.rarity || '').toLowerCase().includes(kw) ||
      (c.skill1_name || '').toLowerCase().includes(kw) ||
      (c.skill2_name || '').toLowerCase().includes(kw)
    )
  }
  if (filters.series_name) list = list.filter(c => c.series_name === filters.series_name)
  if (filters.faction_name) list = list.filter(c => c.faction_name === filters.faction_name)
  if (filters.rarity) list = list.filter(c => c.rarity === filters.rarity)
  if (filters.element_name) list = list.filter(c => c.element_name === filters.element_name)
  return list
})

function compareCardValues(left, right, field, order) {
  const direction = order === 'desc' ? -1 : 1
  if (field === 'rarity') {
    const leftRank = rarityRankMap[String(left?.rarity || '').toUpperCase()] ?? Number.MAX_SAFE_INTEGER
    const rightRank = rarityRankMap[String(right?.rarity || '').toUpperCase()] ?? Number.MAX_SAFE_INTEGER
    return (leftRank - rightRank) * direction
  }

  if (['character_id', 'force_value', 'intellect_value', 'speed_value', 'stamina_value'].includes(field)) {
    return ((Number(left?.[field]) || 0) - (Number(right?.[field]) || 0)) * direction
  }

  return String(left?.[field] || '').localeCompare(String(right?.[field] || ''), 'zh-Hans-CN') * direction
}

const sortedCards = computed(() => {
  return [...filteredCards.value].sort((left, right) => {
    const primary = compareCardValues(left, right, sort.field, sort.order)
    if (primary !== 0) return primary
    return compareCardValues(left, right, 'character_id', 'asc')
  })
})

const pagedCards = computed(() => {
  const start = (page.value - 1) * pageSize
  return sortedCards.value.slice(start, start + pageSize)
})

function isSelected(card) {
  return selected.value.some(s => s.character_id === card.character_id)
}

function selectCard(card) {
  if (isSelected(card)) {
    selected.value = selected.value.filter(s => s.character_id !== card.character_id)
    return
  }
  if (selected.value.length >= 4) return
  selected.value = [...selected.value, card]
}

function removeSlot(i) {
  if (!selected.value[i]) return
  const next = [...selected.value]
  next.splice(i, 1)
  selected.value = next
}

function confirm() {
  emit('confirm', [...selected.value])
  emit('update:modelValue', false)
}

function cardItemStyle(card) {
  const sel = isSelected(card)
  return {
    width: '80px',
    height: '120px',
    borderRadius: '6px',
    overflow: 'hidden',
    position: 'relative',
    cursor: 'pointer',
    border: sel ? '2px solid #409eff' : '2px solid transparent',
    boxShadow: sel ? '0 0 8px rgba(64,158,255,0.6)' : '0 2px 6px rgba(0,0,0,0.2)',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    opacity: !sel && selected.value.length >= 4 ? 0.5 : 1,
  }
}

async function onOpen() {
  selected.value = [...props.initialSelected]
  filters.keyword = ''
  filters.series_name = ''
  filters.faction_name = ''
  filters.rarity = ''
  filters.element_name = ''
  sort.field = 'character_id'
  sort.order = 'asc'
  page.value = 1

  if (allCards.value.length === 0) {
    loading.value = true
    try {
      const [cards, opts] = await Promise.all([
        getCardMakerCharacters(),
        getCardAttributeOptions(),
      ])
      allCards.value = cards
      options.series = opts.series || []
      options.factions = opts.factions || []
      options.rarities = opts.rarities || []
      options.elements = opts.elements || []
    } finally {
      loading.value = false
    }
  }
}

watch(() => props.modelValue, (v) => { if (v) onOpen() })
</script>
