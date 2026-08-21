const BaseModel = require('./BaseModel')

/**
 * PK 淘汰记录（每轮可有多场，每场 3 人 PK）
 * 字段: id / roundId / roundIndex / pkIndex / attribute / challengerId
 *       / players[{ playerId, playerName, teamName, teamId, weight, votes, decision }]
 *       / queueBefore[] / queueAfter[] / status(voting|resolved)
 *       / createdAt / updatedAt
 */
class EliminationPk extends BaseModel {
  constructor(data) {
    super('EliminationPk')
    this.roundId = null
    this.roundIndex = null
    this.pkIndex = 1
    this.attribute = 'vocal'            // vocal | dance | charm
    this.challengerId = null            // 队首发起人
    this.players = []                   // 3 人，含 weight/votes/decision
    this.queueBefore = []               // 本场开始前的队列快照
    this.queueAfter = []                // 裁定后的新队列
    this.status = 'voting'              // voting | resolved
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

  static findOne(query) { return new EliminationPk().findOne(query) }
  static find(query = {}) { return new EliminationPk().find(query) }
  static deleteMany(query = {}) { return new EliminationPk().deleteMany(query) }
  static countDocuments(query = {}) { return new EliminationPk().countDocuments(query) }
}

module.exports = EliminationPk
