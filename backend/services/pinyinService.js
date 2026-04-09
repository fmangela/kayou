const { pinyin } = require('pinyin')

function toPinyin(name) {
  const result = pinyin(name, { style: 'normal' })
  return result.map(r => r[0]).join('')
}

function toPinyinInitials(name) {
  const source = String(name || '').trim()
  if (!source) return ''

  if (/[\u3400-\u9fff]/.test(source)) {
    const result = pinyin(source, { style: 'normal' })
    return result
      .map(item => (item[0] || '').charAt(0))
      .join('')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
  }

  const parts = source.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  if (!parts.length) return ''

  const initials = parts.length === 1
    ? parts[0].slice(0, 4)
    : parts.map(part => part.charAt(0)).join('')

  return initials.toUpperCase()
}

module.exports = { toPinyin, toPinyinInitials }
