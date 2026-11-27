const { before, after, test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { once } = require('node:events')
const { MongoMemoryServer } = require('mongodb-memory-server')
const express = require('express')
const jwt = require('jsonwebtoken')
const { initStore, closeStore, getCollection } = require('../src/config/db')
const { getGame } = require('../src/games/bigbrother/minigames/loadAll')

const gameId = 'bigbrother'
const ids = ['a','b','c','d','e','f','g','h','i','j']
let mongo, server, origin, application, challengeIO
const rooms = new Map()
const challengeNamespace = {
  createRoom(gameType, minigameId, participants) {
    const room = { roomId: randomUUID(), gameType, minigameId, participants, status: 'waiting', winners: [] }
    rooms.set(room.roomId, room)
    return room
  },
  getRoom: id => rooms.get(id),
  cleanupRoom: id => rooms.delete(id),
  getActiveRoomForType: () => null
}
const col = getCollection
const filter = { gameId, roundId: 'round-2' }

before(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('bb_round_twists')
  process.env.JWT_SECRET = randomUUID()
  await initStore()
  const app = application = express()
  app.use(express.json())
  app.set('io', { of: () => challengeNamespace })
  for (const [name, module] of [['twist','bbRoundTwist'],['season','bbSeason'],['nomination','bbNomination'],['veto','bbVeto'],['eviction','bbEviction'],['hoh','bbHoh'],['minigame','bbMinigame'],['custom-game','bbCustomGame']]) {
    app.use('/' + name, require('../src/games/bigbrother/routes/' + module))
  }
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  origin = 'http://127.0.0.1:' + server.address().port
})

after(async () => {
  if (challengeIO) await new Promise(resolve => challengeIO.close(resolve))
  else if (server) await new Promise(resolve => server.close(resolve))
  await closeStore()
  await mongo?.stop()
})

async function fixture(twist, stage, nominees = null, extra = {}) {
  rooms.clear()
  for (const collection of ['BBSeason','BBHouseguest','BBHohRecord','BBNomination','BBVetoRecord','BBEviction','BBEvictionVote','BBRoundTwist']) {
    await col(collection).deleteMany({})
  }
  await col('BBSeason').insertOne({ gameId, id: 'test-season', currentRound: 2, currentStage: stage, roundConfigs: [{ round: 2, twists: [twist] }], totalRounds: 20, final3Round: 19, ...extra })
  await col('BBHouseguest').insertMany([...ids, 'admin'].map(id => ({ id, name: id.toUpperCase(), gameId, role: id === 'admin' ? 'admin' : 'houseguest', status:'active' })))
  if (stage !== 'hoh_competition') await col('BBHohRecord').insertOne({ ...filter, id:'hoh', winnerId:'a', winnerName:'A' })
  if (nominees) await col('BBNomination').insertOne({ ...filter, id:'nom', hohId:'a', nomineeIds:nominees, nomineeNames:nominees.map(id => id.toUpperCase()) })
}
async function request(path, data, id = 'admin', method = data === undefined ? 'GET' : 'POST') {
  const token = jwt.sign({ userId:id, name:id, role:id === 'admin' ? 'admin' : 'houseguest' }, process.env.JWT_SECRET)
  const response = await fetch(origin + path, { method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data) })
  return { status:response.status, ...await response.json() }
}
async function ok(path, data, id) {
  const response = await request(path, data, id)
  assert.equal(response.success, true, JSON.stringify(response))
  return response.data
}
const twist = (id, data, user) => ok('/twist', { round:2, twist:id, ...data }, user)
const branch = (id, branchAction, user) => twist(id, { branchAction }, user)
const nominate = ids => ok('/nomination/set', { nomineeIds:ids, nomineeNames:ids.map(id => id.toUpperCase()) })
const vote = (voter,targetId) => ok('/eviction/vote', { targetId }, voter)
const vetoFixture = () => col('BBVetoRecord').insertOne({ ...filter,id:'veto',winnerId:'e',winnerName:'E',status:'won',ceremony:{started:true,messages:[]} })

test('安全挑战阻止胜者被提名', async () => {
  await fixture('safety_suite','nomination')
  await twist('safety_suite',{target:'b'})
  assert.equal((await request('/nomination/set',{nomineeIds:['b','c'],nomineeNames:['B','C']})).status,400)
  await nominate(['c','d'])
})

test('预埋候补向无权者隐藏，推进时自动补位', async () => {
  await fixture('sealed_replacement','nomination')
  await twist('sealed_replacement',{targets:['d','f']},'a')
  assert.equal((await ok('/twist',undefined,'b')).reserveIds,undefined)
  await nominate(['b','c'])
  await col('BBSeason').updateOne({gameId},{$set:{currentStage:'veto_ceremony'}})
  await vetoFixture()
  await ok('/veto/use',{targetPlayerId:'b',targetPlayerName:'B'},'e')
  await ok('/season/next',{})
  await ok('/season/next',{})
  assert.deepEqual((await col('BBNomination').findOne(filter)).nomineeIds,['c','d'])
  assert.equal((await col('BBSeason').findOne({gameId})).currentStage,'eviction_vote')
})

test('护符托管转交决定权', async () => {
  await fixture('veto_trustee','veto_ceremony',['b','c'])
  await vetoFixture()
  await twist('veto_trustee',{target:'d'},'e')
  assert.equal((await request('/veto/skip',{},'e')).status,403)
  await ok('/veto/skip',{},'d')
})

test('救援合约生效后，下一轮保证 POV 参赛席位', async () => {
  await fixture('rescue_contract','nomination')
  await twist('rescue_contract',{target:'c'},'b')
  await twist('rescue_contract',{accept:true},'c')
  await col('BBVetoRecord').insertOne({...filter,id:'veto',winnerId:'b',used:true,usedOnPlayerId:'c'})
  await col('BBSeason').updateOne({gameId},{$set:{currentRound:3,currentStage:'veto_competition'}})
  await col('BBNomination').insertOne({gameId,roundId:'round-3',id:'next-nom',nomineeIds:['d','e']})
  await ok('/veto/draw',{})
  const draw = await col('BBVetoRecord').findOne({gameId,roundId:'round-3'})
  assert.ok(draw.participants.some(p => p.playerId === 'b'))
})

test('保留票保下票数最高者并淘汰两人', async () => {
  await fixture('save_vote','eviction_vote',['b','c','d'])
  await ok('/eviction/start-vote',{})
  await vote('e','c')
  await vote('f','c')
  await vote('g','b')
  const result = await ok('/eviction/night/start',{})
  assert.deepEqual(result.evicted.map(p=>p.id).sort(),['b','d'])
  assert.equal((await col('BBHouseguest').findOne({id:'c'})).status,'active')
})

test('政变权使用后改写最终名单并只能使用一次', async () => {
  await fixture('coup_detat','eviction_vote',['b','c'])
  await twist('coup_detat',{target:'d'})
  await twist('coup_detat',{replaced:['b'],targets:['e']},'d')
  assert.deepEqual((await col('BBNomination').findOne(filter)).nomineeIds,['e','c'])
  assert.equal((await request('/twist',{round:2,twist:'coup_detat',replaced:['e'],targets:['f']},'d')).status,403)
})

test('第一轮平票后锁定一名安全者，剩余两人重投', async () => {
  await fixture('tie_recall','eviction_vote',['b','c','d'])
  await ok('/eviction/start-vote',{})
  await vote('e','b')
  await vote('f','c')
  assert.equal((await request('/eviction/night/start',{})).code,'TIE_RECALL_PENDING')
  await twist('tie_recall',{target:'b'},'a')
  await ok('/eviction/start-vote',{})
  await vote('e','c')
  const result = await ok('/eviction/night/start',{})
  assert.equal(result.evicted[0].id,'c')
})

for (const id of ['battle_back','costly_return']) {
  test(id + ' restores player and applies HOH eligibility', async () => {
    await fixture(id,'hoh_competition',null,{jurySize:3})
    await col('BBHouseguest').updateOne({id:'b'},{$set:{status:'evicted'}})
    await col('BBEviction').insertOne({gameId,id:'old',roundId:'round-1',evictedId:'b'})
    await twist(id,{target:'b'})
    const player = await col('BBHouseguest').findOne({id:'b'})
    assert.equal(player.status,'active')
    const result = await request('/hoh/assign',{playerId:'b'})
    assert.equal(result.success,id === 'battle_back')
  })
}

test('回卷归档第一遍记录并重新从本轮 HOH 开始', async () => {
  await fixture('round_rewind','eviction_vote',['b','c'])
  assert.equal((await request('/eviction/start-vote',{})).status,409)
  await twist('round_rewind',{})
  assert.equal((await col('BBSeason').findOne({gameId})).currentStage,'hoh_competition')
  const state = await col('BBRoundTwist').findOne({})
  assert.deepEqual(state.rewindArchive.BBNomination[0].nomineeIds,['b','c'])
  assert.equal(await col('BBNomination').findOne(filter),null)
})

test('提前挂牌进入提名且获得一次免冷却重试', async () => {
  await fixture('voluntary_nominee','nomination')
  await twist('voluntary_nominee',{action:'apply'},'b')
  await twist('voluntary_nominee',{action:'choose',target:'b'},'a')
  assert.equal((await request('/nomination/set',{nomineeIds:['c','d'],nomineeNames:['C','D']})).status,400)
  await nominate(['b','c'])
  const game = getGame('quick-math')
  const state = game.init([{playerId:'b'},{playerId:'c'}],null,{vetoRetryPlayerId:'b'})
  assert.equal(game.handleAction(state,'b',{type:'answer',answer:9999}).result.retryUsed,true)
  assert.ok(game.handleAction(state,'b',{type:'answer',answer:9999}).result.cooldownUntil > Date.now())
})

test('申诉短赛由服务端判定，答对者获得重试权', async () => {
  await fixture('nomination_appeal','nomination',['b','c'])
  await twist('nomination_appeal',{action:'apply'},'b')
  const started = await twist('nomination_appeal',{action:'start'})
  assert.equal(started.appeal.answer,undefined)
  const answer = started.appeal.expression.split(' + ').map(Number).reduce((a,b)=>a+b)
  const game = await twist('nomination_appeal',{action:'answer',answer},'b')
  assert.equal(game.appeal.winnerId,'b')
  assert.equal(await require('../src/games/bigbrother/roundTwists').vetoRetryPlayer({id:'test-season',currentRound:2,roundConfigs:[{round:2,twists:['nomination_appeal']}]}),'b')
})

test('双房主对抗胜组获救，另一名 HOH 进入常规 POV', async () => {
  await fixture('battle_of_block','hoh_competition')
  await branch('battle_of_block',{kind:'setup',ids:['a','b']})
  await branch('battle_of_block',{kind:'nominate',ids:['c','d']},'a')
  await branch('battle_of_block',{kind:'nominate',ids:['e','f']},'b')
  await branch('battle_of_block',{kind:'result',winner:'a'})
  assert.equal((await col('BBHohRecord').findOne(filter)).winnerId,'b')
  assert.deepEqual((await col('BBNomination').findOne(filter)).nomineeIds,['e','f'])
  assert.equal((await col('BBSeason').findOne({gameId})).currentStage,'veto_competition')
})

test('分屋独立计票、限制跨组可见性并合屋', async () => {
  await fixture('split_house','hoh_competition')
  await branch('split_house',{kind:'setup',ids:ids.slice(0,5)})
  assert.equal((await ok('/twist',undefined,'a')).branch.groups.length,1)
  await branch('split_house',{kind:'message',text:'private A'},'a')
  assert.deepEqual((await ok('/twist',undefined,'f')).branch.groups[0].messages,[])
  for (const [group, start] of [[0,0],[1,5]]) {
    const [hoh,x,y,pov,voter] = ids.slice(start,start+5)
    await branch('split_house',{kind:'hoh',group,target:hoh})
    await branch('split_house',{kind:'nominate',ids:[x,y]},hoh)
    await branch('split_house',{kind:'pov',group,target:pov})
    await branch('split_house',{kind:'pov-decision',target:x},pov)
    await branch('split_house',{kind:'replace',target:voter},hoh)
    await branch('split_house',{kind:'vote',target:y},pov)
    await branch('split_house',{kind:'vote',target:y},x)
    await branch('split_house',{kind:'settle',group})
  }
  await branch('split_house',{kind:'merge'})
  assert.equal(await col('BBEviction').countDocuments(filter),2)
  assert.equal((await col('BBSeason').findOne({gameId})).currentStage,'eviction')
})

test('赛程配置拒绝分屋人数不足，并按复活的净淘汰数计算终局', async () => {
  await fixture('battle_back','hoh_competition',null,{currentRound:1})
  const config = (round, twists) => request('/season/config', { roundConfigs:[{round,twists}] }, 'admin','PUT')
  const tooFew = await config(2,['split_house'])
  assert.equal(tooFew.status,400)
  assert.match(tooFew.error,/10 名/)
  const conflict = await config(2,['save_vote','bbbb'])
  assert.equal(conflict.status,400)
  assert.match(conflict.error,/不能同时开启/)
  const planned = await config(2,['battle_back'])
  assert.equal(planned.success,true,JSON.stringify(planned))
  assert.equal(planned.data.final3Round,9)
  assert.equal(planned.data.championRound,10)
})

async function challengeWinner(key, playerId) {
  const created = await ok('/twist/challenges', { round: 2, key, action: 'create', minigameId: 'quick-math' })
  const room = rooms.get(created.roomId)
  const game = getGame('quick-math')
  const state = game.init(room.participants)
  for (const question of state.playerStates[playerId].questions) {
    game.handleAction(state, playerId, { type: 'answer', answer: question.answer })
  }
  const winnerId = game.computeWinner(state)
  assert.equal(winnerId, playerId)
  room.status = 'finished'
  room.winner = room.participants.find(p => p.playerId === winnerId)
  room.winners = [room.winner]
  return room
}
const applyChallenge = key => ok('/twist', { round: 2, challengeKey: key })

test('安全比赛：无权者不能开赛，真实算术结果进入免提名名单', async () => {
  await fixture('safety_suite', 'nomination')
  assert.equal((await request('/twist/challenges', { round: 2, key:'safety', action:'create', minigameId:'quick-math' }, 'b')).status, 403)
  assert.equal((await ok('/twist/challenges', undefined, 'a')).slots.length, 0)
  const room = await challengeWinner('safety', 'b')
  assert.equal((await request('/minigame/room/' + room.roomId, undefined, 'a')).status, 404)
  assert.equal((await request('/minigame/set-winner', { roomId: room.roomId, playerId: 'c' })).status, 404)
  assert.equal((await request('/twist', { round: 2, challengeKey:'safety' }, 'b')).status, 403)
  await applyChallenge('safety')
  assert.equal((await ok('/twist')).safePlayerId,'b')
})

test('复活比赛：只向符合资格的已淘汰房客开放，冠军回归', async () => {
  await fixture('battle_back','hoh_competition')
  await col('BBHouseguest').updateMany({id:{$in:['b','c']}},{$set:{status:'evicted'}})
  await col('BBEviction').insertOne({gameId,id:'old',roundId:'round-1',evictedId:'b'})
  await challengeWinner('revival','b')
  assert.equal((await ok('/twist/challenges', undefined, 'a')).slots.length,0)
  assert.equal((await ok('/twist/challenges', undefined, 'b')).slots[0].key,'revival')
  await applyChallenge('revival')
  assert.equal((await col('BBHouseguest').findOne({id:'b'})).status,'active')
})

test('双房主比赛：依次产生临时 HOH，提名组胜者映射到对应队伍', async () => {
  await fixture('battle_of_block','hoh_competition')
  await challengeWinner('battle-hoh-1','a')
  await applyChallenge('battle-hoh-1')
  assert.equal((await ok('/twist/challenges', undefined, 'a')).slots.length,0)
  await challengeWinner('battle-hoh-2','b')
  await applyChallenge('battle-hoh-2')
  await branch('battle_of_block',{kind:'nominate',ids:['c','d']},'a')
  await branch('battle_of_block',{kind:'nominate',ids:['e','f']},'b')
  await challengeWinner('battle-nominees','c')
  await applyChallenge('battle-nominees')
  assert.equal((await col('BBHohRecord').findOne(filter)).winnerId,'b')
})

test('分屋比赛：两个房间可同时独立存在，POV 结果仅影响本组', async () => {
  await fixture('split_house','hoh_competition')
  await branch('split_house',{kind:'setup',ids:ids.slice(0,5)})
  await challengeWinner('split-0-hoh','a')
  await challengeWinner('split-1-hoh','f')
  assert.deepEqual((await ok('/twist/challenges', undefined, 'b')).slots.map(s=>s.key), ['split-0-hoh'])
  assert.deepEqual((await ok('/twist/challenges', undefined, 'g')).slots.map(s=>s.key), ['split-1-hoh'])
  await applyChallenge('split-0-hoh')
  await branch('split_house',{kind:'nominate',ids:['b','c']},'a')
  await challengeWinner('split-0-pov','d')
  await applyChallenge('split-0-pov')
  await applyChallenge('split-1-hoh')
  const { branch: { groups } } = await ok('/twist')
  assert.deepEqual(groups.map(g=>g.phase), ['pov-decision','nominate'])
  assert.equal(groups[0].pov,'d')
})

test('真实 Socket 挑战：站内答案产生胜者并写入安全挑战', { timeout: 20000 }, async () => {
  await fixture('safety_suite','nomination')
  const { Server } = require('socket.io')
  const { initBBMinigameSocket } = require('../src/socket/bbMinigame')
  challengeIO = new Server(server)
  initBBMinigameSocket(challengeIO)
  application.set('io', challengeIO)
  const created = await ok('/twist/challenges', { round:2,key:'safety',action:'create',minigameId:'quick-math' })
  const room = challengeIO.of('/bigbrother-minigame').getRoom(created.roomId)
  // Shorten the representative match without bypassing its action handler.
  room.targetScore = 1
  room.options.timeLimit = 0
  const token = jwt.sign({userId:'b',name:'B',role:'houseguest'},process.env.JWT_SECRET)
  const client = new WebSocket(origin.replace('http:','ws:') + '/socket.io/?EIO=4&transport=websocket')
  try {
    const finished = new Promise((resolve,reject) => {
      client.addEventListener('error',reject,{once:true})
      client.addEventListener('message', ({data}) => {
        if (data.startsWith('0')) client.send('40/bigbrother-minigame,'+JSON.stringify({token}))
        if (data === '2') client.send('3')
        if (data.startsWith('40/bigbrother-minigame,')) {
          client.send('42/bigbrother-minigame,'+JSON.stringify(['join_room',{roomId:room.roomId}]))
        }
        if (!data.startsWith('42/bigbrother-minigame,')) return
        const [event,payload] = JSON.parse(data.slice('42/bigbrother-minigame,'.length))
        if (['game_progress', 'game_event', 'game_event_history', 'game_admin_view'].includes(event)) {
          return reject(new Error('选手收到管理员专用事件 ' + event))
        }
        if (event === 'game_state' && room.status === 'playing' && payload.currentQuestion) {
          const m = /^(\d+)\s*([+\-−])\s*(\d+)$/.exec(payload.currentQuestion)
          if (!m) return reject(new Error('未知题面 '+payload.currentQuestion))
          const answer = m[2] === '+' ? Number(m[1]) + Number(m[3]) : Number(m[1]) - Number(m[3])
          client.send('42/bigbrother-minigame,'+JSON.stringify(['game_action',{roomId:room.roomId,action:{type:'answer',answer}}]))
        }
        if (event === 'game_finished') resolve(payload)
      })
    })
    await ok('/twist/challenges', { round:2,key:'safety',action:'start' })
    const watching = (await ok('/twist/challenges', undefined, 'a')).slots[0].room
    assert.equal(watching.status, 'countdown')
    assert.deepEqual(watching.spectatorState.map(p => p.playerId), ids.slice(1))
    assert.equal((await ok('/twist/challenges', undefined, 'b')).slots[0].room.spectatorState, undefined)
    assert.equal((await request('/minigame/active-room/twist/', undefined, 'a')).status, 404)
    assert.equal((await finished).winner.playerId,'b')
    await applyChallenge('safety')
    assert.equal((await ok('/twist')).safePlayerId,'b')
  } finally { client.close() }
})

test('选手观战只收到公开进度，答题记录仅管理员可读', async () => {
  const { Server } = require('socket.io')
  const { initBBMinigameSocket } = require('../src/socket/bbMinigame')
  const io = new Server()
  initBBMinigameSocket(io)
  const previousIO = application.get('io')
  application.set('io', io)
  const namespace = io.of('/bigbrother-minigame')
  const room = namespace.createRoom('hoh', 'missing-number', [
    { playerId: 'b', playerName: 'B' }, { playerId: 'c', playerName: 'C' }
  ], null, { roundIndex: 2, options: { questions: ['hidden-question'] } })
  try {
    assert.equal((await ok('/minigame/active-room/hoh', undefined, 'a')).spectatorState, undefined)
    room.status = 'playing'
    room.gameState = { playerStates: { b: { correct: true, value: 6789 }, c: {} } }
    const watching = await ok('/minigame/active-room/hoh', undefined, 'a')
    assert.equal(watching.roundIndex, 2)
    assert.deepEqual(watching.spectatorState[0], {
      playerId: 'b', playerName: 'B', avatar: null, connected: false,
      score: 1, progress: 1, max: 1, done: true, eliminated: false
    })
    assert.equal(watching.options, undefined)
    assert.equal((await ok('/minigame/active-room/hoh', undefined, 'b')).spectatorState, undefined)
    assert.equal((await request('/minigame/active-rooms', undefined, 'a')).status, 403)
    assert.equal((await request('/custom-game/list', undefined, 'a')).status, 403)
    assert.equal((await request('/minigame/room-progress/' + room.roomId, undefined, 'a')).status, 403)
    assert.equal((await request('/minigame/stop', { roomId: room.roomId }, 'a')).status, 403)
    assert.equal((await ok('/minigame/room-progress/' + room.roomId)).states.b.label, '已答对 6789')
    await ok('/minigame/pause', { roomId: room.roomId })
    assert.equal((await ok('/minigame/active-room/hoh', undefined, 'a')).status, 'paused')
    await ok('/minigame/stop', { roomId: room.roomId })
    assert.equal(await ok('/minigame/active-room/hoh', undefined, 'a'), null)
  } finally {
    namespace.cleanupRoom(room.roomId)
    application.set('io', previousIO)
  }
})
