// 支持多种环境变量配置方式，优先级：VITE_API_ORIGIN > BACKEND_PORT > 默认 3174
const DEFAULT_BACKEND_PORT = typeof process !== 'undefined' && process.env?.BACKEND_PORT
    ? process.env.BACKEND_PORT
    : '3174'

function getCurrentProtocol() {
    if (typeof window === 'undefined') return 'http:'
    return window.location.protocol
}

function getCurrentHostname() {
    if (typeof window === 'undefined') return 'localhost'
    return window.location.hostname || 'localhost'
}

function trimTrailingSlash(value) {
    return value.replace(/\/$/, '')
}

const backendOrigin = trimTrailingSlash(
    import.meta.env.VITE_API_ORIGIN || `${getCurrentProtocol()}//${getCurrentHostname()}:${DEFAULT_BACKEND_PORT}`
)

const apiBaseUrl = trimTrailingSlash(
    import.meta.env.VITE_API_BASE_URL || `${backendOrigin}/api`
)

export const API_ORIGIN = backendOrigin
export const API_BASE_URL = apiBaseUrl

export function buildApiUrl(path = '') {
    if (!path) return API_BASE_URL
    if (/^https?:\/\//.test(path)) return path
    return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export function buildAssetUrl(path = '') {
    if (!path) return API_ORIGIN
    if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path
    return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}
