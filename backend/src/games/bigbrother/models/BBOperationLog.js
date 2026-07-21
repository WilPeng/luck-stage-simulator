const BaseModel = require('../../../models/BaseModel')

class BBOperationLog extends BaseModel {
  constructor(data) {
    super('BBOperationLog')
    if (data) Object.assign(this, data)
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new BBOperationLog().findOne(query) }
  static find(query = {}) { return new BBOperationLog().find(query) }
  static deleteMany(query = {}) { return new BBOperationLog().deleteMany(query) }
  static countDocuments(query = {}) { return new BBOperationLog().countDocuments(query) }
  static insertMany(items) { return new BBOperationLog().insertMany(items.map(i => new BBOperationLog(i))) }
}

module.exports = BBOperationLog
