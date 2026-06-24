const mongoose = require('mongoose')

// 新架构（Round-based）集合列表
const COLLECTIONS = [
  'User',            // 选手/管理员（永久）
  'Season',          // 赛季（一个）
  'Round',           // 轮次（一公/二公/...）
  'RoundTeam',       // 轮次内的队伍（替代 Team）
  'RoundTeamMember', // 轮次内的成员关系（核心 Player × Round）
  'CaptainVote',     // 队长投票
  'RoundCaptain',    // 管理员指定队长
  'Song',            // 歌曲库（永久）
  'RoundSong',       // 轮次选歌曲（本轮歌曲清单）
  'TeamSong',        // 队伍选择歌曲（替代 SongAssignment + SongSelection）
  'TrainingCard',    // 训练卡（永久）
  'TrainingRecord',  // 训练记录（每轮）
  'RehearsalResult', // 彩排结果（每轮）
  'TeamPerformance', // 队伍公演结果（每轮）
  'PlayerPerformance', // 选手个人公演结果（每轮）
  'AudienceVoteSession', // 大众评审投票场次
  'AudienceMember',  // 大众评审成员
  'AudienceVote',    // 大众评审投票明细
  'AudienceVoteFinalRanking', // 大众评审最终排名（管理员释放后保存）
  'PerformanceValue',// 选手公演发挥值
  'Elimination',     // 淘汰记录（每轮）
  'ChatMessage',     // 聊天消息
  'ChatConfig',      // 聊天室配置
  'OperationLog',    // 操作日志
  'ActionLog',       // 操作日志实际集合
  'StageEvent',      // 舞台事件
  'SafeTeam',        // 安全团标记
  'TeamInvite',      // 队伍邀请
  'TeamApplication', // 队伍申请
  'RoundPreparation', // 轮次预先准备
  'PerformanceRoundState', // 公演轮次状态（公演是否开启、已揭晓队伍等）
  'Team'             // 队伍（每轮独立组队，存储阵型和队长）
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
