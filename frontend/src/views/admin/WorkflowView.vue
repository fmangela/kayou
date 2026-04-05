<template>
  <div>
    <CharacterTable ref="charTableRef" />
    <LLMConfigPanel @refresh="charTableRef?.loadData()" />
    <AIDrawingPanel />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import CharacterTable from '../../components/workflow/CharacterTable.vue'
import LLMConfigPanel from '../../components/workflow/LLMConfigPanel.vue'
import AIDrawingPanel from '../../components/workflow/AIDrawingPanel.vue'

const charTableRef = ref(null)
</script>
