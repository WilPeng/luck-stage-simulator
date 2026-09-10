const BaseModel = require('../../../models/BaseModel')

class PCSeason extends BaseModel {
  constructor(data) {
    super('PCSeason')
    data = data || {}
    this.id = data.id || null
    this.gameId = data.gameId || 'powerchallenge'
    this.name = data.name || '实力大挑战'
    // ---- 赛季级配置（管理员可改） ----
    this.totalRounds = data.totalRounds || 5          // 固定总轮数
    this.answerCooldown = data.answerCooldown != null ? data.answerCooldown : 3 // 提交间隔(秒)
    this.status = data.status || 'idle'               // idle | running | finished
    this.currentRound = data.currentRound || 1
    this.roundPhase = data.roundPhase || 'waiting'    // waiting | countdown | answering | ended
    // ---- 当前轮题目配置（管理员编辑，可引用题目池） ----
    this.theme = data.theme || ''                     // 本轮主题
    this.questions = data.questions || []             // 本轮可放出题目（含答案，服务端校验用）
    // ---- 本轮运行时快照（服务器权威） ----
    this.releasedQuestions = data.releasedQuestions || [] // 本轮放出的题目（无答案，发给客户端）
    this.participants = data.participants || []       // [{playerId, playerName}] 本轮在线参与玩家
    this.claims = data.claims || []                   // [{questionId, playerId, playerName}]
    this.attempts = data.attempts || {}               // {playerId: [questionId]} 已尝试题目
    this.cooldownUntil = data.cooldownUntil || {}     // {playerId: timestamp}
    this.winners = data.winners || []                 // 本轮晋级玩家 playerId[]
    this.eliminatedThisRound = data.eliminatedThisRound || [] // 本轮淘汰 playerId[]
    // ---- 赛季统计 / 淘汰 / 排名 ----
    this.alivePlayers = data.alivePlayers || []       // 仍可参赛玩家（本轮开始前在线）
    this.eliminated = data.eliminated || []           // [{round, playerId, playerName}]
    this.points = data.points || {}                   // {playerId: number} 积分
    this.champion = data.champion || null             // {playerId, playerName}
    this.ranking = data.ranking || []                 // 最终排名
    this.started = data.started || false
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
  static findOne(query) { return new PCSeason().findOne(query) }
  static find(query = {}) { return new PCSeason().find(query) }
  static deleteOne(query) { return new PCSeason().deleteOne(query) }
  static countDocuments(query = {}) { return new PCSeason().countDocuments(query) }
}

module.exports = PCSeason
