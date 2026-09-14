const BaseModel = require('../../../models/BaseModel')

class BBMinigameReplay extends BaseModel {
  constructor(data) {
    super('BBMinigameReplay')
    data = data || {}
    this.id = data.id || null
    this.roomId = data.roomId || null
    this.gameType = data.gameType || ''       // hoh | veto | bbbb | finale
    this.minigameId = data.minigameId || ''
    this.minigameName = data.minigameName || ''
    this.category = data.category || ''
    this.roundIndex = data.roundIndex ?? null
    this.roundId = data.roundId || ''
    this.targetScore = data.targetScore ?? null

    this.participants = (data.participants || []).map(p => ({
      playerId: p.playerId,
      playerName: p.playerName || '',
      avatar: p.avatar || null
    }))

    this.status = data.status || 'playing'    // playing | finished | stopped
    this.startedAt = data.startedAt || new Date().toISOString()
    this.endedAt = data.endedAt || null

    this.winner = data.winner || null          // { playerId, playerName }
    this.winners = data.winners || []
    this.scores = data.scores || {}
    this.finalStates = data.finalStates || {}

    // 事件日志：[{ t, playerId, playerName, type, text, data }]
    this.events = data.events || []

    this.gameId = data.gameId || 'bigbrother'
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

  static findOne(query) { return new BBMinigameReplay().findOne(query) }
  static find(query = {}) { return new BBMinigameReplay().find(query) }
  static findPaginated(query, opts) { return new BBMinigameReplay().findPaginated(query, opts) }
  static deleteOne(query) { return new BBMinigameReplay().deleteOne(query) }
  static deleteMany(query) { return new BBMinigameReplay().deleteMany(query) }
  static countDocuments(query = {}) { return new BBMinigameReplay().countDocuments(query) }
  static insertMany(items) { return new BBMinigameReplay().insertMany(items.map(i => new BBMinigameReplay(i))) }
}

module.exports = BBMinigameReplay
