<template>
  <el-card style="margin-bottom:16px">
    <template #header>
      <span style="font-weight:bold">大模型 API 配置</span>
    </template>
    <el-form :model="llmForm" label-width="120px" inline>
      <el-form-item label="API Base URL">
        <el-input v-model="llmForm.base_url" placeholder="https://api.openai.com/v1" style="width:280px" />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="llmForm.api_key" type="password" show-password placeholder="sk-..." style="width:280px" />
      </el-form-item>
      <el-form-item label="模型名称">
        <el-input v-model="llmForm.model" placeholder="gpt-4o" style="width:180px" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="saveConfig" :loading="saving">保存配置</el-button>
        <el-button @click="testConnection" :loading="testing">测试连接</el-button>
      </el-form-item>
    </el-form>

    <el-divider />

    <div style="font-weight:bold;margin-bottom:12px">MX AI 绘画配置</div>
    <el-form :model="mxForm" label-width="120px" inline>
      <el-form-item label="MX API Key">
        <el-input v-model="mxForm.api_key" type="password" show-password placeholder="nb_..." style="width:400px" />
      </el-form-item>
      <el-form-item label="Base URL">
        <el-input v-model="mxForm.base_url" placeholder="https://www.mxai.cn" style="width:240px" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="saveMxConfig" :loading="savingMx">保存MX配置</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getLLMConfig, saveLLMConfig, testLLMConnection, getMxConfig, saveMxConfig as saveMxApi } from '../../api/llm'

const llmForm = ref({ base_url: '', api_key: '', model: '' })
const mxForm = ref({ api_key: '', base_url: '' })
const saving = ref(false)
const testing = ref(false)
const savingMx = ref(false)

async function loadConfigs() {
  try {
    const [llm, mx] = await Promise.all([getLLMConfig(), getMxConfig()])
    llmForm.value = { base_url: llm.base_url || '', api_key: llm.api_key || '', model: llm.model || '' }
    mxForm.value = { api_key: mx.api_key || '', base_url: mx.base_url || '' }
  } catch {}
}

async function saveConfig() {
  saving.value = true
  try {
    await saveLLMConfig(llmForm.value)
    ElMessage.success('LLM配置已保存')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testing.value = true
  try {
    const res = await testLLMConnection()
    ElMessage.success(`连接成功，模型: ${res.model}`)
  } catch (e) {
    ElMessage.error(e.message || '连接失败')
  } finally {
    testing.value = false
  }
}

async function saveMxConfig() {
  savingMx.value = true
  try {
    await saveMxApi(mxForm.value)
    ElMessage.success('MX AI配置已保存')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    savingMx.value = false
  }
}

onMounted(loadConfigs)
</script>
