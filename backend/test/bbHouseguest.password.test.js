const test = require('node:test')
const assert = require('node:assert')

const BBHouseguest = require('../src/games/bigbrother/models/BBHouseguest')
const BaseModel = require('../src/models/BaseModel')
const {
  hashPassword, checkPassword, readPassword,
  isBcryptHash, isEncryptedPassword, generateStrongPassword
} = require('../src/games/bigbrother/password')

test('toObject 保留 password，确保 save() 持久化时不会丢失密码', () => {
  const g = new BBHouseguest({ id: 'g1', username: 'u1', password: 'STORED' })
  assert.equal(g.toObject().password, 'STORED')
  // BaseModel.save() 通过 stripInternalFields -> toObject() 序列化
  assert.equal(BaseModel.stripInternalFields(g).password, 'STORED')
})

test('toSafeObject 不包含 password，用于接口响应脱敏', () => {
  const g = new BBHouseguest({ id: 'g1', username: 'u1', password: 'STORED' })
  const safe = g.toSafeObject()
  assert.equal(Object.prototype.hasOwnProperty.call(safe, 'password'), false)
  assert.equal(safe.username, 'u1')
})

test('密码可逆加密，管理员可读取明文', () => {
  const stored = hashPassword('secret123')
  assert.equal(isEncryptedPassword(stored), true)
  assert.notEqual(stored, 'secret123')
  assert.equal(readPassword(stored), 'secret123')
  assert.equal(checkPassword('secret123', stored), true)
  assert.equal(checkPassword('wrong', stored), false)
})

test('兼容历史明文与 bcrypt', () => {
  assert.equal(checkPassword('plain', 'plain'), true)
  assert.equal(readPassword('plain'), 'plain')

  const bcrypt = require('bcryptjs').hashSync('legacy', 10)
  assert.equal(isBcryptHash(bcrypt), true)
  assert.equal(checkPassword('legacy', bcrypt), true)
  // bcrypt 不可逆，管理员端无法查看，只能重置
  assert.equal(readPassword(bcrypt), null)
})

test('随机密码长度正确', () => {
  assert.equal(generateStrongPassword(16).length, 16)
})
