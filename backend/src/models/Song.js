const BaseModel = require('./BaseModel')

/**
 * 歌曲库
 * 字段: id / name / type / style / singerGender / difficulty / mainAttribute / baseVocal / baseDance / risk / description
 * type 取值: solo | duet | group | team_show
 */
class Song extends BaseModel {
  constructor(data) {
    super('Song')
    if (data) {
      this.id = data.id || null
      this.name = data.name || ''
      this.difficulty = typeof data.difficulty === 'number' ? data.difficulty : 3
      // ===== 公演评分配置 =====
      this.baseVocal = typeof data.baseVocal === 'number' ? data.baseVocal : 30
      this.baseDance = typeof data.baseDance === 'number' ? data.baseDance : 30
      this.risk = typeof data.risk === 'number' ? data.risk : 10
      this.mainAttribute = data.mainAttribute || 'vocal'
      this.gameId = data.gameId || null
      this.type = data.type || 'group'
      this.style = data.style || ''
      this.singerGender = data.singerGender || ''
      this.createdAt = data.createdAt || new Date().toISOString()
      this.updatedAt = data.updatedAt || new Date().toISOString()
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
    const model = new Song()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new Song()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new Song()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new Song()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new Song()
    return model.insertMany(items.map(i => new Song(i)))
  }
}

module.exports = Song
