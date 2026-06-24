const BaseModel = require('./BaseModel')

/**
 * 歌曲库
 * 字段: id / name / difficulty / vocalWeight / danceWeight / charmWeight / type
 * type 取值: solo | duet | group
 */
class Song extends BaseModel {
  constructor(data) {
    super('Song')
    if (data) {
      this.id = data.id || null
      this.name = data.name || ''
      this.difficulty = typeof data.difficulty === 'number' ? data.difficulty : 3
      this.vocalWeight = typeof data.vocalWeight === 'number' ? data.vocalWeight : 3
      this.danceWeight = typeof data.danceWeight === 'number' ? data.danceWeight : 3
      this.charmWeight = typeof data.charmWeight === 'number' ? data.charmWeight : 3
      this.type = data.type || 'group'
      this.style = data.style || ''
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
