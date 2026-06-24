const BaseModel = require('./BaseModel')

class RoundCaptain extends BaseModel {
  constructor(data) {
    super('RoundCaptain')
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
    const model = new RoundCaptain()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new RoundCaptain()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new RoundCaptain()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new RoundCaptain()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new RoundCaptain()
    return model.insertMany(items.map(i => new RoundCaptain(i)))
  }
}

module.exports = RoundCaptain
