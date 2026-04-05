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

    <div style="font-weight:bold;margin-bottom:12px">人物描述提示词模板</div>
    <el-form :model="llmForm" label-width="120px">
      <el-form-item label="背景介绍模板">
        <el-input v-model="llmForm.desc_background_template" type="textarea" :rows="4" />
      </el-form-item>
      <el-form-item label="外形描述模板">
        <el-input v-model="llmForm.desc_appearance_template" type="textarea" :rows="4" />
      </el-form-item>
    </el-form>

    <div style="color:#666;font-size:12px;line-height:1.8;margin-bottom:12px">
      可用占位符：
      <code v-pre>{{name}}</code>
      <code v-pre>{{series_name}}</code>
      <code v-pre>{{faction_name}}</code>
      <code v-pre>{{rarity}}</code>
      <code v-pre>{{element_name}}</code>
      <code v-pre>{{background}}</code>
      <code v-pre>{{appearance}}</code>
      条件块写法：
      <code v-pre>{{#if series_name}}...{{/if}}</code>
    </div>

    <el-descriptions border :column="1" size="small" style="margin-bottom:12px">
      <el-descriptions-item label="`{{name}}`">
        人物名字，也就是人物管理里的名字字段，比如“曹操”“迪迦”“博丽灵梦”。
      </el-descriptions-item>
      <el-descriptions-item label="`{{series_name}}`">
        系列名称，来自卡牌属性编辑里的“系列”，比如“三国”“奥特曼”“东方Project”“中国神话”。
      </el-descriptions-item>
      <el-descriptions-item label="`{{faction_name}}`">
        阵营名称，来自卡牌属性编辑里的“阵营”，比如“魏”“光之国”“博丽神社”“天庭”。
      </el-descriptions-item>
      <el-descriptions-item label="`{{rarity}}`">
        稀有度，来自卡牌属性编辑里的“稀有度”，比如“N”“SR”“SSR”“UR”。
      </el-descriptions-item>
      <el-descriptions-item label="`{{element_name}}`">
        属性名称，来自卡牌属性编辑里的“属性”，比如“火”“水”“金”“光”“暗”。
      </el-descriptions-item>
      <el-descriptions-item label="`{{background}}`">
        当前人物已有的背景介绍文本。做二次加工或生成提示词时可引用它。
      </el-descriptions-item>
      <el-descriptions-item label="`{{appearance}}`">
        当前人物已有的外形描述文本。做二次加工或生成提示词时可引用它。
      </el-descriptions-item>
      <el-descriptions-item label="`{{#if xxx}}...{{/if}}`">
        条件块。只有对应占位符有值时，里面那段文字才会保留；没有值时会整段去掉，适合避免空字段把提示词写乱。
      </el-descriptions-item>
    </el-descriptions>

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
    <div style="color:#666;font-size:12px;line-height:1.8;margin-bottom:12px">
      当前已接入 MX 的 V2 绘图接口：
      <code>/api/v2/nano2</code>
      和
      <code>/api/v2/draw-5-0</code>
      。这两个接口都是异步任务，提交后会返回
      <code>task_id</code>
      ，系统会自动轮询直到出图完成。
    </div>

    <el-form :model="mxForm" label-width="140px" label-position="top">
      <el-row :gutter="16">
        <el-col :xs="24" :lg="12">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>MX API Key</span>
                <el-tooltip content="MX API 的 access_key。后端会按 Authorization: Bearer access_key 的方式请求 MX V2 接口。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-input v-model="mxForm.api_key" type="password" show-password placeholder="你的 access_key" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :lg="24">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>Base URL</span>
                <el-tooltip content="MX API 的基础地址。默认使用 https://open.mxapi.org，实际请求会在它后面拼接 /api/v2/nano2 或 /api/v2/draw-5-0。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-input v-model="mxForm.base_url" placeholder="https://open.mxapi.org" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :lg="12">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>绘图模式</span>
                <el-tooltip content="决定批量绘图时实际调用哪个模型。nano2 只跑 Nano Banana2，jimeng5 只跑即梦绘画5.0，dual 会两个都跑一遍。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-select v-model="mxForm.draw_mode" style="width:100%">
              <el-option label="只用 Nano Banana2" value="nano2" />
              <el-option label="只用 即梦绘画5.0" value="jimeng5" />
              <el-option label="两个模型都跑" value="dual" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="12">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>轮询间隔(ms)</span>
                <el-tooltip content="提交任务后，每隔多少毫秒查询一次 task_id 状态。默认 5000，也就是 5 秒查一次。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-input-number
              v-model="mxForm.poll_interval_ms"
              :min="1000"
              :step="1000"
              controls-position="right"
              style="width:100%"
            />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="12">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>最长等待(ms)</span>
                <el-tooltip content="单个绘图任务允许等待的最大时长。超过这个时间还没完成就会按超时处理。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-input-number
              v-model="mxForm.max_wait_ms"
              :min="10000"
              :step="10000"
              controls-position="right"
              style="width:100%"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item>
        <el-button type="primary" @click="saveMxConfig" :loading="savingMx">保存MX配置</el-button>
      </el-form-item>
    </el-form>

    <el-divider />

    <div style="font-weight:bold;margin-bottom:12px">Nano Banana2 参数</div>
    <el-form :model="mxForm" label-width="140px">
      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>提示词来源</span>
                <el-tooltip content="生成 Nano Banana2 时，优先从人物的哪个字段读取 prompt。通常推荐用 nb2_prompt。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-select v-model="mxForm.nano2_prompt_field" style="width:100%">
              <el-option label="nb2_prompt（推荐）" value="nb2_prompt" />
              <el-option label="mj_prompt" value="mj_prompt" />
              <el-option label="appearance" value="appearance" />
              <el-option label="background" value="background" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>图片分辨率</span>
                <el-tooltip content="对应 MX nano2 的 image_size，可选 1K、2K、4K。分辨率越高，通常耗时越长。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-select v-model="mxForm.nano2_image_size" style="width:100%">
              <el-option label="1K" value="1K" />
              <el-option label="2K" value="2K" />
              <el-option label="4K" value="4K" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>宽高比</span>
                <el-tooltip content="对应 MX nano2 的 aspect_ratio，控制画面比例，比如 1:1、3:4、16:9。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-select v-model="mxForm.nano2_aspect_ratio" style="width:100%">
              <el-option label="1:1" value="1:1" />
              <el-option label="3:4" value="3:4" />
              <el-option label="4:3" value="4:3" />
              <el-option label="9:16" value="9:16" />
              <el-option label="16:9" value="16:9" />
              <el-option label="21:9" value="21:9" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>X-Channel</span>
                <el-tooltip content="对应请求头 X-Channel。Nano Banana2 支持按通道下发，不填就走 default 通道。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-input v-model="mxForm.nano2_x_channel" placeholder="不填就走 default 通道" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item>
        <template #label>
          <span class="mx-help-label">
            <span>参考图 URL</span>
            <el-tooltip content="对应 reference_images 数组。每行一张公开可访问的图片地址，留空就是纯文生图。">
              <span class="mx-help-icon">?</span>
            </el-tooltip>
          </span>
        </template>
        <el-input
          v-model="mxForm.nano2_reference_images_text"
          type="textarea"
          :rows="4"
          placeholder="每行一个 URL，会保存到 reference_images 数组里"
        />
      </el-form-item>
    </el-form>

    <el-divider />

    <div style="font-weight:bold;margin-bottom:12px">即梦绘画 5.0 参数</div>
    <el-form :model="mxForm" label-width="140px">
      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>提示词来源</span>
                <el-tooltip content="生成即梦绘画 5.0 时，优先从人物的哪个字段读取 prompt。通常推荐用 mj_prompt。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-select v-model="mxForm.jimeng5_prompt_field" style="width:100%">
              <el-option label="mj_prompt（推荐）" value="mj_prompt" />
              <el-option label="nb2_prompt" value="nb2_prompt" />
              <el-option label="appearance" value="appearance" />
              <el-option label="background" value="background" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>模型名称</span>
                <el-tooltip content="对应 draw-5-0 接口里的 model。当前文档默认值是 doubao-seedream-5-0-260128。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-input v-model="mxForm.jimeng5_model" placeholder="doubao-seedream-5-0-260128" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>图片尺寸</span>
                <el-tooltip content="对应 draw-5-0 的 size，当前文档支持 2K 和 3K。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-select v-model="mxForm.jimeng5_size" style="width:100%">
              <el-option label="2K" value="2K" />
              <el-option label="3K" value="3K" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>联网搜索</span>
                <el-tooltip content="对应 draw-5-0 的 web_search。开启后模型可以联网搜索，但会增加一定时延。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-switch v-model="mxForm.jimeng5_web_search" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8">
          <el-form-item>
            <template #label>
              <span class="mx-help-label">
                <span>输出格式</span>
                <el-tooltip content="对应 draw-5-0 的 output_format，控制返回图片是 jpeg 还是 png。">
                  <span class="mx-help-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <el-select v-model="mxForm.jimeng5_output_format" style="width:100%">
              <el-option label="jpeg" value="jpeg" />
              <el-option label="png" value="png" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item>
        <template #label>
          <span class="mx-help-label">
            <span>参考图 URL</span>
            <el-tooltip content="对应 draw-5-0 的 reference_images。每行一张公开图片地址，不填就是纯提示词生成。">
              <span class="mx-help-icon">?</span>
            </el-tooltip>
          </span>
        </template>
        <el-input
          v-model="mxForm.jimeng5_reference_images_text"
          type="textarea"
          :rows="4"
          placeholder="每行一个 URL，会保存到 reference_images 数组里"
        />
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

const llmForm = ref({
  base_url: '',
  api_key: '',
  model: '',
  desc_background_template: '',
  desc_appearance_template: '',
})

function createDefaultMxForm() {
  return {
    api_key: '',
    base_url: 'https://open.mxapi.org',
    draw_mode: 'jimeng5',
    poll_interval_ms: 5000,
    max_wait_ms: 300000,
    nano2_prompt_field: 'nb2_prompt',
    nano2_image_size: '1K',
    nano2_aspect_ratio: '1:1',
    nano2_reference_images_text: '',
    nano2_x_channel: '',
    jimeng5_prompt_field: 'mj_prompt',
    jimeng5_model: 'doubao-seedream-5-0-260128',
    jimeng5_size: '2K',
    jimeng5_web_search: false,
    jimeng5_output_format: 'jpeg',
    jimeng5_reference_images_text: '',
  }
}

function toLineText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('\n')
  return ''
}

function toUrlList(text) {
  return String(text || '')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
}

function applyMxConfig(mx = {}) {
  const defaults = createDefaultMxForm()
  mxForm.value = {
    ...defaults,
    api_key: mx.api_key || '',
    base_url: mx.base_url || defaults.base_url,
    draw_mode: mx.draw_mode || defaults.draw_mode,
    poll_interval_ms: Number(mx.poll_interval_ms) || defaults.poll_interval_ms,
    max_wait_ms: Number(mx.max_wait_ms) || defaults.max_wait_ms,
    nano2_prompt_field: mx.nano2_prompt_field || defaults.nano2_prompt_field,
    nano2_image_size: mx.nano2_image_size || defaults.nano2_image_size,
    nano2_aspect_ratio: mx.nano2_aspect_ratio || defaults.nano2_aspect_ratio,
    nano2_reference_images_text: toLineText(mx.nano2_reference_images),
    nano2_x_channel: mx.nano2_x_channel || '',
    jimeng5_prompt_field: mx.jimeng5_prompt_field || defaults.jimeng5_prompt_field,
    jimeng5_model: mx.jimeng5_model || defaults.jimeng5_model,
    jimeng5_size: mx.jimeng5_size || defaults.jimeng5_size,
    jimeng5_web_search: typeof mx.jimeng5_web_search === 'boolean' ? mx.jimeng5_web_search : defaults.jimeng5_web_search,
    jimeng5_output_format: mx.jimeng5_output_format || defaults.jimeng5_output_format,
    jimeng5_reference_images_text: toLineText(mx.jimeng5_reference_images),
  }
}

function buildMxPayload() {
  return {
    api_key: mxForm.value.api_key,
    base_url: mxForm.value.base_url,
    draw_mode: mxForm.value.draw_mode,
    poll_interval_ms: Number(mxForm.value.poll_interval_ms) || 5000,
    max_wait_ms: Number(mxForm.value.max_wait_ms) || 300000,
    nano2_prompt_field: mxForm.value.nano2_prompt_field,
    nano2_image_size: mxForm.value.nano2_image_size,
    nano2_aspect_ratio: mxForm.value.nano2_aspect_ratio,
    nano2_reference_images: toUrlList(mxForm.value.nano2_reference_images_text),
    nano2_x_channel: mxForm.value.nano2_x_channel,
    jimeng5_prompt_field: mxForm.value.jimeng5_prompt_field,
    jimeng5_model: mxForm.value.jimeng5_model,
    jimeng5_size: mxForm.value.jimeng5_size,
    jimeng5_web_search: Boolean(mxForm.value.jimeng5_web_search),
    jimeng5_output_format: mxForm.value.jimeng5_output_format,
    jimeng5_reference_images: toUrlList(mxForm.value.jimeng5_reference_images_text),
  }
}

const mxForm = ref(createDefaultMxForm())
const saving = ref(false)
const testing = ref(false)
const savingMx = ref(false)
const generatingDesc = ref(false)
const generatingPrompts = ref(false)
const progressLog = ref([])

async function loadConfigs() {
  try {
    const [llm, mx] = await Promise.all([getLLMConfig(), getMxConfig()])
    llmForm.value = {
      base_url: llm.base_url || '',
      api_key: llm.api_key || '',
      model: llm.model || '',
      desc_background_template: llm.desc_background_template || '',
      desc_appearance_template: llm.desc_appearance_template || '',
    }
    applyMxConfig(mx)
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
    const res = await saveMxApi(buildMxPayload())
    if (res?.config) applyMxConfig(res.config)
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
  streamGenerate('/llm/generate-descriptions', {
    desc_background_template: llmForm.value.desc_background_template,
    desc_appearance_template: llmForm.value.desc_appearance_template,
  }, generatingDesc, () => {
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

<style scoped>
.mx-help-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.mx-help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e8f3ff;
  color: #2f6bff;
  font-size: 11px;
  font-weight: 700;
  cursor: help;
  border: 1px solid #bfd6ff;
  box-sizing: border-box;
}
</style>
