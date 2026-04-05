import http from './http'
import { useAuthStore } from '../stores/auth'
import { buildApiUrl } from './runtime'

export const getCharacters = () => http.get('/characters')
export const createCharacter = (data) => http.post('/characters', data)
export const updateCharacter = (id, data) => http.put(`/characters/${id}`, data)
export const deleteCharacter = (id) => http.delete(`/characters/${id}`)
export const batchDeleteCharacters = (ids) => http.post('/characters/batch-delete', { ids })
export const importCharacters = (file) => {
  const form = new FormData()
  form.append('file', file)
  return http.post('/characters/import', form)
}
export const exportCharacters = async () => {
  const auth = useAuthStore()
  const resp = await fetch(buildApiUrl('/characters/export'), {
    headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
  })

  if (!resp.ok) {
    let message = '导出失败'
    try {
      const data = await resp.json()
      message = data.message || message
    } catch {}
    throw new Error(message)
  }

  const blob = await resp.blob()
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = 'characters.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(downloadUrl)
}
