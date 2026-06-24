const BaseModel = require('./BaseModel')

class OperationLog extends BaseModel {
  constructor(data) {
    super('ActionLog')
    if (data) {
      Object.assign(this, data)
    }
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() {
    return super.save(this)
  }

  static findOne(query) {
    const model = new OperationLog()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new OperationLog()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new OperationLog()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new OperationLog()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new OperationLog()
    return model.insertMany(items.map(i => new OperationLog(i)))
  }
}

module.exports = OperationLog
