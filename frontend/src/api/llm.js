import http from './http'

export const getLLMConfig = () => http.get('/llm/config')
export const saveLLMConfig = (data) => http.post('/llm/config', data)
export const testLLMConnection = () => http.post('/llm/test')

export const getMxConfig = () => http.get('/drawing/config')
export const saveMxConfig = (data) => http.post('/drawing/config', data)
