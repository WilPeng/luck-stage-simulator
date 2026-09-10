const { v4: uuidv4 } = require('uuid')

const generateId = () => uuidv4()

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

// 从数组随机取 n 个（不重复）
function sample(arr, n) {
  const copy = [...arr]
  const out = []
  while (out.length < n && copy.length) {
    const idx = randomInt(0, copy.length - 1)
    out.push(copy.splice(idx, 1)[0])
  }
  return out
}

// 去除题目中的答案字段，用于下发给客户端
function sanitizeQuestion(q) {
  const { correctAnswer, ...rest } = q
  return rest
}

function shuffle(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

module.exports = {
  generateId,
  randomInt,
  sample,
  shuffle,
  sanitizeQuestion
}
