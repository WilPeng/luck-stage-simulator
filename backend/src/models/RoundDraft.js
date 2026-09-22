const BaseModel = require('./BaseModel')

/**
 * 队长蛇形选人（互动选秀状态，每轮一份）
 * 字段: id / roundId / roundIndex / teamOrder[] / captains{ teamId: playerId }
 *       / sequence[{ teamId, no }] / step / picks[{ teamId, playerId, at }]
 *       / status(active|completed) / createdAt / updatedAt
 */
class RoundDraft extends BaseModel {
  constructor(data) {
    super('RoundDraft')
    this.id = data?.id || null
    this.roundId = data?.roundId || null
    this.roundIndex = data?.roundIndex ?? null
    this.teamOrder = data?.teamOrder || []
    this.captains = data?.captains || {}
    this.sequence = data?.sequence || []
    this.step = data?.step ?? 0
    this.picks = data?.picks || []
    this.status = data?.status || 'active'
    this.createdAt = data?.createdAt || new Date().toISOString()
    this.updatedAt = data?.updatedAt || new Date().toISOString()
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new RoundDraft().findOne(query) }
  static find(query = {}) { return new RoundDraft().find(query) }
  static deleteMany(query = {}) { return new RoundDraft().deleteMany(query) }
  static deleteOne(query = {}) { return new RoundDraft().deleteOne(query) }
  static countDocuments(query = {}) { return new RoundDraft().countDocuments(query) }
}

module.exports = RoundDraft
