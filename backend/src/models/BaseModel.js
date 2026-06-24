const { getCollection } = require('../config/db')

const normalizeQueryValue = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value

  if (value.$in && value.$in.id) {
    return { $in: value.$in.id }
  }

  return value
}

const normalizeQuery = (query = {}) => {
  const normalized = {}

  for (const key in query) {
    if (key === '_id') continue

    if (key === '$ne') {
      for (const nestedKey in query[key]) {
        normalized[nestedKey] = { $ne: query[key][nestedKey] }
      }
      continue
    }

    normalized[key] = normalizeQueryValue(query[key])
  }

  return normalized
}

const stripInternalFields = (item) => {
  const plain = typeof item.toObject === 'function' ? item.toObject() : { ...item }
  delete plain._id
  delete plain.collectionName
  return plain
}

class BaseModel {
  constructor(collectionName) {
    this.collectionName = collectionName
  }

  _getCollection() {
    return getCollection(this.collectionName)
  }

  _hydrate(document) {
    if (!document) return null
    const data = { ...document }
    delete data._id
    return new this.constructor(data)
  }

  async save(item) {
    const collection = this._getCollection()
    const document = stripInternalFields(item)
    document.updatedAt = new Date().toISOString()

    if (!document.createdAt) {
      document.createdAt = document.updatedAt
    }

    await collection.replaceOne(
      { id: document.id },
      document,
      { upsert: true }
    )

    Object.assign(item, document)
    return item
  }

  async findOne(query = {}) {
    const document = await this._getCollection().findOne(normalizeQuery(query))
    return this._hydrate(document)
  }

  async find(query = {}) {
    const documents = await this._getCollection().find(normalizeQuery(query)).toArray()
    return documents.map(document => this._hydrate(document))
  }

  async deleteOne(query = {}) {
    return this._getCollection().deleteOne(normalizeQuery(query))
  }

  async deleteMany(query = {}) {
    return this._getCollection().deleteMany(normalizeQuery(query))
  }

  async countDocuments(query = {}) {
    return this._getCollection().countDocuments(normalizeQuery(query))
  }

  async insertMany(items) {
    if (!items.length) return []

    const now = new Date().toISOString()
    const documents = items.map(item => ({
      ...stripInternalFields(item),
      createdAt: item.createdAt || now,
      updatedAt: now
    }))

    await this._getCollection().insertMany(documents)
    return documents.map(document => this._hydrate(document))
  }

  static findOne(query = {}) {
    const model = new this()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new this()
    return model.find(query)
  }

  static deleteOne(query = {}) {
    const model = new this()
    return model.deleteOne(query)
  }

  static deleteMany(query = {}) {
    const model = new this()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new this()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new this()
    return model.insertMany(items.map(item => new this(item)))
  }
}

BaseModel.normalizeQuery = normalizeQuery
BaseModel.stripInternalFields = stripInternalFields

module.exports = BaseModel
