const crypto = require('crypto')
const bcrypt = require('bcryptjs')

const BCRYPT_RE = /^\$2[aby]\$/

function isBcryptHash(value) {
  return typeof value === 'string' && BCRYPT_RE.test(value)
}

function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), 10)
}

/** 兼容历史明文密码与 bcrypt 哈希 */
function checkPassword(input, stored) {
  if (!stored) return false
  if (isBcryptHash(stored)) {
    try { return bcrypt.compareSync(String(input), stored) } catch { return false }
  }
  return String(input) === String(stored)
}

/** 生成随机强密码（避免易混淆字符） */
function generateStrongPassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length]
  return out
}

module.exports = {
  isBcryptHash,
  hashPassword,
  checkPassword,
  generateStrongPassword
}
