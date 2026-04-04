<template>
  <div>
    <CharacterTable />
    <LLMConfigPanel />
    <AIDrawingPanel />
    <WebpConvertPanel />
  </div>
</template>

<script setup>
import CharacterTable from '../../components/workflow/CharacterTable.vue'
import LLMConfigPanel from '../../components/workflow/LLMConfigPanel.vue'
import AIDrawingPanel from '../../components/workflow/AIDrawingPanel.vue'
import WebpConvertPanel from '../../components/workflow/WebpConvertPanel.vue'
</script>
