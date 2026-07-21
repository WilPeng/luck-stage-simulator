const BaseModel = require('../../../models/BaseModel')

class BBRound extends BaseModel {
  constructor(data) {
    super('BBRound')
    this.id = data?.id || null
    this.seasonId = data?.seasonId || null
    this.index = data?.index ?? null
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

  static findOne(query) { return new BBRound().findOne(query) }
  static find(query = {}) { return new BBRound().find(query) }
  static deleteMany(query = {}) { return new BBRound().deleteMany(query) }
  static countDocuments(query = {}) { return new BBRound().countDocuments(query) }
  static insertMany(items) { return new BBRound().insertMany(items.map(i => new BBRound(i))) }
}

module.exports = BBRound
