const BaseModel = require('./BaseModel')

class RoundPreparation extends BaseModel {
  constructor(data) {
    super('RoundPreparation')
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
    const model = new RoundPreparation()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new RoundPreparation()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new RoundPreparation()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new RoundPreparation()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new RoundPreparation()
    return model.insertMany(items.map(i => new RoundPreparation(i)))
  }
}

module.exports = RoundPreparation
