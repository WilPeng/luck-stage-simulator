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
    // quiz(答对赛制) | score(积分赛制)
    // elim-last(模式1 最后作答/首个答错出局) | first-pick(模式2 首个作答定胜负)
    // duel(模式3 1v1对决) | survive-tb(模式4 限时淘汰+数字TB) | score-tb(模式5 限时积分+数字TB)
    this.type = data.type || 'quiz'

    // 题目列表（admin_judge 模式下 correctAnswer 可为空）
    // qtype: text(填空) | choice(选择) | number(数字) | judge(判断)
    // tb: 是否为数字加时题（模式4/5使用）
    this.questions = (data.questions || []).map(q => ({
      id: q.id || crypto.randomUUID(),
      text: q.text || '',
      qtype: q.qtype || ((q.options && q.options.length) ? 'choice' : 'text'),
      options: q.options || [],
      correctAnswer: q.correctAnswer === 0 ? 0 : (q.correctAnswer || ''),
      points: q.points || 1,
      tb: !!q.tb
    }))

    // ===== 模式1/2/3 =====
    // 模式1 出局规则：last=最后一个作答出局，first_wrong=第一个答错出局
    this.eliminateRule = data.eliminateRule || 'last'
    // 选手是否能看到其他人的提交情况
    this.showSubmissions = data.showSubmissions ?? true

    // ===== 模式4/5 =====
    // 基本题限时（秒）
    this.basicTimeLimit = data.basicTimeLimit ?? 30
    // 数字加时题限时（秒）
    this.tiebreakTimeLimit = data.tiebreakTimeLimit ?? 30

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
