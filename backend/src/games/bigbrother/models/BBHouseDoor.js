const BaseModel = require('../../../models/BaseModel')

class BBHouseDoor extends BaseModel {
  constructor(data) {
    super('BBHouseDoor')
    this.id = data?.id || null
    this.name = data?.name || ''
    this.from = data?.from || ''
    this.to = data?.to || ''
    this.isOpen = data?.isOpen ?? true
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

  static findOne(query) { return new BBHouseDoor().findOne(query) }
  static find(query = {}) { return new BBHouseDoor().find(query) }
  static deleteMany(query = {}) { return new BBHouseDoor().deleteMany(query) }
  static countDocuments(query = {}) { return new BBHouseDoor().countDocuments(query) }
}

module.exports = BBHouseDoor
