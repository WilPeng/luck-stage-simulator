const BaseModel = require('../../../models/BaseModel')
const { getCollection } = require('../../../config/db')

class BBHouseguest extends BaseModel {
  constructor(data) {
    super('BBHouseguest')
    this.id = data?.id || null
    this.name = data?.name || ''
    this.username = data?.username || ''
    this.loginCode = data?.loginCode || ''
    this.password = data?.password || ''
    this.role = data?.role || 'houseguest' // admin | houseguest
    // 总管理员：唯一、拥有全部权限、不可删除，可转移给其他管理员
    this.isSuperAdmin = !!data?.isSuperAdmin
    this.status = data?.status || 'active' // active | evicted | jury | f2 | walked
    // 退赛（walked）：选手主动退出比赛
    this.walkedAt = data?.walkedAt || null
    this.walkedRound = data?.walkedRound ?? null // 从第几轮起显示为 walked
    this.walkNote = data?.walkNote || ''
    this.walkUndo = data?.walkUndo || null // 撤销退赛所需的赛程快照
    // 管理员权限（仅 role=admin 有效）。空数组表示拥有全部权限。
    this.permissions = Array.isArray(data?.permissions) ? data.permissions : (data?.permissions || [])
    this.hasLogin = data?.hasLogin || false
    this.avatar = data?.avatar || null
    this.currentRoomId = data?.currentRoomId || 'living_room'
    this.isHaveNot = data?.isHaveNot || false
    // 移动状态（服务端计时，移动中无法收发任何房间消息）
    this.isMoving = data?.isMoving || false
    this.moveFromRoomId = data?.moveFromRoomId || null
    this.moveToRoomId = data?.moveToRoomId || null
    this.moveStartedAt = data?.moveStartedAt || null
    this.moveEndsAt = data?.moveEndsAt || null
    this.moveDurationSeconds = data?.moveDurationSeconds ?? null
    // 睡眠状态
    this.isSleeping = data?.isSleeping || false
    this.sleepStartedAt = data?.sleepStartedAt || null
    this.wakeAt = data?.wakeAt || null                 // 可醒来时间（按管理员设置的睡眠时长）
    this.lastSleepDate = data?.lastSleepDate || null   // YYYY-MM-DD（本地日期）
    this.hohSleepApproved = data?.hohSleepApproved || false // 是否获准在 HOH 房睡觉
    // 洗澡状态
    this.isShowering = data?.isShowering || false
    this.showerStartedAt = data?.showerStartedAt || null
    this.lastShowerDate = data?.lastShowerDate || null
    this.showerCooldownUntil = data?.showerCooldownUntil || null // 冷却结束前不能再次洗澡
    this.gameId = data?.gameId || 'bigbrother'
    this.createdAt = data?.createdAt || new Date().toISOString()
    this.updatedAt = data?.updatedAt || new Date().toISOString()
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  /** 对外返回时使用：去掉密码与退赛撤销快照（注意 toObject 需要保留密码供持久化使用） */
  toSafeObject() {
    const obj = this.toObject()
    delete obj.password
    delete obj.walkUndo
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new BBHouseguest().findOne(query) }
  static find(query = {}) { return new BBHouseguest().find(query) }
  static deleteOne(query = {}) { return new BBHouseguest().deleteOne(query) }
  static deleteMany(query = {}) { return new BBHouseguest().deleteMany(query) }
  static countDocuments(query = {}) { return new BBHouseguest().countDocuments(query) }
  static insertMany(items) { return new BBHouseguest().insertMany(items.map(i => new BBHouseguest(i))) }

  static async search(query = {}) {
    const { keyword, status, page = 1, pageSize = 20, gameId } = query
    const filter = { gameId: gameId || 'bigbrother' }
    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { username: { $regex: keyword, $options: 'i' } },
        { loginCode: { $regex: keyword, $options: 'i' } },
        { id: { $regex: keyword, $options: 'i' } }
      ]
    }
    if (status) filter.status = status
    const currentPage = Number(page) || 1
    const currentPageSize = Number(pageSize) || 20
    const skip = (currentPage - 1) * currentPageSize
    const [documents, total] = await Promise.all([
      new BBHouseguest()._getCollection().find(filter).skip(skip).limit(currentPageSize).toArray(),
      new BBHouseguest()._getCollection().countDocuments(filter)
    ])
    return {
      list: documents.map(d => new BBHouseguest(d)),
      total,
      page: currentPage,
      pageSize: currentPageSize,
      totalPages: Math.ceil(total / currentPageSize)
    }
  }

  static async stats(gameId) {
    const gid = gameId || 'bigbrother'
    const [total, active, evicted, jury, walked] = await Promise.all([
      BBHouseguest.countDocuments({ gameId: gid }),
      BBHouseguest.countDocuments({ gameId: gid, status: 'active' }),
      BBHouseguest.countDocuments({ gameId: gid, status: 'evicted' }),
      BBHouseguest.countDocuments({ gameId: gid, status: 'jury' }),
      BBHouseguest.countDocuments({ gameId: gid, status: 'walked' })
    ])
    return { total, active, evicted, jury, walked }
  }
}

module.exports = BBHouseguest
