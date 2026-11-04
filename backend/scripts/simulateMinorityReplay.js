/**
 * 本地模拟「少数决」对局并写入复盘记录，供管理员端「小游戏复盘」检查判定逻辑。
 *
 * 用法（backend 目录下）：
 *   node scripts/simulateMinorityReplay.js
 *
 * 会在本地 MongoDB 中写入若干 gameType=hoh 的测试复盘记录（名称以「少数决测试」开头）。
 * 重复运行会先删除旧的测试记录，再重新生成。
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { initStore, closeStore } = require('../src/config/db')
const { getGame } = require('../src/games/bigbrother/minigames/loadAll')
const { startSession, recordEvent, finalizeSession } = require('../src/games/bigbrother/minigameReplay')
const BBMinigameReplay = require('../src/games/bigbrother/models/BBMinigameReplay')

const QUESTIONS = [
  { text: '测试题1：你更喜欢甜还是咸？', options: ['甜', '咸'] },
  { text: '测试题2：你更喜欢猫还是狗？', options: ['猫', '狗'] },
  { text: '测试题3：你更喜欢夏天还是冬天？', options: ['夏天', '冬天'] },
  { text: '测试题4：你更喜欢海边还是山里？', options: ['海边', '山里'] },
  { text: '测试题5：你更喜欢早睡还是晚睡？', options: ['早睡', '晚睡'] },
  { text: '测试题6：你更喜欢茶还是咖啡？', options: ['茶', '咖啡'] }
]

function makeRoom({ roomId, participants, roundIndex }) {
  return {
    roomId,
    gameType: 'hoh',
    minigameId: 'minority',
    minigameName: '少数决',
    category: 'strategy',
    roundIndex,
    roundId: `test-round-${roundIndex}`,
    targetScore: null,
    participants: participants.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      avatar: null
    })),
    replaySession: null,
    gameState: null,
    handler: null
  }
}

/**
 * 场景脚本格式：
 *   rounds: [{ choices: { 名字: 0|1|'miss' }, times: { 名字: 毫秒 } }]
 */
async function simulate({ title, roundIndex, players, rounds }) {
  const handler = getGame('minority')
  const participants = players.map((name, i) => ({ playerId: `sim-p${i + 1}`, playerName: name }))
  const idOf = {}
  participants.forEach(p => { idOf[p.playerName] = p.playerId })

  const room = makeRoom({
    roomId: `sim-minority-${Date.now()}-${roundIndex}`,
    participants,
    roundIndex
  })
  room.minigameName = title
  room.handler = handler
  startSession(room)

  const state = handler.init(participants, undefined, { questions: QUESTIONS })
  room.gameState = state
  state.status = 'playing'
  state.startTime = Date.now()

  recordEvent(room, {
    type: 'game_start',
    text: `游戏开始：少数决（${participants.length}人）· ${title}`,
    data: {
      minigameId: 'minority',
      title,
      participants: participants.map(p => ({ playerId: p.playerId, playerName: p.playerName }))
    }
  })

  // 开始第一轮
  handler.handleAction(state, participants[0].playerId, { type: 'start' })

  for (let ri = 0; ri < rounds.length && !state.finished; ri++) {
    const rs = rounds[ri]
    const question = state.question
    const beforeRound = state.round

    for (const [pname, choice] of Object.entries(rs.choices || {})) {
      if (choice === 'miss') continue
      const pid = idOf[pname]
      if (!pid) continue
      if (!state.playerStates[pid]?.alive) continue
      if (state.round !== beforeRound) break // 本轮已结算并进入下一轮

      const time = (rs.times && rs.times[pname] != null) ? rs.times[pname] : 1000
      state.roundStartTime = Date.now() - time

      handler.handleAction(state, pid, { type: 'choose', choice })
      const label = question && question.options ? question.options[choice] : (choice === 0 ? 'A' : 'B')
      recordEvent(room, {
        playerId: pid,
        playerName: pname,
        type: 'choose',
        text: `${pname} 选择：${label}（${(time / 1000).toFixed(2)}s）`,
        data: { action: { type: 'choose', choice }, result: null }
      })
    }

    // 若本轮未结算（有人未作答），模拟超时结算
    if (!state.finished && state.round === beforeRound) {
      state.roundStartTime = Date.now() - 20000
      handler.handleAction(state, participants[0].playerId, { type: 'tick' })
    }

    // 记录处理器内部事件（回合结算/淘汰/获胜）
    const evs = handler.takeReplayEvents(state) || []
    for (const e of evs) recordEvent(room, e)
  }

  const winner = state.winner ? participants.find(p => p.playerId === state.winner) : null
  const winnerObj = winner ? { playerId: winner.playerId, playerName: winner.playerName } : null
  recordEvent(room, {
    type: 'game_end',
    text: winner ? `游戏结束，胜者：${winner.playerName}` : '游戏结束（无胜者）',
    data: { winner: winnerObj, winners: winnerObj ? [winnerObj] : [] }
  })

  await finalizeSession(room, {
    winner: winnerObj,
    winners: winnerObj ? [winnerObj] : [],
    scores: {},
    status: 'finished'
  })

  console.log(`✅ ${title} → 胜者：${winner ? winner.playerName : '无'}（${state.history.length} 轮）`)
}

async function main() {
  await initStore()

  // 清理旧的测试复盘，避免重复
  const old = await BBMinigameReplay.find({ gameId: 'bigbrother', minigameId: 'minority' })
  const testOld = old.filter(o => String(o.minigameName || '').includes('少数决测试') || String(o.roundId || '').startsWith('test-round-'))
  for (const o of testOld) {
    await BBMinigameReplay.deleteOne({ id: o.id })
  }
  if (testOld.length) console.log(`🧹 已清理旧测试记录 ${testOld.length} 条`)

  const A = ['小明', '小红', '小刚', '小美']
  const B = ['甲', '乙', '丙', '丁']
  const C = ['阿尔法', '贝塔', '伽马']
  const D = ['闪电', '蜗牛']

  await simulate({
    title: '少数决测试A·未作答先出局+多数淘汰',
    roundIndex: 1,
    players: A,
    rounds: [
      {
        choices: { 小明: 0, 小红: 0, 小刚: 1, 小美: 'miss' },
        times: { 小明: 1200, 小红: 1500, 小刚: 900 }
      }
    ]
  })

  await simulate({
    title: '少数决测试B·3:1 多数淘汰',
    roundIndex: 2,
    players: B,
    rounds: [
      {
        choices: { 甲: 0, 乙: 0, 丙: 0, 丁: 1 },
        times: { 甲: 800, 乙: 1000, 丙: 1200, 丁: 600 }
      }
    ]
  })

  await simulate({
    title: '少数决测试C·3:0 不淘汰后再战',
    roundIndex: 3,
    players: C,
    rounds: [
      {
        choices: { 阿尔法: 0, 贝塔: 0, 伽马: 0 },
        times: { 阿尔法: 700, 贝塔: 900, 伽马: 1100 }
      },
      {
        choices: { 阿尔法: 0, 贝塔: 0, 伽马: 1 },
        times: { 阿尔法: 600, 贝塔: 800, 伽马: 1000 }
      }
    ]
  })

  await simulate({
    title: '少数决测试D·1:1 比手速',
    roundIndex: 4,
    players: D,
    rounds: [
      {
        choices: { 闪电: 0, 蜗牛: 1 },
        times: { 闪电: 1500, 蜗牛: 600 }
      }
    ]
  })

  await simulate({
    title: '少数决测试E·2:0 比手速',
    roundIndex: 5,
    players: D,
    rounds: [
      {
        choices: { 闪电: 0, 蜗牛: 0 },
        times: { 闪电: 2000, 蜗牛: 500 }
      }
    ]
  })

  await simulate({
    title: '少数决测试F·2:2 平票不淘汰后再战',
    roundIndex: 6,
    players: A,
    rounds: [
      {
        choices: { 小明: 0, 小红: 0, 小刚: 1, 小美: 1 },
        times: { 小明: 700, 小红: 900, 小刚: 1100, 小美: 1300 }
      },
      {
        choices: { 小明: 0, 小红: 0, 小刚: 0, 小美: 1 },
        times: { 小明: 600, 小红: 800, 小刚: 1000, 小美: 500 }
      }
    ]
  })

  await simulate({
    title: '少数决测试G·仅1人作答直接获胜',
    roundIndex: 7,
    players: C,
    rounds: [
      {
        choices: { 阿尔法: 0, 贝塔: 'miss', 伽马: 'miss' },
        times: { 阿尔法: 1000 }
      }
    ]
  })

  await closeStore()
  console.log('\n完成。打开管理员端「小游戏复盘」，筛选 HOH 即可查看测试记录。')
}

main().catch(async (e) => {
  console.error('模拟失败：', e)
  try { await closeStore() } catch {}
  process.exit(1)
})
