const BaseModel = require('../../../models/BaseModel')

class LVOperationLog extends BaseModel {
  constructor(data) {
    super('LVOperationLog')
    this.id = data?.id || null
    this.userId = data?.userId || ''
    this.userName = data?.userName || ''
    this.role = data?.role || ''
    this.actionType = data?.actionType || ''
    this.targetType = data?.targetType || ''
    this.targetId = data?.targetId || ''
    this.detail = data?.detail || ''
    this.gameId = data?.gameId || 'lovevariety'
    this.createdAt = data?.createdAt || new Date().toISOString()
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new LVOperationLog().findOne(query) }
  static find(query = {}) { return new LVOperationLog().find(query) }
  static deleteMany(query = {}) { return new LVOperationLog().deleteMany(query) }
  static countDocuments(query = {}) { return new LVOperationLog().countDocuments(query) }
}

module.exports = LVOperationLog
