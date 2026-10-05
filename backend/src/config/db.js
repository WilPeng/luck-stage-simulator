const mongoose = require('mongoose')

// Big Brother 集合列表
const COLLECTIONS = [
  'BBHouseguest',     // 房客/管理员
  'BBSeason',         // 赛季
  'BBRound',          // 轮次
  'BBHohRecord',      // HOH 记录
  'BBNomination',     // 提名
  'BBVetoRecord',     // 否决权记录
  'BBEvictionVote',   // 淘汰投票
  'BBEviction',       // 淘汰结果
  'BBChatMessage',    // 聊天消息
  'BBOperationLog',   // 操作日志
  'BBSerpentMark',    // 毒蛇标记 twist
  'BBChampionVote',   // 冠军投票（终局）
  'BBHouseRoom',      // House 房间配置
  'BBHousePassage',   // House 通道配置
  'BBHouseDoor',      // House 门状态
  'BBPlayerLocation', // 玩家当前位置
  'BBLocationHistory',// 玩家位置历史（消息可见性核心）
  'BBCustomGame',     // 自定义游戏
  'BBPowerChallenge', // 实力大挑战题目池
  'BBMinigameReplay', // 小游戏对局回放/复盘
  'BBJuryQA'          // 陪审团问答（冠军投票前）
]

let connected = false

const initStore = async () => {
  const mongoUri = process.env.MONGODB_URI

  if (!mongoUri) {
    throw new Error('MONGODB_URI is required')
  }

  if (connected) return mongoose.connection

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000
  })
  connected = true
  console.log(`Connected to MongoDB: ${mongoose.connection.name}`)

  return mongoose.connection
}

const getCollection = (collectionName) => {
  if (!COLLECTIONS.includes(collectionName)) {
    throw new Error(`Unknown collection: ${collectionName}`)
  }

  if (!mongoose.connection.db) {
    throw new Error('Database is not connected. Call initStore() before using models.')
  }

  return mongoose.connection.db.collection(collectionName)
}

const saveStore = async () => {}

const closeStore = async () => {
  if (connected) {
    await mongoose.connection.close()
    connected = false
  }
}

module.exports = {
  initStore,
  saveStore,
  closeStore,
  getCollection
}
