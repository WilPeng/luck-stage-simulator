const BaseModel = require('./BaseModel')

class CaptainVote extends BaseModel {
  constructor(data) {
    super('CaptainVote')
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
    const model = new CaptainVote()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new CaptainVote()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new CaptainVote()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new CaptainVote()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new CaptainVote()
    return model.insertMany(items.map(i => new CaptainVote(i)))
  }
}

module.exports = CaptainVote
