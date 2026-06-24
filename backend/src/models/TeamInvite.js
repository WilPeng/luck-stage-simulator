const BaseModel = require('./BaseModel')

class TeamInvite extends BaseModel {
  constructor(data) {
    super('TeamInvite')
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
    const model = new TeamInvite()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new TeamInvite()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new TeamInvite()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new TeamInvite()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new TeamInvite()
    return model.insertMany(items.map(i => new TeamInvite(i)))
  }
}

module.exports = TeamInvite
