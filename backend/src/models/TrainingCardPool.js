const BaseModel = require('./BaseModel')

class TrainingCardPool extends BaseModel {
  constructor(data = {}) {
    super('TrainingCardPool')
    this.id = data.id
    this.roundId = data.roundId || null
    this.roundIndex = data.roundIndex ?? null
    this.index = data.index ?? 0           // 卡牌序号（1..N）
    this.perPersonDrawCount = data.perPersonDrawCount ?? 0 // 本轮每人可抽数量
    this.totalCards = data.totalCards ?? 0 // 本轮卡牌总数
    this.cardId = data.cardId || null
    this.cardName = data.cardName || ''
    this.cardType = data.cardType || 'mixed'
    this.effect = data.effect || {}
    this.drawnBy = data.drawnBy || null     // playerId（null 表示未抽出）
    this.drawnByName = data.drawnByName || ''
    this.drawnAt = data.drawnAt || null
    this.gameId = data.gameId || null
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || new Date().toISOString()
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new TrainingCardPool().findOne(query) }
  static find(query = {}) { return new TrainingCardPool().find(query) }
  static deleteMany(query) { return new TrainingCardPool().deleteMany(query) }
  static countDocuments(query = {}) { return new TrainingCardPool().countDocuments(query) }
  static insertMany(items) { return new TrainingCardPool().insertMany(items.map(i => new TrainingCardPool(i))) }
}

module.exports = TrainingCardPool
