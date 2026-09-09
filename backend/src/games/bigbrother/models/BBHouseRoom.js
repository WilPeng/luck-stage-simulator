const BaseModel = require('../../../models/BaseModel')

class BBHouseRoom extends BaseModel {
  constructor(data) {
    super('BBHouseRoom')
    this.id = data?.id || null
    this.name = data?.name || ''
    this.nameEn = data?.nameEn || ''
    this.icon = data?.icon || ''
    this.type = data?.type || 'common'       // common | lodging | special | outdoor | hidden
    this.capacity = data?.capacity ?? null   // null = 无限
    this.accessRule = data?.accessRule || 'public' // public | hoh_only | hoh_or_invited | have_not_only | single
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

  static findOne(query) { return new BBHouseRoom().findOne(query) }
  static find(query = {}) { return new BBHouseRoom().find(query) }
  static deleteMany(query = {}) { return new BBHouseRoom().deleteMany(query) }
  static countDocuments(query = {}) { return new BBHouseRoom().countDocuments(query) }
}

module.exports = BBHouseRoom
