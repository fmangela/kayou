const { pinyin } = require('pinyin')

function toPinyin(name) {
  const result = pinyin(name, { style: 'normal' })
  return result.map(r => r[0]).join('')
}

module.exports = { toPinyin }
