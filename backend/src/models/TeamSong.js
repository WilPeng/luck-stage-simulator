const BaseModel = require('./BaseModel')

/**
 * 队伍选歌（每轮每个队伍选一首歌）
 * 字段: id / roundId / roundIndex / teamId / songId / assignedBy / createdAt
 * 
 * 关键: 歌曲不属于队伍，队伍选择歌曲
 * 同一 roundId + teamId 在同一 round 只能存在一条记录
 */
class TeamSong extends BaseModel {
  constructor(data) {
    super('TeamSong')
    this.roundId = null
    this.roundIndex = null
    this.teamId = null
    this.songId = null
    this.assignedBy = null
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

  static findOne(query) { return new TeamSong().findOne(query) }
  static find(query = {}) { return new TeamSong().find(query) }
  static deleteMany(query = {}) { return new TeamSong().deleteMany(query) }
  static deleteOne(query = {}) { return new TeamSong().deleteOne(query) }
  static countDocuments(query = {}) { return new TeamSong().countDocuments(query) }
  static insertMany(items) {
    const model = new TeamSong()
    return model.insertMany(items.map(i => new TeamSong(i)))
  }
}

module.exports = TeamSong
