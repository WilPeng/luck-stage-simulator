const BaseModel = require('../../../models/BaseModel')

class BBCustomGame extends BaseModel {
  constructor(data) {
    super('BBCustomGame')
    data = data || {}
    this.id = data.id || null
    this.gameId = data.gameId || 'bigbrother'
    this.name = data.name || ''
    this.description = data.description || ''
    this.icon = data.icon || '🎮'
    this.type = data.type || 'quiz' // quiz(答对赛制) | score(积分赛制)

    // 题目列表（admin_judge 模式下 correctAnswer 可为空）
    this.questions = (data.questions || []).map(q => ({
      id: q.id || crypto.randomUUID(),
      text: q.text || '',
      options: q.options || [],
      correctAnswer: q.correctAnswer || '',
      points: q.points || 1
    }))

    // ===== 通用规则 =====
    // 提交方式：single=单题提交，batch=全部一起提交
    this.submitMode = data.submitMode || 'single'
    // 提交次数上限（总提交次数，0=无限）
    this.maxAttempts = data.maxAttempts ?? 0
    // 提交时间间隔（秒）
    this.cooldownSeconds = data.cooldownSeconds ?? 5

    // ===== 答错反馈 =====
    // none=不告知；count=告知正确数量；reveal=告知正确答案；all_correct_only=仅全对时告知
    this.wrongFeedback = data.wrongFeedback || 'none'
    // 答错是否锁定该题（锁定后该题不可再作答）
    this.lockOnWrong = data.lockOnWrong ?? false

    // ===== 答对赛制（quiz） =====
    // winCondition: all_correct | target_correct | admin_judge | first_correct | most_correct
    // targetCorrect: target_correct 模式下需答对的题数
    this.winCondition = data.winCondition || (this.type === 'quiz' ? 'all_correct' : 'highest_score')
    this.targetCorrect = data.targetCorrect ?? 1

    // ===== 积分赛制（score） =====
    this.timeLimit = data.timeLimit ?? 120
    this.scoringRule = data.scoringRule || 'correct_only' // correct_only | timed_bonus

    // ===== 通用 =====
    this.playerCount = data.playerCount || { min: 2, max: 20 }

    this.enabled = data.enabled ?? true
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || new Date().toISOString()
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
