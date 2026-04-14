import http from './http'

// Templates
export const getSkillTemplates = () => http.get('/skills/templates')
export const getSkillTemplate = (id) => http.get(`/skills/templates/${id}`)
export const createSkillTemplate = (data) => http.post('/skills/templates', data)
export const updateSkillTemplate = (id, data) => http.put(`/skills/templates/${id}`, data)

// Definitions
export const getSkills = (params) => http.get('/skills', { params })
export const getSkill = (id) => http.get(`/skills/${id}`)
export const createSkill = (data) => http.post('/skills', data)
export const updateSkill = (id, data) => http.put(`/skills/${id}`, data)
export const updateSkillStatus = (id, status) => http.patch(`/skills/${id}/status`, { status })
