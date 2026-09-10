const BaseModel = require('../../../models/BaseModel')

class PCPowerChallenge extends BaseModel {
  constructor(data) {
    super('PCPowerChallenge')
    this.id = data?.id || null
    this.gameId = data?.gameId || 'powerchallenge'
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
  static findOne(query) { return new PCPowerChallenge().findOne(query) }
  static find(query = {}) { return new PCPowerChallenge().find(query) }
  static deleteOne(query) { return new PCPowerChallenge().deleteOne(query) }
  static countDocuments(query = {}) { return new PCPowerChallenge().countDocuments(query) }
}

module.exports = PCPowerChallenge
