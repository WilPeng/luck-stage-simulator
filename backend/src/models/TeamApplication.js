const BaseModel = require('./BaseModel')

class TeamApplication extends BaseModel {
  constructor(data) {
    super('TeamApplication')
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
    const model = new TeamApplication()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new TeamApplication()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new TeamApplication()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new TeamApplication()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new TeamApplication()
    return model.insertMany(items.map(i => new TeamApplication(i)))
  }
}

module.exports = TeamApplication
