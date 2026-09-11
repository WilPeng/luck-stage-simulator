/**
 * BB House 静态地图配置
 * 12 个房间 + 10 条通道 + 1 个门
 */

const HOUSE_ROOMS = [
  { id: 'living_room',   name: '客厅',       nameEn: 'Living Room',   icon: '🛋️', type: 'common',   capacity: null, accessRule: 'public' },
  { id: 'kitchen',       name: '厨房',       nameEn: 'Kitchen',       icon: '🍳', type: 'common',   capacity: null, accessRule: 'public' },
  { id: 'dining_room',   name: '餐厅',       nameEn: 'Dining Room',   icon: '🍽️', type: 'common',   capacity: null, accessRule: 'public' },
  { id: 'gym',           name: '健身房',      nameEn: 'Gym',           icon: '🏋️', type: 'common',   capacity: null, accessRule: 'public' },
  { id: 'bathroom',      name: '浴室',       nameEn: 'Bathroom',      icon: '🚿', type: 'common',   capacity: null, accessRule: 'public' },
  { id: 'storage_room',  name: '储物间',      nameEn: 'Storage Room',  icon: '📦', type: 'common',   capacity: null, accessRule: 'public' },
  { id: 'bedroom_a',     name: '卧室 A',     nameEn: 'Bedroom A',     icon: '🛏️', type: 'lodging',  capacity: null, accessRule: 'public' },
  { id: 'bedroom_b',     name: '卧室 B',     nameEn: 'Bedroom B',     icon: '🛏️', type: 'lodging',  capacity: null, accessRule: 'public' },
  { id: 'have_not_room', name: '贫民屋',      nameEn: 'Have-Not Room', icon: '🥶', type: 'lodging',  capacity: null, accessRule: 'public' },
  { id: 'backyard',      name: '后院',       nameEn: 'Backyard',      icon: '🌴', type: 'outdoor',  capacity: null, accessRule: 'public' },
  { id: 'hoh_door',      name: 'HOH 房门口',  nameEn: 'HOH Door',      icon: '🚪', type: 'common',   capacity: null, accessRule: 'public' },
  { id: 'hoh_room',      name: 'HOH 房',     nameEn: 'HOH Room',      icon: '👑', type: 'special',  capacity: 6,    accessRule: 'hoh_or_invited' },
  { id: 'diary_room',    name: 'Diary Room', nameEn: 'Diary Room',    icon: '🎤', type: 'hidden',   capacity: 1,    accessRule: 'single' },
]

// 通道：双向只需存一条
const HOUSE_PASSAGES = [
  { id: 'pass_living_bedroom_a',   from: 'living_room', to: 'bedroom_a',     type: 'normal' },
  { id: 'pass_living_bedroom_b',   from: 'living_room', to: 'bedroom_b',     type: 'normal' },
  { id: 'pass_living_kitchen',     from: 'living_room', to: 'kitchen',       type: 'normal' },
  { id: 'pass_living_gym',         from: 'living_room', to: 'gym',           type: 'normal' },
  { id: 'pass_living_bathroom',    from: 'living_room', to: 'bathroom',      type: 'normal' },
  { id: 'pass_living_storage',     from: 'living_room', to: 'storage_room',  type: 'normal' },
  { id: 'pass_living_havenot',     from: 'living_room', to: 'have_not_room', type: 'normal' },
  { id: 'pass_living_hohdoor',     from: 'living_room', to: 'hoh_door',      type: 'normal' },
  { id: 'pass_hohdoor_hoh',        from: 'hoh_door',    to: 'hoh_room',      type: 'door', doorId: 'hoh_door' },
  { id: 'pass_living_backyard',    from: 'living_room', to: 'backyard',      type: 'door', doorId: 'backyard_door' },
  { id: 'pass_kitchen_dining',     from: 'kitchen',     to: 'dining_room',   type: 'normal' },
]

const HOUSE_DOORS = [
  { id: 'backyard_door', name: '后院门', from: 'living_room', to: 'backyard', isOpen: true },
  { id: 'hoh_door',      name: 'HOH 房门', from: 'hoh_door',   to: 'hoh_room', isOpen: false },
]

/** 获取所有可达房间（从指定房间出发，考虑门状态） */
async function getReachableRooms(currentRoomId, { BBHousePassage, BBHouseDoor } = {}) {
  const passages = await BBHousePassage.find({ gameId: 'bigbrother' })
  const doors = await BBHouseDoor.find({ gameId: 'bigbrother' })
  const doorMap = {}
  doors.forEach(d => { doorMap[d.id] = d })

  const reachable = []
  for (const p of passages) {
    let target = null
    if (p.from === currentRoomId) target = p.to
    else if (p.to === currentRoomId) target = p.from
    if (!target) continue

    // door 类型需要检查门是否开启
    if (p.type === 'door' && p.doorId) {
      const door = doorMap[p.doorId]
      if (door && !door.isOpen) continue
    }
    reachable.push(target)
  }
  return reachable
}

/**
 * 获取"当前 HOH"（House 语境）
 * 优先级：当前轮的周 HOH(BBHohRecord) > 终局 FHOH(season.fhohId)
 */
async function getCurrentHoh() {
  const BBSeason = require('./models/BBSeason')
  const BBHohRecord = require('./models/BBHohRecord')
  const season = await BBSeason.findOne({ gameId: 'bigbrother' })
  if (!season) return null
  const record = await BBHohRecord.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
  if (record && record.winnerId) {
    return { id: record.winnerId, name: record.winnerName || '', source: 'hoh' }
  }
  if (season.fhohId && season.status !== 'finished') {
    return { id: season.fhohId, name: season.fhohName || '', source: 'fhoh' }
  }
  return null
}

/** Seed/更新函数：确保数据库中的房间/通道/门与静态配置一致 */
async function seedHouseData({ BBHouseRoom, BBHousePassage, BBHouseDoor }) {
  const gameId = 'bigbrother'

  // 房间：按 id upsert（同时修正 accessRule 等字段）
  for (const r of HOUSE_ROOMS) {
    const existing = await BBHouseRoom.findOne({ id: r.id, gameId })
    if (existing) {
      existing.name = r.name
      existing.nameEn = r.nameEn
      existing.icon = r.icon
      existing.type = r.type
      existing.capacity = r.capacity
      existing.accessRule = r.accessRule
      await existing.save()
    } else {
      await new BBHouseRoom({ ...r, gameId }).save()
    }
  }

  // 通道：按 id upsert，并移除已废弃的通道
  const validPassageIds = HOUSE_PASSAGES.map(p => p.id)
  const allPassages = await BBHousePassage.find({ gameId })
  for (const p of allPassages) {
    if (!validPassageIds.includes(p.id)) {
      await BBHousePassage.deleteOne({ id: p.id, gameId })
    }
  }
  for (const p of HOUSE_PASSAGES) {
    const existing = await BBHousePassage.findOne({ id: p.id, gameId })
    if (existing) {
      existing.from = p.from
      existing.to = p.to
      existing.type = p.type
      existing.doorId = p.doorId || null
      await existing.save()
    } else {
      await new BBHousePassage({ ...p, gameId }).save()
    }
  }

  // 门：按 id upsert（不覆盖已有开关状态）
  for (const d of HOUSE_DOORS) {
    const existing = await BBHouseDoor.findOne({ id: d.id, gameId })
    if (existing) {
      existing.name = d.name
      existing.from = d.from
      existing.to = d.to
      await existing.save()
    } else {
      await new BBHouseDoor({ ...d, gameId }).save()
    }
  }
}

/**
 * 幂等确保 House 数据存在（兼容已有赛季的老库）
 * 1) seed 房间/通道/门（仅缺时插入）
 * 2) 为缺少位置记录的玩家补齐位置（默认 living_room）
 */
async function ensureBBHouseData() {
  const BBHouseRoom = require('./models/BBHouseRoom')
  const BBHousePassage = require('./models/BBHousePassage')
  const BBHouseDoor = require('./models/BBHouseDoor')
  const BBHouseguest = require('./models/BBHouseguest')
  const BBPlayerLocation = require('./models/BBPlayerLocation')

  await seedHouseData({ BBHouseRoom, BBHousePassage, BBHouseDoor })

  const houseguests = await BBHouseguest.find({ gameId: 'bigbrother' })
  const { ensureOpenInterval } = require('./locationHistory')
  let created = 0
  for (const p of houseguests) {
    let loc = await BBPlayerLocation.findOne({ playerId: p.id, gameId: 'bigbrother' })
    if (!loc) {
      loc = new BBPlayerLocation({
        id: p.id, playerId: p.id, playerName: p.name,
        currentRoomId: 'living_room', enteredAt: new Date().toISOString(), gameId: 'bigbrother'
      })
      await loc.save()
      created++
    }
    // 位置历史：确保有当前所在区间
    await ensureOpenInterval(p.id, p.name, loc.currentRoomId, loc.enteredAt)
  }
  if (created > 0) console.log(`[HouseMap] ensureBBHouseData created ${created} missing locations`)
}

module.exports = { HOUSE_ROOMS, HOUSE_PASSAGES, HOUSE_DOORS, getReachableRooms, getCurrentHoh, seedHouseData, ensureBBHouseData }
