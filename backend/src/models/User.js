const BaseModel = require('./BaseModel')
const { getCollection } = require('../config/db')

class User {
  constructor(data = {}) {
    this.id = data.id
    this.name = data.name
    this.loginCode = data.loginCode
    this.password = data.password || ''
    this.role = data.role || 'player'
    this.status = data.status || 'active'
    this.teamId = data.teamId || null
    this.hasLogin = data.hasLogin || false
    this.attributes = data.attributes || { vocal: 30, dance: 30, charm: 30 }
    this.trainingCount = data.trainingCount || 0
    this.avatar = data.avatar || null
    this.gameId = data.gameId || null
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || new Date().toISOString()
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    return obj
  }

  static _collection() {
    return getCollection('User')
  }

  static _hydrate(document) {
    if (!document) return null
    const data = { ...document }
    delete data._id
    return new User(data)
  }

  async save() {
    const document = this.toObject()
    document.updatedAt = new Date().toISOString()
    document.createdAt = document.createdAt || document.updatedAt

    await User._collection().replaceOne(
      { id: document.id },
      document,
      { upsert: true }
    )

    Object.assign(this, document)
    return this
  }

  static async findOne(query = {}) {
    const document = await User._collection().findOne(BaseModel.normalizeQuery(query))
    return User._hydrate(document)
  }

  static async find(query = {}) {
    const documents = await User._collection().find(BaseModel.normalizeQuery(query)).toArray()
    return documents.map(document => User._hydrate(document))
  }

  static async deleteOne(query = {}) {
    return User._collection().deleteOne(BaseModel.normalizeQuery(query))
  }

  static async deleteMany(query = {}) {
    return User._collection().deleteMany(BaseModel.normalizeQuery(query))
  }

  static async countDocuments(query = {}) {
    return User._collection().countDocuments(BaseModel.normalizeQuery(query))
  }

  static async insertMany(users) {
    if (!users.length) return []

    const now = new Date().toISOString()
    const documents = users.map(user => ({
      ...user.toObject(),
      createdAt: user.createdAt || now,
      updatedAt: now
    }))

    await User._collection().insertMany(documents)
    return documents.map(document => new User(document))
  }

  static async search(query = {}) {
    const { keyword, role, status, teamId, page = 1, pageSize = 20 } = query
    const filter = {}

    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { loginCode: { $regex: keyword, $options: 'i' } },
        { id: { $regex: keyword, $options: 'i' } }
      ]
    }
    if (role) filter.role = role
    if (status) filter.status = status
    if (teamId && teamId !== 'none') filter.teamId = teamId
    if (teamId === 'none') filter.teamId = null

    const currentPage = Number(page) || 1
    const currentPageSize = Number(pageSize) || 20
    const skip = (currentPage - 1) * currentPageSize

    const [documents, total] = await Promise.all([
      User._collection().find(filter).skip(skip).limit(currentPageSize).toArray(),
      User._collection().countDocuments(filter)
    ])

    return {
      list: documents.map(document => User._hydrate(document)),
      total,
      page: currentPage,
      pageSize: currentPageSize,
      totalPages: Math.ceil(total / currentPageSize)
    }
  }

  static async stats() {
    const [total, active, eliminated, admins, captains, players] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ status: 'eliminated' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'captain' }),
      User.countDocuments({ role: 'player' })
    ])

    return { total, active, eliminated, admins, captains, players }
  }
}

module.exports = User
