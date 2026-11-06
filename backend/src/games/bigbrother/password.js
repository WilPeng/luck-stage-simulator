const crypto = require('crypto')
const bcrypt = require('bcryptjs')

const BCRYPT_RE = /^\$2[aby]\$/
const ENC_PREFIX = 'enc:v1:'

function isBcryptHash(value) {
  return typeof value === 'string' && BCRYPT_RE.test(value)
}

function isEncryptedPassword(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX)
}

// 用于可逆加密的密钥：优先 PASSWORD_ENC_KEY，其次复用 JWT_SECRET。
// 注意：该密钥一旦用于加密就不能随意更换，否则历史密码将无法解密。
function getEncKey() {
  const secret = process.env.PASSWORD_ENC_KEY || process.env.JWT_SECRET || 'bigbrother_secret_key'
  return crypto.createHash('sha256').update(String(secret)).digest()
}

/** AES-256-GCM 加密，结果形如 enc:v1:<iv>:<tag>:<ciphertext> */
function encryptPassword(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncKey(), iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

function decryptPassword(stored) {
  if (!isEncryptedPassword(stored)) return null
  try {
    const body = stored.slice(ENC_PREFIX.length)
    const [ivB64, tagB64, dataB64] = body.split(':')
    if (!ivB64 || !tagB64 || !dataB64) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncKey(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
    return dec.toString('utf8')
  } catch {
    return null
  }
}

/** 存储密码：可逆加密（管理员端可查看） */
function hashPassword(plain) {
  return encryptPassword(plain)
}

/** 兼容：加密串 / bcrypt 哈希 / 历史明文 */
function checkPassword(input, stored) {
  if (!stored) return false
  if (isEncryptedPassword(stored)) {
    const plain = decryptPassword(stored)
    return plain != null && String(input) === plain
  }
  if (isBcryptHash(stored)) {
    try { return bcrypt.compareSync(String(input), stored) } catch { return false }
  }
  return String(input) === String(stored)
}

/**
 * 读取可展示的明文密码：
 * - 加密串 -> 解密
 * - bcrypt -> null（不可逆，需要重置）
 * - 历史明文 -> 原样返回
 */
function readPassword(stored) {
  if (!stored) return null
  if (isEncryptedPassword(stored)) return decryptPassword(stored)
  if (isBcryptHash(stored)) return null
  return String(stored)
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
  isEncryptedPassword,
  encryptPassword,
  decryptPassword,
  hashPassword,
  checkPassword,
  readPassword,
  generateStrongPassword
}
