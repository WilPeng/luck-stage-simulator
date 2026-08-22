const BaseModel = require('./BaseModel')

/**
 * PK 淘汰记录（每轮可有多场，每场 3 人 PK）
 * 字段: id / roundId / roundIndex / pkIndex / attribute / challengerId / proposerId
 *       / players[{ playerId, playerName, teamName, teamId, weight, votes, decision }]
 *       / voteDetails[{ seatNumber, audienceName, gender, age, occupation, playerId }]  // 每位评审投给谁（用于查票）
 *       / queueBefore[] / queueAfter[] / status(proposed|voting|resolved)
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
    this.proposerId = null              // 申请人（选手提交 PK 申请时记录）
    this.players = []                   // 3 人，含 weight/votes/decision
    this.voteDetails = []               // 每评审投票明细 [{ seatNumber, audienceName, gender, age, occupation, playerId }]
    this.queueBefore = []               // 本场开始前的队列快照
    this.queueAfter = []                // 裁定后的新队列
    this.status = 'proposed'            // proposed(选手已提交待管理员发起) | voting | resolved
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
