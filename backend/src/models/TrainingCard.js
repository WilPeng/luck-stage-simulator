const BaseModel = require('./BaseModel')

class TrainingCard extends BaseModel {
  constructor(data) {
    super('TrainingCard')
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
    const model = new TrainingCard()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new TrainingCard()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new TrainingCard()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new TrainingCard()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new TrainingCard()
    return model.insertMany(items.map(i => new TrainingCard(i)))
  }
}

module.exports = TrainingCard
