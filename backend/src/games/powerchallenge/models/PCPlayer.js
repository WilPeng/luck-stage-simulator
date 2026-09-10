const BaseModel = require('../../../models/BaseModel')

class PCPlayer extends BaseModel {
  constructor(data) {
    super('PCPlayer')
    this.id = data?.id || null
    this.name = data?.name || ''
    this.loginCode = data?.loginCode || ''
    this.role = data?.role || 'player'
    this.status = data?.status || 'active'
    this.hasLogin = data?.hasLogin || false
    this.avatar = data?.avatar || null
    this.gameId = data?.gameId || 'powerchallenge'
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
  static findOne(query) { return new PCPlayer().findOne(query) }
  static find(query = {}) { return new PCPlayer().find(query) }
  static deleteOne(query) { return new PCPlayer().deleteOne(query) }
  static countDocuments(query = {}) { return new PCPlayer().countDocuments(query) }
  static insertMany(items) { return new PCPlayer().insertMany(items.map(i => new PCPlayer(i))) }
}

module.exports = PCPlayer
