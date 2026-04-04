import http from './http'

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
export const exportCharacters = () => {
  window.open('http://localhost:3174/api/characters/export')
}
