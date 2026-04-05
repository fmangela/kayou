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

    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <el-button type="success" :loading="generatingDesc" @click="handleGenerateDesc">
        生成人物描述
      </el-button>
      <el-button type="success" :loading="generatingPrompts" @click="handleGeneratePrompts">
        生成提示词
      </el-button>
    </div>

    <div v-if="progressLog.length" style="margin-top:12px;max-height:120px;overflow-y:auto;background:#f5f5f5;padding:8px;border-radius:4px;font-size:12px">
      <div v-for="(line, i) in progressLog" :key="i">{{ line }}</div>
    </div>

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
import { buildApiUrl } from '../../api/runtime'
import { useAuthStore } from '../../stores/auth'

const emit = defineEmits(['refresh'])
const auth = useAuthStore()

const llmForm = ref({ base_url: '', api_key: '', model: '' })
const mxForm = ref({ api_key: '', base_url: '' })
const saving = ref(false)
const testing = ref(false)
const savingMx = ref(false)
const generatingDesc = ref(false)
const generatingPrompts = ref(false)
const progressLog = ref([])

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

function streamGenerate(url, body, loadingRef, doneCallback) {
  progressLog.value = []
  loadingRef.value = true
  const token = auth.token
  fetch(buildApiUrl(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).then(async (resp) => {
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') { doneCallback(); return }
        try {
          const obj = JSON.parse(data)
          if (obj.error) progressLog.value.push(`❌ ID ${obj.id}: ${obj.error}`)
          else progressLog.value.push(`✓ ID ${obj.id} 完成`)
        } catch {}
      }
    }
    doneCallback()
  }).catch(e => {
    ElMessage.error(e.message)
    doneCallback()
  })
}

function handleGenerateDesc() {
  streamGenerate('/llm/generate-descriptions', {}, generatingDesc, () => {
    generatingDesc.value = false
    emit('refresh')
  })
}

function handleGeneratePrompts() {
  streamGenerate('/llm/generate-prompts', {}, generatingPrompts, () => {
    generatingPrompts.value = false
    emit('refresh')
  })
}

onMounted(loadConfigs)
</script>
