/**
 * 清理 bbHouseLoadTest 产生的残留数据（需在能访问目标 MongoDB 的环境运行）
 *
 * 说明：服务端没有“按玩家删除位置/聊天”的接口，删除账号后 BBPlayerLocation /
 * BBLocationHistory / BBChatMessage 仍会残留，表现为隔离房间里的“幽灵玩家”。
 * 本脚本按玩家名前缀精确删除这些残留。
 *
 * 用法（在 backend 目录）：
 *   node scripts/bbCleanLoadTestData.cjs            # 默认清理 压测 前缀
 *   node scripts/bbCleanLoadTestData.cjs "压测"      # 指定前缀
 *
 * 连接使用 backend/.env 中的 MONGODB_URI（也可通过环境变量覆盖）。
 * 只删除匹配前缀的测试数据，不触碰真实玩家。
 */
require('dotenv').config()
const { initStore, closeStore, getCollection } = require('../src/config/db')

const PREFIX = process.argv[2] || '压测'
const GAME_ID = 'bigbrother'
const re = new RegExp(`^${PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI（请在 backend/.env 或环境变量中提供）')
  await initStore()

  const locCol = getCollection('BBPlayerLocation')
  const histCol = getCollection('BBLocationHistory')
  const chatCol = getCollection('BBChatMessage')
  const guestCol = getCollection('BBHouseguest')
  const logCol = getCollection('BBOperationLog')

  const ghostLocs = await locCol.find({ gameId: GAME_ID, playerName: re }).toArray()
  const ghostGuests = await guestCol.find({ gameId: GAME_ID, name: re }).toArray()

  const ids = new Set()
  for (const l of ghostLocs) ids.add(l.playerId)
  for (const g of ghostGuests) ids.add(g.id)
  const idList = Array.from(ids).filter(Boolean)

  if (!idList.length) {
    console.log(`未找到前缀为「${PREFIX}」的残留数据。`)
    await closeStore()
    return
  }

  console.log(`找到 ${idList.length} 个测试玩家，开始清理...`)

  const q = { gameId: GAME_ID, playerId: { $in: idList } }
  const rLoc = await locCol.deleteMany(q)
  const rHist = await histCol.deleteMany(q)
  const rGuest = await guestCol.deleteMany({ gameId: GAME_ID, id: { $in: idList } })
  const rChatById = await chatCol.deleteMany({ gameId: GAME_ID, senderId: { $in: idList } })
  const rChatByName = await chatCol.deleteMany({ gameId: GAME_ID, senderName: re })
  const rLog = await logCol.deleteMany({ gameId: GAME_ID, actorId: { $in: idList } })

  console.log('清理完成：')
  console.log(`  BBPlayerLocation  : ${rLoc.deletedCount}`)
  console.log(`  BBLocationHistory : ${rHist.deletedCount}`)
  console.log(`  BBHouseguest      : ${rGuest.deletedCount}`)
  console.log(`  BBChatMessage(id) : ${rChatById.deletedCount}`)
  console.log(`  BBChatMessage(名) : ${rChatByName.deletedCount}`)
  console.log(`  BBOperationLog    : ${rLog.deletedCount}`)

  await closeStore()
}

main().catch(async (e) => {
  console.error('清理失败:', e)
  try { await closeStore() } catch { /* ignore */ }
  process.exit(1)
})
