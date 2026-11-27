const { branches, battleResult, splitResult, visibleBranch, publishBranch } = require('../branchTwists')
const { randomInt } = require('crypto')
const router = require('express').Router()
const { auth } = require('../../../middleware/auth')
const { getCollection } = require('../../../config/db')
const { getCurrentSeason, getTwistsForRound, logAction, BB_ACTION_TYPES } = require('../helpers')
const { loadRoundTwist, writeRoundTwist } = require('../roundTwists')

const gameId = 'bigbrother'

async function context() {
  const season = await getCurrentSeason()
  if (!season) return null
  const filter = { gameId, roundId: `round-${season.currentRound}` }
  const [state, hoh, nomination, veto, players] = await Promise.all([
    loadRoundTwist(season),
    getCollection('BBHohRecord').findOne(filter),
    getCollection('BBNomination').findOne(filter),
    getCollection('BBVetoRecord').findOne(filter),
    getCollection('BBHouseguest').find({ gameId, role: 'houseguest', status: 'active' }).project({ id: 1, name: 1 }).toArray()
  ])
  const ids = getTwistsForRound(season.currentRound, season.twistConfigs, season.roundConfigs)
  const revival = ids.find(id => id === 'battle_back' || id === 'costly_return')
  const revivalPool = revival ? await getCollection('BBHouseguest').find({
    gameId, role: 'houseguest', status: { $in: revival === 'battle_back' ? ['evicted', 'jury'] : ['evicted'] }
  }).project({ id: 1, name: 1 }).toArray() : []
  return { season, state, hoh, nomination, veto, players, ids, revival, revivalPool }
}

function publicState(ctx, user) {
  const { state, hoh, nomination, veto, players, ids, season, revival, revivalPool } = ctx
  const admin = user.role === 'admin'
  const isHoh = user.userId === hoh?.winnerId
  return {
    branch: branches(season) ? visibleBranch(branches(season), state.branch, user) : undefined,
    ids, round: season.currentRound, stage: season.currentStage, players: state.branchRoster || players,
    canPrepare: season.currentStage === 'nomination' && Boolean(hoh) && !nomination,
    canSetSafety: admin,
    canSetReserve: admin || isHoh,
    reserveIds: admin || isHoh ? state.reserveIds || [] : undefined,
    safePlayerId: ids.includes('safety_suite') ? state.safePlayerId : undefined,
    nomineeIds: nomination?.nomineeIds || [],
    contract: ids.includes('rescue_contract') ? state.contract : undefined,
    trusteeId: ids.includes('veto_trustee') ? state.trusteeId : undefined,
    canTransfer: season.currentStage === 'veto_ceremony' && !state.trusteeId
      && veto?.winnerId && (admin || veto.winnerId === user.userId)
      && !['used', 'skipped'].includes(veto.status),
    canDecide: season.currentStage === 'veto_ceremony' && veto?.ceremony?.started
      && state.trusteeId && (admin || state.trusteeId === user.userId)
      && !['used', 'skipped'].includes(veto.status),
    coupHolderId: ids.includes('coup_detat') ? state.coupHolderId : undefined,
    coupUsed: Boolean(state.coupUsed),
    canAssignCoup: admin && ['nomination', 'eviction_vote'].includes(season.currentStage) && !nomination?.voteStarted && !state.coupUsed,
    canUseCoup: season.currentStage === 'eviction_vote' && Boolean(nomination)
      && !nomination.voteStarted && !season.votesLocked && !state.coupUsed
      && Boolean(state.coupHolderId) && (admin || state.coupHolderId === user.userId),
    tieRecall: ids.includes('tie_recall') ? state.tieRecall : undefined,
    canResolveTie: (admin || isHoh) && season.currentStage === 'eviction_vote' && state.tieRecall?.status === 'pending',
    volunteers: state.volunteers || [],
    volunteerId: state.volunteerId,
    canVolunteer: season.currentStage === 'nomination' && !nomination && !state.volunteerId && hoh
      && user.userId !== hoh.winnerId && players.some(p => p.id === user.userId),
    canSelectVolunteer: season.currentStage === 'nomination' && !nomination && !state.volunteerId && (admin || isHoh),
    appeal: state.appeal ? {
      status: state.appeal.status, playerId: state.appeal.playerId, hohId: state.appeal.hohId,
      expression: state.appeal.expression, winnerId: state.appeal.winnerId, deadline: state.appeal.deadline
    } : undefined,
    canAppeal: season.currentStage === 'nomination' && Boolean(nomination) && (!nomination.keyCeremony?.prepared || nomination.keyCeremony.ended)
      && nomination.nomineeIds.includes(user.userId) && !state.appeal,
    canManageAppeal: admin && season.currentStage === 'nomination',
    rewoundAt: state.rewoundAt,
    canRewind: admin && season.currentStage === 'eviction_vote' && !nomination?.voteStarted && !state.rewoundAt,
    revivedId: state.revivedId,
    revivalPool: admin ? revivalPool : undefined,
    canRevive: admin && !!revival && season.currentStage === 'hoh_competition' && !hoh && !state.revivedId,
    me: user.userId
  }
}

router.get('/', auth, async (req, res, next) => {
  try {
    const ctx = await context()
    res.json({ success: true, data: ctx ? publicState(ctx, req.user) : null })
  } catch (error) { next(error) }
})

router.post('/', auth, async (req, res, next) => {
  const fail = (error, code = 400) => res.status(code).json({ success: false, error })
  try {
    const ctx = await context()
    if (!ctx) return fail('赛季不存在', 404)
    const { ids, season, state, hoh, nomination, players } = ctx
    const { twist, target, targets, replaced, accept, round, action, answer } = req.body || {}
    if (round !== season.currentRound || !ids.includes(twist)) return fail('轮次已变更或本轮未启用此规则', 409)
    const { role, userId } = req.user
    const admin = role === 'admin'
    const player = id => players.some(p => p.id === id)
    const eligible = id => player(id) && id !== hoh?.winnerId
    const preparing = season.currentStage === 'nomination' && hoh && !nomination
    let patch
    let conditions = {}
    let detail
    if (branches(season) === twist && season.currentStage === 'hoh_competition') {
      if (!admin && !player(userId)) return fail('你不在本轮参赛名单内', 403)
      const move = req.body.branchAction || {}
      let updated
      if (admin && move.kind === 'publish' && state.branch?.done) updated = state.branch
      else updated = (twist === 'split_house' ? splitResult : battleResult)(state.branch, move, req.user, players.map(p => p.id))
      if (updated !== state.branch) {
        const collection = getCollection('BBRoundTwist')
        const revision = state.branchRevision || 0
        if (!state._id) {
          try {
            await collection.insertOne({ _id: `${season.id}:${round}`, seasonId: season.id, round, gameId, branch: updated, branchRoster: players, branchRevision: 1 })
          } catch (e) {
            if (e.code === 11000) return fail('赛况已更新，请刷新后再操作', 409)
            throw e
          }
        } else {
          const query = { _id: state._id, ...(revision ? { branchRevision: revision } : { branchRevision: { $exists: false } }) }
          const write = await collection.updateOne(query, { $set: { branch: updated }, $inc: { branchRevision: 1 } })
          if (!write.modifiedCount) return fail('赛况已更新，请刷新后再操作', 409)
        }
      }
      if (updated.done) await publishBranch(season, twist, updated, players)
      if (move.kind !== 'message') {
        await logAction(userId, req.user.name, role, BB_ACTION_TYPES.TWIST_APPLIED, 'round', String(round), `${twist}：${move.kind}`)
      }
      return res.json({ success: true, data: publicState({ ...ctx, state: { ...state, branch: updated } }, req.user) })
    }
    if (twist === 'safety_suite' && preparing && admin) {
      if (!eligible(target)) return fail('请选择有效的非 HOH 房客')
      patch = { safePlayerId: target }
      detail = '安全挑战结果已确认'
    } else if (twist === 'sealed_replacement' && preparing && (admin || userId === hoh?.winnerId)) {
      if (!Array.isArray(targets) || targets.length !== 2 || new Set(targets).size !== 2
        || !targets.every(id => eligible(id) && id !== state.safePlayerId)) return fail('请选择两名合资格且不同的候补')
      patch = { reserveIds: targets }
      detail = '两名候补已锁定'
    } else if (twist === 'rescue_contract' && preparing && player(userId)) {
      if (accept) {
        if (!state.contract || state.contract.ids[1] !== userId || state.contract.accepted) return fail('没有待你确认的合约')
        patch = { contract: { ...state.contract, accepted: true } }
      } else {
        if (!player(target) || target === userId || state.contract) return fail('请选择另一位房客，每轮只开放一份合约')
        conditions = { contract: { $exists: false } }
        patch = { contract: { ids: [userId, target], accepted: false } }
      }
      detail = accept ? '救援合约已生效' : '已发出合约邀请'
    } else if (twist === 'veto_trustee' && publicState(ctx, req.user).canTransfer) {
      if (!player(target) || target === ctx.veto.winnerId || nomination?.nomineeIds?.includes(target)) return fail('托管人须为未被提名的其他选手')
      conditions = { trusteeId: { $exists: false } }
      patch = { trusteeId: target }
      detail = 'POV 决定权已转交'
    } else if (twist === 'coup_detat' && !replaced && publicState(ctx, req.user).canAssignCoup) {
      if (!player(target)) return fail('请选择在场选手持有政变权')
      patch = { coupHolderId: target }
      detail = '已公布政变权归属'
    } else if (twist === 'coup_detat' && publicState(ctx, req.user).canUseCoup) {
      const disallowed = new Set([...nomination.nomineeIds, hoh?.winnerId, ctx.veto?.winnerId, ctx.veto?.usedOnPlayerId, state.safePlayerId, state.coupHolderId])
      if (!Array.isArray(replaced) || !Array.isArray(targets) || replaced.length !== targets.length
        || replaced.length < 1 || replaced.length > 2 || new Set(replaced).size !== replaced.length
        || new Set(targets).size !== targets.length || !replaced.every(id => nomination.nomineeIds.includes(id))
        || !targets.every(id => player(id) && !disallowed.has(id))) return fail('请选择一至两组有效的撤换人选')
      const nextIds = nomination.nomineeIds.map(id => replaced.includes(id) ? targets[replaced.indexOf(id)] : id)
      const nextNames = nextIds.map(id => players.find(p => p.id === id)?.name || '')
      const update = await getCollection('BBNomination').updateOne({ _id: nomination._id, voteStarted: { $ne: true }, nomineeIds: nomination.nomineeIds }, {
        $set: { nomineeIds: nextIds, nomineeNames: nextNames, replacementNomineeId: null, replacementNomineeName: '' }
      })
      if (!update.modifiedCount) return fail('名单已变更，请刷新后重试', 409)
      patch = { coupUsed: true }
      detail = `政变权生效：${replaced.join('、')} → ${targets.join('、')}`
      ctx.nomination = { ...nomination, nomineeIds: nextIds }
    } else if (twist === 'tie_recall' && publicState(ctx, req.user).canResolveTie) {
      if (!state.tieRecall.tiedIds.includes(target) || !nomination?.nomineeIds?.includes(target) || !player(target)) return fail('只能保下仍在场的最高票并列者')
      const newIds = nomination.nomineeIds.filter(id => id !== target)
      const newNames = nomination.nomineeNames.filter((_, index) => nomination.nomineeIds[index] !== target)
      const filter = { gameId, roundId: `round-${round}` }
      const update = await getCollection('BBNomination').updateOne({ _id: nomination._id, nomineeIds: nomination.nomineeIds }, {
        $set: { nomineeIds: newIds, nomineeNames: newNames, voteStarted: false, replacementNomineeId: null, replacementNomineeName: '' }
      })
      if (!update.modifiedCount) return fail('本轮重投已开启', 409)
      await getCollection('BBEvictionVote').deleteMany(filter)
      patch = { tieRecall: { ...state.tieRecall, status: 'revote', safeId: target } }
      detail = `并列召回：${players.find(p => p.id === target).name} 安全，另外两人重投`
      ctx.nomination = { ...nomination, nomineeIds: newIds, voteStarted: false }
    } else if (twist === ctx.revival && publicState(ctx, req.user).canRevive) {
      if (!ctx.revivalPool.some(p => p.id === target)) return fail('请选择符合回归条件的淘汰者')
      const history = getCollection('BBEviction')
      const records = await history.find({ gameId, evictedId: target, reinstatedAt: { $exists: false } }).toArray()
      const previous = records
        .map(record => ({ record, round: record.roundIndex || Number(record.roundId?.replace('round-', '')) }))
        .filter(entry => entry.round > 0 && entry.round < round)
        .sort((a,b) => b.round - a.round)[0]?.record
      if (!previous) return fail('该房客没有可恢复的淘汰记录')
      if (twist === 'costly_return' && await getCollection('BBHouseguest').countDocuments({ gameId, status: 'jury' })) {
        return fail('代价复活只在陪审团开始前执行')
      }
      const restored = await getCollection('BBHouseguest').updateOne({ gameId, id: target, status: { $in: ['evicted','jury'] } }, {
        $set: { status: 'active', updatedAt: new Date().toISOString() }
      })
      if (!restored.modifiedCount) return fail('选手状态已变更', 409)
      await history.updateOne({ _id: previous._id }, { $set: { reinstatedAt: new Date().toISOString(), reinstatedRound: round } })
      patch = { revivedId: target }
      detail = `复活赛结果：${ctx.revivalPool.find(p => p.id === target).name} 回归`
      ctx.players.push(ctx.revivalPool.find(p => p.id === target))
    } else if (twist === 'round_rewind' && publicState(ctx, req.user).canRewind) {
      const namespace = req.app.get('io')?.of('/bigbrother-minigame')
      if (['hoh','veto','bbbb'].some(type => namespace?.getActiveRoomForType(type))) return fail('请先结束本轮仍在运行的小游戏')
      if (!nomination || !hoh) return fail('回卷前必须有正式提名与 HOH 结果')
      const filter = { gameId, roundId: `round-${round}` }
      const collections = ['BBHohRecord','BBNomination','BBVetoRecord','BBEvictionVote']
      const archived = state.rewindArchive || Object.fromEntries(await Promise.all(collections.map(async collection =>
        [collection, await getCollection(collection).find(filter).toArray()]
      )))
      await writeRoundTwist(season, { rewindArchive: archived })
      for (const collection of collections) await getCollection(collection).deleteMany(filter)
      season.currentStage = 'hoh_competition'
      season.nextHohPlayerId = null
      season.nextHohPlayerName = ''
      season.votesLocked = false
      season.evictionNight = null
      await season.save()
      patch = { rewoundAt: new Date().toISOString() }
      detail = '第一遍结果已归档，本轮重新争夺 HOH'
    } else if (twist === 'voluntary_nominee' && action === 'apply' && publicState(ctx, req.user).canVolunteer) {
      patch = { volunteers: [...new Set([...(state.volunteers || []), userId])] }
      detail = '选手自荐提前挂牌'
    } else if (twist === 'voluntary_nominee' && action === 'choose' && publicState(ctx, req.user).canSelectVolunteer) {
      if (!eligible(target) || !state.volunteers?.includes(target)) return fail('请选择已报名的有效房客')
      conditions = { volunteerId: { $exists: false } }
      patch = { volunteerId: target }
      detail = 'HOH 已确认自荐提名'
    } else if (twist === 'nomination_appeal' && action === 'apply' && publicState(ctx, req.user).canAppeal) {
      conditions = { appeal: { $exists: false } }
      patch = { appeal: { playerId: userId, hohId: hoh?.winnerId, status: 'pending' } }
      detail = '被提名者发起申诉'
    } else if (twist === 'nomination_appeal' && action === 'start' && admin && season.currentStage === 'nomination' && state.appeal?.status === 'pending') {
      conditions = { 'appeal.status': 'pending' }
      const left = randomInt(23, 89)
      const right = randomInt(17, 79)
      patch = { appeal: { ...state.appeal, status: 'playing', expression: `${left} + ${right}`, answer: left + right, deadline: Date.now() + 30000 } }
      detail = '申诉短赛开始'
    } else if (twist === 'nomination_appeal' && action === 'answer' && season.currentStage === 'nomination' && state.appeal?.status === 'playing') {
      if (![state.appeal.playerId, state.appeal.hohId].includes(userId) || Date.now() > state.appeal.deadline) return fail('你未参加挑战或答题时间已到')
      if (Number(answer) !== state.appeal.answer) return fail('答案不正确，可以继续作答')
      const update = await getCollection('BBRoundTwist').updateOne({
        _id: state._id, 'appeal.status': 'playing', 'appeal.deadline': { $gte: Date.now() }
      }, { $set: { 'appeal.status': 'resolved', 'appeal.winnerId': userId } })
      if (!update.modifiedCount) return fail('短赛已结束', 409)
      patch = { appeal: { ...state.appeal, status: 'resolved', winnerId: userId } }
      detail = '申诉短赛已完成'
    } else if (twist === 'nomination_appeal' && action === 'close' && admin && season.currentStage === 'nomination'
      && (state.appeal?.status === 'playing' && state.appeal.deadline <= Date.now())) {
      conditions = { 'appeal.status': 'playing' }
      patch = { appeal: { ...state.appeal, status: 'resolved', winnerId: null } }
      detail = '申诉短赛超时结束'
    } else return fail('当前身份或阶段不能进行此操作', 403)
    if (!(await writeRoundTwist(season, patch, conditions))) return fail('本轮状态已变化，请刷新后再操作', 409)
    await logAction(userId, req.user.name, role, BB_ACTION_TYPES.TWIST_APPLIED, 'round', String(round), detail)
    res.json({ success: true, data: publicState({ ...ctx, state: { ...state, ...patch } }, req.user) })
  } catch (error) { if (error.status === 400) return fail(error.message); next(error) }
})

module.exports = router
