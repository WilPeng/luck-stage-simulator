const BaseModel = require('./BaseModel')

/**
 * 危险名单（每轮独立，淘汰环节前由管理员确认）
 * 字段: id / roundId / roundIndex / playerIds[] / colors{ playerId: color } / pkSize / confirmed / createdAt / updatedAt
 */
class DangerConfirm extends BaseModel {
  constructor(data) {
    super('DangerConfirm')
    this.roundId = null
    this.roundIndex = null
    this.playerIds = []
    this.colors = {}                  // playerId -> 固定颜色（全员一致展示）
    this.queueOrder = []              // 当前 PK 队列顺序（管理员可手动调整）
    this.pkSize = 3                   // 每场 PK 参与人数（挑战者 + pkSize-1 名对手）
    this.confirmed = false
    this.createdAt = new Date().toISOString()
    this.updatedAt = new Date().toISOString()
    if (data) Object.assign(this, data)
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new DangerConfirm().findOne(query) }
  static find(query = {}) { return new DangerConfirm().find(query) }
  static deleteMany(query = {}) { return new DangerConfirm().deleteMany(query) }
  static countDocuments(query = {}) { return new DangerConfirm().countDocuments(query) }
}

module.exports = DangerConfirm
