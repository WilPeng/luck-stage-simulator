const BaseModel = require('../../../models/BaseModel')

class BBPowerChallenge extends BaseModel {
  constructor(data) {
    super('BBPowerChallenge')
    this.id = data?.id || null
    this.gameId = data?.gameId || 'bigbrother'
    this.name = data?.name || ''
    this.theme = data?.theme || ''
    this.questions = (data?.questions || []).map(q => ({
      id: q.id || crypto.randomUUID(),
      text: q.text || '',
      options: q.options || [],
      correctAnswer: q.correctAnswer || ''
    }))
    this.enabled = data?.enabled ?? true
    this.createdAt = data?.createdAt || new Date().toISOString()
    this.updatedAt = data?.updatedAt || new Date().toISOString()
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new BBPowerChallenge().findOne(query) }
  static find(query = {}) { return new BBPowerChallenge().find(query) }
  static deleteOne(query) { return new BBPowerChallenge().deleteOne(query) }
  static countDocuments(query = {}) { return new BBPowerChallenge().countDocuments(query) }
  static insertMany(items) { return new BBPowerChallenge().insertMany(items.map(i => new BBPowerChallenge(i))) }
}

module.exports = BBPowerChallenge
