const BaseModel = require('../../../models/BaseModel')

class BBHousePassage extends BaseModel {
  constructor(data) {
    super('BBHousePassage')
    this.id = data?.id || null
    this.from = data?.from || ''
    this.to = data?.to || ''
    this.type = data?.type || 'normal'   // normal | door
    this.doorId = data?.doorId || null   // 仅 type=door 时
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

  static findOne(query) { return new BBHousePassage().findOne(query) }
  static find(query = {}) { return new BBHousePassage().find(query) }
  static deleteMany(query = {}) { return new BBHousePassage().deleteMany(query) }
  static countDocuments(query = {}) { return new BBHousePassage().countDocuments(query) }
}

module.exports = BBHousePassage
