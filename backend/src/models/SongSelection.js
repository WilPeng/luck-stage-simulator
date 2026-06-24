const BaseModel = require('./BaseModel')

class SongSelection extends BaseModel {
  constructor(data) {
    super('SongSelection')
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
    const model = new SongSelection()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new SongSelection()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new SongSelection()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new SongSelection()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new SongSelection()
    return model.insertMany(items.map(i => new SongSelection(i)))
  }
}

module.exports = SongSelection
