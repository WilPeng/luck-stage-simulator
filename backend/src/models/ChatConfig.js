const BaseModel = require('./BaseModel')

class ChatConfig extends BaseModel {
  constructor(data) {
    super('ChatConfig')
    if (data) Object.assign(this, data)
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
    const model = new ChatConfig()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new ChatConfig()
    return model.find(query)
  }

  static updateOne(query, update) {
    const model = new ChatConfig()
    return model.updateOne(query, update)
  }
}

module.exports = ChatConfig
