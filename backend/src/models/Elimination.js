const BaseModel = require('./BaseModel')

/**
 * 淘汰记录（每轮独立）
 * 字段: id / roundId / roundIndex / userId / playerId / userName / teamId / teamName
 *       / reason / rank / finalScore / eliminated / eliminatedAt / restoredAt / restoredBy
 *       / createdAt / updatedAt
 * 
 * 注意: playerId 和 userId 同时支持，但统一对外为 playerId（与新架构一致）
 */
class Elimination extends BaseModel {
  constructor(data) {
    super('Elimination')
    const d = data || {}
    this.id = d.id || null
    this.roundId = d.roundId || null
    this.roundIndex = d.roundIndex ?? (typeof d.round === 'number' ? d.round : null)
    // 同时支持 userId 和 playerId
    this.playerId = d.playerId || d.userId || null
    this.userId = this.playerId
    this.userName = d.userName || d.playerName || null
    this.teamId = d.teamId || null
    this.teamName = d.teamName || null
    this.reason = d.reason || ''
    this.rank = d.rank ?? null
    this.finalScore = d.finalScore ?? null
    this.eliminated = d.eliminated !== undefined ? d.eliminated : true
    this.eliminatedAt = d.eliminatedAt || new Date().toISOString()
    this.restoredAt = d.restoredAt || null
    this.restoredBy = d.restoredBy || null
    this.createdAt = d.createdAt || new Date().toISOString()
    this.updatedAt = d.updatedAt || new Date().toISOString()
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new Elimination().findOne(query) }
  static find(query = {}) { return new Elimination().find(query) }
  static deleteMany(query = {}) { return new Elimination().deleteMany(query) }
  static deleteOne(query = {}) { return new Elimination().deleteOne(query) }
  static countDocuments(query = {}) { return new Elimination().countDocuments(query) }
  static insertMany(items) {
    const model = new Elimination()
    return model.insertMany(items.map(i => new Elimination(i)))
  }
}

module.exports = Elimination
