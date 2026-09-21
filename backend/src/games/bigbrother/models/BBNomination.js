const BaseModel = require('../../../models/BaseModel')

class BBNomination extends BaseModel {
  constructor(data) {
    super('BBNomination')
    this.id = data?.id || null
    this.roundId = data?.roundId || null
    this.nomineeIds = data?.nomineeIds || [] // [playerId1, playerId2]
    this.nomineeNames = data?.nomineeNames || [] // [name1, name2]
    this.hohId = data?.hohId || null
    this.hohName = data?.hohName || ''
    this.replacementNomineeId = data?.replacementNomineeId || null // 替换提名（否决权使用后）
    this.replacementNomineeName = data?.replacementNomineeName || ''
    this.bbbbWinnerId = data?.bbbbWinnerId || null   // BBBB 胜者（安全，不进入淘汰投票）
    this.bbbbWinnerName = data?.bbbbWinnerName || ''
    // 钥匙仪式：{ order:[{playerId,playerName}], drawnCount, nomineeCount, active }
    this.keyCeremony = data?.keyCeremony || null
    this.vetoUsed = data?.vetoUsed || false
    this.gameId = data?.gameId || 'bigbrother'
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

  static findOne(query) { return new BBNomination().findOne(query) }
  static find(query = {}) { return new BBNomination().find(query) }
  static deleteMany(query = {}) { return new BBNomination().deleteMany(query) }
  static countDocuments(query = {}) { return new BBNomination().countDocuments(query) }
  static insertMany(items) { return new BBNomination().insertMany(items.map(i => new BBNomination(i))) }
}

module.exports = BBNomination
