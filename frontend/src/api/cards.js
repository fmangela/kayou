import http from './http'
import { useAuthStore } from '../stores/auth'
import { buildApiUrl } from './runtime'

export const getCardAttributes = (params = {}) => http.get('/cards/attributes', { params })
export const getCardAttributeOptions = () => http.get('/cards/attributes/options')
export const updateCardAttribute = (characterId, data) => http.put(`/cards/attributes/${characterId}`, data)
export const getCardMakerCharacters = () => http.get('/cards/maker/characters')
export const getCardMakerDetail = (characterId) => http.get(`/cards/maker/${characterId}`)
export const getCardMakerGlobalDesign = () => http.get('/cards/maker/design')
export const saveCardMakerDesign = (characterId, data) => http.put(`/cards/maker/${characterId}`, data)

async function downloadCsv(path, filename) {
  const auth = useAuthStore()
  const resp = await fetch(buildApiUrl(path), {
    headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
  })

  if (!resp.ok) {
    let message = '下载失败'
    try {
      const data = await resp.json()
      message = data.message || message
    } catch {}
    throw new Error(message)
  }

  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const downloadCardAttributeTemplate = () => downloadCsv('/cards/attributes/template', 'card-attributes-template.csv')

export const exportCardAttributes = (params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return downloadCsv(`/cards/attributes/export${suffix}`, 'card-attributes.csv')
}

export const importCardAttributes = (file) => {
  const form = new FormData()
  form.append('file', file)
  return http.post('/cards/attributes/import', form)
}

export const getLmConfig = () => http.get('/cards/lm-config')
export const saveLmConfig = (data) => http.put('/cards/lm-config', data)
export const generateCardCodes = (episode) => http.post('/cards/attributes/generate-code', { episode })
export const generateAiAttributes = (character_ids, prompts) =>
  http.post('/cards/attributes/generate-ai', { character_ids, prompts })
