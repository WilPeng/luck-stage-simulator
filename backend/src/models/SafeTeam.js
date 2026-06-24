const BaseModel = require('./BaseModel')

class SafeTeam extends BaseModel {
  constructor(data) {
    super('SafeTeam')
    if (data) Object.assign(this, data)
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
    const model = new SafeTeam()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new SafeTeam()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new SafeTeam()
    return model.deleteMany(query)
  }
}

module.exports = SafeTeam
