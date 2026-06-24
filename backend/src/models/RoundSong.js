const BaseModel = require('./BaseModel')

/**
 * 轮次歌曲（每轮公演选择的歌曲清单）
 * 字段: id / roundId / roundIndex / songId / songType / scoringMethod / createdAt / updatedAt
 * 
 * songType 取值: team_show(团秀) | team_collab(合作秀) | captain_show(队长秀) | pk_show(PK秀)
 * scoringMethod 取值: actual | fixed | ranked
 */
class RoundSong extends BaseModel {
  constructor(data) {
    super('RoundSong')
    this.id = data?.id || null
    this.roundId = data?.roundId || null
    this.roundIndex = data?.roundIndex ?? null
    this.songId = data?.songId || null
    this.songType = data?.songType || 'team_show'
    this.scoringMethod = data?.scoringMethod || 'actual'
    this.assignedTeamId = data?.assignedTeamId || null
    this.released = data?.released || false
    this.releasedAt = data?.releasedAt || null
    this.createdAt = data?.createdAt || new Date().toISOString()
    this.updatedAt = data?.updatedAt || new Date().toISOString()
    // 向前兼容：如果旧数据传了 round 字段，映射到 roundIndex
    if (data?.round !== undefined && this.roundIndex === null) {
      this.roundIndex = data.round
    }
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new RoundSong().findOne(query) }
  static find(query = {}) { return new RoundSong().find(query) }
  static deleteMany(query = {}) { return new RoundSong().deleteMany(query) }
  static deleteOne(query = {}) { return new RoundSong().deleteOne(query) }
  static countDocuments(query = {}) { return new RoundSong().countDocuments(query) }
  static insertMany(items) {
    const model = new RoundSong()
    return model.insertMany(items.map(i => new RoundSong(i)))
  }
}

module.exports = RoundSong
