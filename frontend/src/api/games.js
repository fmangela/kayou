import http from './http'

export const getGames = () => http.get('/games')
export const getGame = (id) => http.get(`/games/${id}`)
export const saveGame = (id, data) => http.put(`/games/${id}`, data)
