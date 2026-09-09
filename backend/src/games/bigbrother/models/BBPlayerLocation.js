const BaseModel = require('../../../models/BaseModel')

class BBPlayerLocation extends BaseModel {
  constructor(data) {
    super('BBPlayerLocation')
    this.id = data?.id || null
    this.playerId = data?.playerId || ''
    this.playerName = data?.playerName || ''
    this.currentRoomId = data?.currentRoomId || 'living_room'
    this.enteredAt = data?.enteredAt || new Date().toISOString()
    this.gameId = data?.gameId || 'bigbrother'
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new BBPlayerLocation().findOne(query) }
  static find(query = {}) { return new BBPlayerLocation().find(query) }
  static deleteOne(query = {}) { return new BBPlayerLocation().deleteOne(query) }
  static deleteMany(query = {}) { return new BBPlayerLocation().deleteMany(query) }
  static countDocuments(query = {}) { return new BBPlayerLocation().countDocuments(query) }
  static insertOne(data) { return new BBPlayerLocation(data).save() }
}

module.exports = BBPlayerLocation
