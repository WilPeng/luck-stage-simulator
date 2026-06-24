const BaseModel = require('./BaseModel')

class AudienceVoteSession extends BaseModel {
  constructor(data) {
    super('AudienceVoteSession')
    this.roundId = null
    this.createdAt = new Date().toISOString()
    if (data) Object.assign(this, data)
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new AudienceVoteSession().findOne(query) }
  static find(query = {}) { return new AudienceVoteSession().find(query) }
  static deleteMany(query = {}) { return new AudienceVoteSession().deleteMany(query) }
  static deleteOne(query = {}) { return new AudienceVoteSession().deleteOne(query) }
  static countDocuments(query = {}) { return new AudienceVoteSession().countDocuments(query) }
  static insertMany(items) {
    const model = new AudienceVoteSession()
    return model.insertMany(items.map(i => new AudienceVoteSession(i)))
  }
}

module.exports = AudienceVoteSession
