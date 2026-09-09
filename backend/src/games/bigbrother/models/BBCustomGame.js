const BaseModel = require('../../../models/BaseModel')

class BBCustomGame extends BaseModel {
  constructor(data) {
    super('BBCustomGame')
    this.id = data?.id || null
    this.gameId = data?.gameId || 'bigbrother'
    this.name = data?.name || ''
    this.description = data?.description || ''
    this.icon = data?.icon || '🎮'
    this.type = data?.type || 'quiz' // quiz | score

    // 题目列表
    this.questions = (data?.questions || []).map(q => ({
      id: q.id || crypto.randomUUID(),
      text: q.text || '',
      options: q.options || [],
      correctAnswer: q.correctAnswer || '',
      points: q.points || 1
    }))

    // 答题模式配置
    this.cooldownSeconds = data?.cooldownSeconds ?? 5
    this.maxAttempts = data?.maxAttempts ?? 0 // 0=无限

    // 积分模式配置
    this.timeLimit = data?.timeLimit ?? 120
    this.scoringRule = data?.scoringRule || 'correct_only' // correct_only | timed_bonus

    // 通用配置
    this.playerCount = data?.playerCount || { min: 2, max: 20 }
    this.winCondition = data?.winCondition || 'first_correct'
    // first_correct | highest_score | most_correct

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

  static findOne(query) { return new BBCustomGame().findOne(query) }
  static find(query = {}) { return new BBCustomGame().find(query) }
  static deleteOne(query) { return new BBCustomGame().deleteOne(query) }
  static countDocuments(query = {}) { return new BBCustomGame().countDocuments(query) }
  static insertMany(items) { return new BBCustomGame().insertMany(items.map(i => new BBCustomGame(i))) }
}

module.exports = BBCustomGame
