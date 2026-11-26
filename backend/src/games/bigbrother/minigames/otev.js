/**
 * OTEV 抢座问答赛
 *
 * 规则概要：
 *  - 每轮 OTEV 唱出一个谜语，答案是 1 位或 2 位房客。
 *  - 所有玩家共享同一个公共牌池，每张牌写有 1-2 个名字。
 *  - 查看（peek）是非独占的：多人可以同时查看同一张牌，但只有查看者自己看到牌面。
 *  - 拿走（claim）是独占的：第一个拿走的玩家获得该牌，牌从公共池消失。
 *  - 每人同时只能持有一张牌；可以提交，也可以丢回公共池后继续翻找。
 *  - 牌池中默认放入 N 张正确答案牌（N = 存活人数），另加干扰牌。
 *  - 所有存活玩家提交、或翻找时间截止后，按提交顺序逐个揭晓：
 *      第一个错误答案 -> 该玩家淘汰；
 *      若前面 N-1 人全对，则最后一个提交者淘汰；
 *      超时未提交者会自动携带最近查看的牌（从未查看则随机），不会卡住本轮。
 *  - 每轮只淘汰 1 人，最后存活者获胜。
 */
const { registerGame } = require('./index')
const BBHouseguest = require('../models/BBHouseguest')
const BBEviction = require('../models/BBEviction')
const BBNomination = require('../models/BBNomination')
const BBHohRecord = require('../models/BBHohRecord')
const BBVetoRecord = require('../models/BBVetoRecord')

const PEEK_MS = 5000
const PEEK_COOLDOWN_MS = 300
const SWAP_COOLDOWN_MS = 500

const PLAYER_COLORS = [
  '#ff6b6b', '#4ecdc4', '#ffd166', '#a78bfa', '#60a5fa',
  '#f472b6', '#34d399', '#fb923c', '#e879f9', '#38bdf8',
  '#facc15', '#f87171', '#2dd4bf', '#c084fc', '#fbbf24',
  '#93c5fd', '#f9a8d4', '#6ee7b7', '#fdba74', '#d8b4fe'
]

// 自动题库数据不足时的兜底名字（只作为干扰项/示例题，不参与真实赛季答案）
const FALLBACK_NAMES = [
  '阿力', '小美', '老张', '安娜', '大伟', '莉莉', '阿杰', '小云',
  '马克', '苏菲', '阿强', '米娅', '老王', '艾米', '小凯', '露娜',
  '阿豪', '妮妮', '大山', '可可'
]

// 自动题库完全为空时使用的示例题，避免比赛无法开始。
const SAMPLE_QUESTIONS = [
  { answers: ['阿力'], clues: ['我是示例题库里的第一位房客', '我的名字只有两个字'] },
  { answers: ['小美'], clues: ['我是示例题库里的第二位房客', '我的名字里有一个“美”字'] },
  { answers: ['阿力', '小美'], clues: ['我们是示例题库里的第一对搭档', '我们一男一女'] },
  { answers: ['老张'], clues: ['我是示例题库里的第三位房客', '我的名字里有一个“老”字'] },
  { answers: ['安娜', '大伟'], clues: ['我们是示例题库里的第二对搭档', '我们的名字都是两个字'] },
  { answers: ['莉莉'], clues: ['我是示例题库里的第四位房客', '我的名字是叠字'] }
]

function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return dflt
  return Math.max(min, Math.min(max, n))
}

function clampNum(v, min, max, dflt) {
  const n = Number(v)
  if (!Number.isFinite(n)) return dflt
  return Math.max(min, Math.min(max, n))
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function uniqueNames(arr) {
  const seen = new Set()
  const out = []
  for (const raw of arr || []) {
    const name = String(raw == null ? '' : raw).trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

function canonicalKey(names) {
  return [...(names || [])].map(n => String(n)).sort().join('\u0001')
}

function parseRound(roundId) {
  const m = String(roundId || '').match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

function pickOne(arr) {
  if (!arr || !arr.length) return ''
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function sortByRound(list) {
  return [...(list || [])].sort((a, b) => {
    const ra = parseRound(a.roundId)
    const rb = parseRound(b.roundId)
    if (ra !== rb) return ra - rb
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  })
}

function pushEvent(state, type, text, data) {
  if (!state._replayEvents) state._replayEvents = []
  state._replayEvents.push({ type, text, data: data || null })
}

function reasonText(reason) {
  if (reason === 'wrong') return '答案错误'
  if (reason === 'last') return '最后提交'
  if (reason === 'timeout') return '超时未提交'
  return '本轮淘汰'
}

function normalizeCustomQuestions(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const q of raw) {
    const rawAnswers = Array.isArray(q && q.answers)
      ? q.answers
      : [q && q.answer]
    const answers = uniqueNames(
      rawAnswers.flatMap(v => String(v == null ? '' : v).split(/[+＋、,&，]/))
    ).slice(0, 2)
    const rawClues = Array.isArray(q && q.clues)
      ? q.clues
      : [q && q.clue]
    const clues = rawClues
      .map(s => String(s == null ? '' : s).trim())
      .filter(Boolean)
    if (!answers.length || !clues.length) continue
    const clueText = clues.join(' ')
    // 线索里直接出现答案名字会让题目失去意义，过滤掉
    if (answers.some(a => clueText.includes(a))) continue
    out.push({ answers, clues })
  }
  return out
}

function buildAutoQuestions(pool) {
  const guests = (pool && pool.guests) || []
  const out = []

  // 1 人题：被淘汰房客
  const evictions = sortByRound(pool && pool.evictions)
  evictions.forEach((e, idx) => {
    const name = String((e && e.evictedName) || '').trim()
    if (!name) return
    const week = parseRound(e.roundId) || idx + 1
    const votes = Number(e.voteCount) || 0
    const clues = []
    if (votes > 0) clues.push(`第 ${week} 周，${votes} 票把我送出了大门。我是谁？`)
    else clues.push(`我是本季第 ${idx + 1} 个离开的房客。我是谁？`)
    if (e.isJury) clues.push('我走进了陪审团。')
    out.push({ answers: [name], clues })
  })

  // 2 人题：历史提名组合
  const nominations = sortByRound(pool && pool.nominations)
  nominations.forEach(n => {
    const names = uniqueNames((n && n.nomineeNames) || []).slice(0, 2)
    if (names.length !== 2) return
    const week = parseRound(n.roundId)
    const hoh = String((n && n.hohName) || '').trim()
    const prefix = week ? `第 ${week} 周` : '最近一轮'
    const clues = [`${prefix}${hoh ? `，HOH ${hoh}` : ''} 把我们两人一起送上了提名席。我们是谁？`]
    out.push({ answers: names, clues })
  })

  // 1 人题：最近一轮 HOH
  const hohs = sortByRound(pool && pool.hohs)
  const lastHoh = hohs[hohs.length - 1]
  if (lastHoh && lastHoh.winnerName) {
    out.push({ answers: [lastHoh.winnerName], clues: ['我是最近一轮的 HOH，掌握提名权。我是谁？'] })
  }

  // 1 人题：最近一轮否决权得主
  const vetos = sortByRound(pool && pool.vetos)
  const lastVeto = vetos[vetos.length - 1]
  if (lastVeto && lastVeto.winnerName) {
    out.push({ answers: [lastVeto.winnerName], clues: ['我赢下了最近一轮的否决权。我是谁？'] })
  }

  // 2 人题：当前贫民屋
  const haveNots = uniqueNames(
    guests
      .filter(g => g && g.role !== 'admin' && g.status === 'active' && g.isHaveNot)
      .map(g => g.name)
  )
  if (haveNots.length === 2) {
    out.push({ answers: haveNots, clues: ['我们本轮被罚住在贫民屋。我们是谁？'] })
  }

  const cleaned = []
  const seen = new Set()
  for (const q of out) {
    const answers = uniqueNames(q.answers || []).slice(0, 2)
    const clues = (q.clues || [])
      .map(s => String(s == null ? '' : s).trim())
      .filter(Boolean)
    if (!answers.length || !clues.length) continue
    const clueText = clues.join(' ')
    if (answers.some(a => clueText.includes(a))) continue
    const key = `${canonicalKey(answers)}|${clueText}`
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push({ answers, clues })
  }

  if (cleaned.length) return shuffle(cleaned)
  return SAMPLE_QUESTIONS.map(q => ({ answers: [...q.answers], clues: [...q.clues] }))
}

registerGame({
  id: 'otev',
  name: 'OTEV 抢座问答赛',
  icon: '🐐',
  description: '公共泥浆卡池，所有人同时翻牌抢牌；答案可能是 1 人或 2 人，必须找到精确匹配的牌子；提交后统一揭晓，答错或最后到达者淘汰；超时自动携带最近查看的牌',
  category: 'intellect',
  playerCount: { min: 2, max: 20 },
  duration: 1200,
  needsServerTick: true,
  serverTickMs: 250,
  broadcastState: true,
  privateActions: ['peek', 'unpeek'],
  silentActions: ['peek', 'unpeek'],

  async loadQuestions() {
    try {
      const [guests, evictions, nominations, hohs, vetos] = await Promise.all([
        BBHouseguest.find({ gameId: 'bigbrother' }),
        BBEviction.find({ gameId: 'bigbrother' }),
        BBNomination.find({ gameId: 'bigbrother' }),
        BBHohRecord.find({ gameId: 'bigbrother' }),
        BBVetoRecord.find({ gameId: 'bigbrother' })
      ])
      return { guests, evictions, nominations, hohs, vetos }
    } catch (e) {
      console.error('[OTEV] loadQuestions failed:', e)
      return null
    }
  },

  init(participants, pool, options = {}) {
    const customQuestions = normalizeCustomQuestions(options.questions)
    const questions = customQuestions.length ? customQuestions : buildAutoQuestions(pool)
    const opts = {
      riddleTime: clampInt(options.riddleTime, 3, 20, 5),
      searchTime: clampInt(options.searchTime, 15, 120, 35),
      revealStepTime: clampNum(options.revealStepTime, 0.6, 3, 1.2),
      resultTime: clampInt(options.resultTime, 2, 15, 4),
      cardCount: clampInt(options.cardCount, 0, 48, 0)
    }
    const theme = ['mud', 'foam', 'ruins'].includes(options.theme)
      ? options.theme
      : pickOne(['mud', 'foam', 'ruins'])
    const avatar = String(options.otveAvatar || '🐐')
    const audioUrl = String(options.audioUrl || '')

    const players = {}
    const order = []
    participants.forEach((p, i) => {
      order.push(p.playerId)
      players[p.playerId] = {
        playerId: p.playerId,
        playerName: p.playerName || p.playerId,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        alive: true,
        eliminatedRound: null,
        eliminationReason: null,
        heldCardId: null,
        peekCardId: null,
        peekUntil: 0,
        lastPeekAt: 0,
        lastSwapAt: 0,
        submitted: false,
        submittedAt: 0,
        submittedCardId: null,
        autoSubmitted: false,
        searchActions: 0,
        peekCount: 0,
        claimCount: 0,
        discardCount: 0,
        swapCount: 0,
        seenCardIds: []
      }
    })

    const guestNames = ((pool && pool.guests) || [])
      .filter(g => g && g.role !== 'admin')
      .map(g => g.name)
    const customNames = questions.flatMap(q => q.answers || [])
    const namePool = uniqueNames([
      ...participants.map(p => p.playerName),
      ...guestNames,
      ...customNames,
      ...FALLBACK_NAMES
    ])

    const scores = {}
    order.forEach(pid => { scores[pid] = 0 })

    return {
      status: 'ready',
      started: false,
      finished: false,
      phase: 'idle',
      round: 0,
      totalRounds: Math.max(1, participants.length - 1),
      opts,
      theme,
      otveAvatar: avatar,
      audioUrl,
      questions,
      namePool,
      players,
      order,
      scores,
      pool: [],
      answerNames: [],
      answerCount: 0,
      correctCardIds: [],
      currentClues: [],
      submissions: [],
      submissionsByPlayer: {},
      reveal: null,
      roundResult: null,
      history: [],
      winnerId: null,
      winners: [],
      _replayEvents: [],
      _lastTickAt: 0
    }
  },

  tick(state) {
    if (!state || state.status !== 'playing' || state.finished) return
    const now = Date.now()

    // 管理员暂停/恢复时，tick 会中断；这里补偿时间轴，避免暂停后直接跳阶段。
    if (state._lastTickAt && state.started && now - state._lastTickAt > 2000) {
      const gap = now - state._lastTickAt
      if (state.phaseEndsAt) state.phaseEndsAt += gap
      if (state.resultEndsAt) state.resultEndsAt += gap
      if (state.reveal && state.reveal.stepAt) state.reveal.stepAt += gap
      for (const p of Object.values(state.players)) {
        if (p.peekUntil) p.peekUntil += gap
      }
    }
    state._lastTickAt = now

    if (!state.started) {
      state.started = true
      this._startRound(state, 1, now)
      return
    }

    if (state.phase === 'riddle') {
      if (now < state.phaseEndsAt) return
      state.phase = 'search'
      state.phaseStartAt = now
      state.phaseEndsAt = now + state.opts.searchTime * 1000
      pushEvent(state, 'phase', '音乐响起，开始翻找！', { phase: 'search' })
      return
    }

    if (state.phase === 'search') {
      if (now < state.phaseEndsAt) return
      this._autoSubmitNonSubmitters(state, now)
      this._startReveal(state, now, 'timeout')
      return
    }

    if (state.phase === 'reveal') {
      if (!state.reveal || now < state.reveal.stepAt) return
      this._revealNext(state, now)
      return
    }

    if (state.phase === 'result') {
      if (now < state.resultEndsAt) return
      if (this._aliveIds(state).length <= 1) this._finish(state, now)
      else this._startRound(state, state.round + 1, now)
    }
  },

  handleAction(state, playerId, action) {
    const player = state.players[playerId]
    if (!player || !action || state.finished) return { updated: false }
    if (!player.alive) return { updated: false }
    if (state.phase !== 'search') return { updated: false }
    if (player.submitted) return { updated: false }

    const now = Date.now()

    if (action.type === 'peek') {
      if (player.heldCardId) return { updated: false }
      if (now < player.lastPeekAt + PEEK_COOLDOWN_MS) return { updated: false }
      const card = state.pool.find(c => c.id === action.cardId)
      if (!card || card.claimedBy || card.submittedBy) return { updated: false }
      player.peekCardId = card.id
      player.peekUntil = now + PEEK_MS
      player.lastPeekAt = now
      player.peekCount = (player.peekCount || 0) + 1
      player.searchActions = (player.searchActions || 0) + 1
      if (!player.seenCardIds.includes(card.id)) player.seenCardIds.push(card.id)
      return { updated: true, finished: false, result: { cardId: card.id } }
    }

    if (action.type === 'unpeek') {
      player.peekCardId = null
      player.peekUntil = 0
      return { updated: true }
    }

    if (action.type === 'claim') {
      if (player.heldCardId) return { updated: false }
      if (player.peekCardId !== action.cardId || now > player.peekUntil) return { updated: false }
      const card = state.pool.find(c => c.id === action.cardId)
      if (!card || card.claimedBy || card.submittedBy) return { updated: false }
      card.claimedBy = playerId
      card.heldBy = playerId
      player.heldCardId = card.id
      player.peekCardId = null
      player.peekUntil = 0
      player.claimCount = (player.claimCount || 0) + 1
      player.searchActions = (player.searchActions || 0) + 1
      return { updated: true, result: { cardId: card.id } }
    }

    if (action.type === 'discard') {
      if (!player.heldCardId) return { updated: false }
      const card = state.pool.find(c => c.id === player.heldCardId)
      if (card) {
        card.claimedBy = null
        card.heldBy = null
      }
      player.heldCardId = null
      player.discardCount = (player.discardCount || 0) + 1
      player.searchActions = (player.searchActions || 0) + 1
      return { updated: true }
    }

    if (action.type === 'swap') {
      if (now < player.lastSwapAt + SWAP_COOLDOWN_MS) return { updated: false }
      const cardA = state.pool.find(c => c.id === action.cardA)
      const cardB = state.pool.find(c => c.id === action.cardB)
      if (!cardA || !cardB || cardA.id === cardB.id) return { updated: false }
      if (cardA.claimedBy || cardA.submittedBy || cardB.claimedBy || cardB.submittedBy) {
        return { updated: false }
      }
      const i = state.pool.findIndex(c => c.id === cardA.id)
      const j = state.pool.findIndex(c => c.id === cardB.id)
      if (i < 0 || j < 0) return { updated: false }
      const tmp = state.pool[i]
      state.pool[i] = state.pool[j]
      state.pool[j] = tmp
      player.lastSwapAt = now
      player.swapCount = (player.swapCount || 0) + 1
      player.searchActions = (player.searchActions || 0) + 1
      return { updated: true, result: { positions: [i, j] } }
    }

    if (action.type === 'submit') {
      if (!player.heldCardId) return { updated: false }
      const card = state.pool.find(c => c.id === player.heldCardId)
      if (!card || card.submittedBy) return { updated: false }
      player.submitted = true
      player.submittedAt = now
      player.submittedCardId = card.id
      player.heldCardId = null
      player.peekCardId = null
      player.peekUntil = 0
      player.searchActions = (player.searchActions || 0) + 1
      card.submittedBy = playerId
      card.heldBy = playerId
      const submission = {
        playerId,
        playerName: player.playerName,
        cardId: card.id,
        submittedAt: now,
        auto: false
      }
      state.submissions.push(submission)
      state.submissionsByPlayer[playerId] = submission
      if (state.submissions.length >= this._aliveIds(state).length) {
        this._startReveal(state, now, 'all_submitted')
      }
      return { updated: true, result: { position: state.submissions.length } }
    }

    return { updated: false }
  },

  isFinished(state) {
    return state.finished === true
  },

  getWinners(state) {
    return state.finished && state.winnerId ? [state.winnerId] : []
  },

  computeWinner(state) {
    return state.winnerId || null
  },

  getState(state, playerId) {
    const now = Date.now()
    const my = state.players[playerId] || null
    const aliveCount = this._aliveIds(state).length
    const revealResult = state.phase === 'result' || state.phase === 'finished'

    let endsAt = 0
    if (state.phase === 'riddle' || state.phase === 'search') endsAt = state.phaseEndsAt || 0
    else if (state.phase === 'reveal') endsAt = state.reveal ? state.reveal.stepAt : 0
    else if (state.phase === 'result') endsAt = state.resultEndsAt || 0
    const secondsLeft = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0

    const peekValid = state.phase === 'search' && !!(my && my.peekCardId && my.peekUntil > now)
    const peekCardObj = peekValid
      ? state.pool.find(c => c.id === my.peekCardId && !c.claimedBy && !c.submittedBy)
      : null
    const heldCardObj = my && my.heldCardId
      ? state.pool.find(c => c.id === my.heldCardId)
      : null
    const submittedCardObj = my && my.submittedCardId
      ? state.pool.find(c => c.id === my.submittedCardId)
      : null

    const pool = state.pool.map((card, idx) => {
      const claimedPlayer = card.claimedBy ? state.players[card.claimedBy] : null
      const submittedPlayer = card.submittedBy ? state.players[card.submittedBy] : null
      const item = {
        id: card.id,
        position: idx,
        state: card.submittedBy ? 'submitted' : (card.claimedBy ? 'claimed' : 'hidden'),
        claimedByName: claimedPlayer ? claimedPlayer.playerName : '',
        submittedByName: submittedPlayer ? submittedPlayer.playerName : '',
        isMine: !!(my && (card.heldBy === playerId || card.submittedBy === playerId)),
        seen: !!(my && my.seenCardIds.includes(card.id))
      }
      if (revealResult && (card.correct || card.submittedBy)) {
        item.names = [...card.names]
        item.correct = !!card.correct
      }
      return item
    })

    const players = state.order.map(pid => {
      const p = state.players[pid]
      const pos = state.submissions.findIndex(s => s.playerId === pid)
      return {
        playerId: pid,
        playerName: p.playerName,
        color: p.color,
        alive: !!p.alive,
        held: !!p.heldCardId,
        submitted: !!p.submitted,
        autoSubmitted: !!p.autoSubmitted,
        submissionPosition: pos >= 0 ? pos + 1 : null,
        eliminatedRound: p.eliminatedRound,
        eliminationReason: p.eliminationReason
      }
    })

    const submissions = state.submissions.map((s, idx) => ({
      position: idx + 1,
      playerId: s.playerId,
      playerName: s.playerName,
      auto: !!s.auto
    }))

    const reveal = state.reveal
      ? {
          index: state.reveal.index,
          verdicts: state.reveal.verdicts.map(v => ({
            ...v,
            names: [...(v.names || [])]
          })),
          eliminatedId: state.reveal.eliminatedId || null,
          reason: state.reveal.reason || '',
          trigger: state.reveal.trigger || ''
        }
      : null

    const roundResult = state.roundResult
      ? {
          ...state.roundResult,
          answerNames: [...(state.roundResult.answerNames || [])],
          correctCardIds: [...(state.roundResult.correctCardIds || [])],
          submissions: (state.roundResult.submissions || []).map(s => ({
            ...s,
            names: [...(s.names || [])]
          })),
          verdicts: (state.roundResult.verdicts || []).map(v => ({
            ...v,
            names: [...(v.names || [])]
          }))
        }
      : null

    const myView = my ? {
      alive: !!my.alive,
      heldCard: heldCardObj ? { id: heldCardObj.id, names: [...heldCardObj.names] } : null,
      peekCard: peekCardObj ? { id: peekCardObj.id, names: [...peekCardObj.names] } : null,
      submittedCard: submittedCardObj ? { id: submittedCardObj.id, names: [...submittedCardObj.names] } : null,
      submitted: !!my.submitted,
      autoSubmitted: !!my.autoSubmitted,
      eliminated: !my.alive,
      eliminationReason: my.eliminationReason,
      canPeek: state.phase === 'search' && my.alive && !my.submitted && !my.heldCardId && now >= my.lastPeekAt + PEEK_COOLDOWN_MS,
      canClaim: state.phase === 'search' && my.alive && !my.submitted && !my.heldCardId && !!peekCardObj,
      canDiscard: state.phase === 'search' && my.alive && !my.submitted && !!my.heldCardId,
      canSubmit: state.phase === 'search' && my.alive && !my.submitted && !!my.heldCardId,
      canSwap: state.phase === 'search' && my.alive && !my.submitted && now >= my.lastSwapAt + SWAP_COOLDOWN_MS,
      peekSecondsLeft: peekCardObj ? Math.max(1, Math.ceil((my.peekUntil - now) / 1000)) : 0,
      swapCooldownSeconds: Math.max(0, Math.ceil((my.lastSwapAt + SWAP_COOLDOWN_MS - now) / 1000)),
      searchActions: my.searchActions || 0
    } : null

    return {
      gameType: 'otev',
      status: state.status,
      started: state.started,
      finished: state.finished,
      phase: state.phase,
      round: state.round,
      totalRounds: state.totalRounds,
      serverNow: now,
      phaseEndsAt: endsAt,
      secondsLeft,
      aliveCount,
      clues: [...(state.currentClues || [])],
      answerCount: state.answerCount || 0,
      answerNames: revealResult ? [...(state.answerNames || [])] : [],
      correctCardIds: revealResult ? [...(state.correctCardIds || [])] : [],
      pool,
      players,
      submissions,
      reveal,
      roundResult,
      my: myView,
      theme: state.theme,
      otveAvatar: state.otveAvatar,
      audioUrl: state.audioUrl,
      config: {
        riddleTime: state.opts.riddleTime,
        searchTime: state.opts.searchTime,
        revealStepTime: state.opts.revealStepTime,
        resultTime: state.opts.resultTime,
        correctCardCount: aliveCount,
        totalCards: state.pool.length
      },
      winnerId: state.winnerId || null,
      winnerName: state.winnerId && state.players[state.winnerId]
        ? state.players[state.winnerId].playerName
        : '',
      winners: (state.winners || []).map(pid => ({
        playerId: pid,
        playerName: state.players[pid] ? state.players[pid].playerName : pid
      }))
    }
  },

  getAllStates(state) {
    const out = {}
    for (const pid of state.order) {
      const p = state.players[pid]
      let label = '搜索中'
      if (state.finished && state.winnerId === pid) label = '获胜'
      else if (!p.alive) label = `第 ${p.eliminatedRound || '?'} 轮淘汰`
      else if (p.submitted) label = '已提交'
      else if (p.heldCardId) label = '手中有牌'
      else if (p.peekCardId) label = '查看中'
      out[pid] = {
        score: state.scores[pid] || 0,
        progress: p.alive ? 1 : 0,
        alive: p.alive,
        max: 1,
        done: !p.alive || state.finished === true,
        label,
        alive: !!p.alive
      }
    }
    return out
  },

  checkTarget() {
    return false
  },

  describeEvent(state, playerId, action, result) {
    if (!action) return null
    if (action.type === 'claim') return { text: '拿走了一张牌' }
    if (action.type === 'discard') return { text: '把一张牌丢回泥里' }
    if (action.type === 'swap') {
      const positions = result && Array.isArray(result.positions) ? result.positions : []
      return {
        text: positions.length === 2
          ? `交换了第 ${positions[0] + 1} 张和第 ${positions[1] + 1} 张牌的位置`
          : '交换了两张牌的位置',
        data: { positions }
      }
    }
    if (action.type === 'submit') {
      const position = result && result.position ? result.position : null
      return { text: position ? `提交了答案（第 ${position} 位）` : '提交了答案' }
    }
    return null
  },

  takeReplayEvents(state) {
    const events = state._replayEvents || []
    state._replayEvents = []
    return events
  },

  getReplayMeta(state) {
    const history = state.history || []
    const winnerName = state.winnerId && state.players[state.winnerId]
      ? state.players[state.winnerId].playerName
      : ''
    const players = state.order.map(pid => {
      const p = state.players[pid]
      let status = '完成'
      if (state.finished && state.winnerId === pid) status = '获胜'
      else if (!p.alive) status = `第 ${p.eliminatedRound || '?'} 轮淘汰`
      const details = [
        { label: '查看', value: p.peekCount || 0 },
        { label: '拿牌', value: p.claimCount || 0 },
        { label: '丢回', value: p.discardCount || 0 },
        { label: '交换', value: p.swapCount || 0 }
      ]
      if (!p.alive) {
        details.push({ label: '淘汰原因', value: reasonText(p.eliminationReason) })
      }
      return {
        playerId: pid,
        playerName: p.playerName,
        score: state.scores[pid] || 0,
        status,
        details
      }
    }).sort((a, b) => (b.score || 0) - (a.score || 0))

    const rows = history.map(h => {
      const submissionText = (h.submissions || []).map(s => {
        const mark = s.correct ? '✓' : '✗'
        const autoText = s.auto ? '（自动）' : ''
        return `${s.playerName}「${(s.names || []).join(' + ')}」${mark}${autoText}`
      }).join(' → ')
      return [
        h.round,
        (h.clues || []).join(' / '),
        (h.answerNames || []).join(' + '),
        submissionText || '—',
        h.eliminated
          ? `${h.eliminated.playerName}（${reasonText(h.reason)}）`
          : '—'
      ]
    })

    return {
      type: 'otev',
      title: 'OTEV 抢座问答赛',
      description: '公共牌池、多人同时查看、最快拿走；按提交顺序揭晓，答错或最后到达者淘汰。',
      summary: [
        { label: '轮数', value: history.length },
        { label: '胜者', value: winnerName || '—' },
        { label: '题目数', value: (state.questions || []).length },
        { label: '总牌数', value: state.pool.length }
      ],
      players,
      tables: [
        {
          title: '逐轮记录',
          columns: ['轮次', '谜语', '正确答案', '提交顺序与判定', '淘汰'],
          rows
        }
      ],
      history,
      winnerId: state.winnerId || null,
      winners: (state.winners || []).map(pid => ({
        playerId: pid,
        playerName: state.players[pid] ? state.players[pid].playerName : pid
      }))
    }
  },

  getReplaySnapshot(state) {
    const aliveCount = this._aliveIds(state).length
    const phaseText = ({
      riddle: 'OTEV 唱歌',
      search: '公共翻找',
      reveal: '逐个揭晓',
      result: '本轮结算',
      finished: '已结束'
    })[state.phase] || '准备中'

    const players = {}
    for (const pid of state.order) {
      const p = state.players[pid]
      const pos = state.submissions.findIndex(s => s.playerId === pid)
      const held = p.heldCardId ? state.pool.find(c => c.id === p.heldCardId) : null
      const submittedCard = p.submittedCardId ? state.pool.find(c => c.id === p.submittedCardId) : null
      const peek = p.peekCardId && p.peekUntil > Date.now()
        ? state.pool.find(c => c.id === p.peekCardId && !c.claimedBy && !c.submittedBy)
        : null
      const status = !p.alive
        ? `第 ${p.eliminatedRound || '?'} 轮淘汰`
        : p.submitted
          ? (p.autoSubmitted ? '自动提交' : '已提交')
          : p.heldCardId
            ? '手中有牌'
            : (p.peekCardId && p.peekUntil > Date.now())
              ? '查看中'
              : '搜索中'
      players[pid] = {
        状态: status,
        手中牌: held ? held.names.join(' + ') : '—',
        提交牌: submittedCard ? submittedCard.names.join(' + ') : '—',
        正在查看: peek ? peek.names.join(' + ') : '—',
        提交顺序: pos >= 0 ? pos + 1 : '—',
        查看次数: p.peekCount || 0,
        拿牌次数: p.claimCount || 0,
        交换次数: p.swapCount || 0,
        淘汰: p.eliminationReason ? reasonText(p.eliminationReason) : '—'
      }
    }

    return {
      type: 'otev',
      summary: {
        轮次: `${state.round}/${state.totalRounds}`,
        阶段: phaseText,
        答案人数: state.answerCount,
        谜语: (state.currentClues || []).join(' / '),
        正确答案: (state.answerNames || []).join(' + '),
        正确牌: `${(state.correctCardIds || []).length} 张`,
        剩余可翻: state.pool.filter(c => !c.claimedBy && !c.submittedBy).length,
        已提交: `${state.submissions.length}/${aliveCount}`,
        存活: aliveCount
      },
      players
    }
  },

  _aliveIds(state) {
    return state.order.filter(pid => state.players[pid] && state.players[pid].alive)
  },

  _startRound(state, n, now) {
    const alive = this._aliveIds(state)
    if (alive.length <= 1) {
      this._finish(state, now)
      return
    }
    const q = state.questions[(n - 1) % state.questions.length]
    state.round = n
    state.answerNames = uniqueNames(q.answers || []).slice(0, 2)
    state.answerCount = state.answerNames.length
    state.currentClues = [...(q.clues || [])]
    state.submissions = []
    state.submissionsByPlayer = {}
    state.reveal = null
    state.roundResult = null

    for (const pid of state.order) {
      const p = state.players[pid]
      p.heldCardId = null
      p.peekCardId = null
      p.peekUntil = 0
      p.lastPeekAt = 0
      p.lastSwapAt = 0
      p.submitted = false
      p.submittedAt = 0
      p.submittedCardId = null
      p.autoSubmitted = false
      p.searchActions = 0
      p.seenCardIds = []
    }

    const poolInfo = this._buildPool(state, state.answerNames, alive.length)
    state.pool = poolInfo.cards
    state.correctCardIds = poolInfo.correctCardIds
    state.phase = 'riddle'
    state.phaseStartAt = now
    state.phaseEndsAt = now + state.opts.riddleTime * 1000

    pushEvent(
      state,
      'round',
      `第 ${n} 轮：${state.currentClues.join(' ')}`,
      { round: n, clues: [...state.currentClues], answerCount: state.answerCount, alive: alive.length }
    )
  },

  _buildPool(state, answerNames, aliveCount) {
    const answerKey = canonicalKey(answerNames)
    const answerSet = new Set(answerNames)
    const otherNames = state.namePool.filter(n => !answerSet.has(n))
    const baseTotal = aliveCount + Math.max(8, Math.min(30, aliveCount + 6))
    let total = state.opts.cardCount > 0 ? state.opts.cardCount : baseTotal
    total = Math.max(12, Math.min(48, total))
    total = Math.max(aliveCount + 6, total)

    const cards = []
    let seq = 1
    const addCard = (names, correct) => {
      cards.push({
        id: `oc-${seq++}`,
        names: [...names],
        correct: !!correct
      })
    }

    // 每人一张正确牌，保证“前 N-1 人正确、最后提交者淘汰”可以发生。
    for (let i = 0; i < aliveCount; i++) addCard(answerNames, true)

    const usedKeys = new Set([answerKey])
    let guard = 0
    while (cards.length < total && guard++ < 2000) {
      const names = this._makeDecoyNames(answerNames, otherNames)
      if (!names.length) break
      const key = canonicalKey(names)
      if (usedKeys.has(key)) continue
      usedKeys.add(key)
      addCard(names, false)
    }

    // 极端情况下兜底补牌（允许重复干扰牌，但绝不重复正确牌内容）
    guard = 0
    while (cards.length < total && guard++ < 500) {
      const names = this._makeDecoyNames(answerNames, otherNames)
      if (!names.length) break
      const key = canonicalKey(names)
      if (key === answerKey) continue
      addCard(names, false)
    }

    shuffleInPlace(cards)
    return {
      cards,
      correctCardIds: cards.filter(c => c.correct).map(c => c.id)
    }
  },

  _makeDecoyNames(answerNames, otherNames) {
    const pickOther = () => pickOne(otherNames)
    const r = Math.random()
    if (answerNames.length === 1) {
      const a = answerNames[0]
      if (r < 0.45) {
        const o = pickOther()
        return o ? [a, o] : [a]
      }
      if (r < 0.8) {
        const o = pickOther()
        return o ? [o] : [a]
      }
      const o1 = pickOther()
      const o2 = pickOther()
      if (o1 && o2 && o1 !== o2) return [o1, o2]
      return [a]
    }

    const a = answerNames[0]
    const b = answerNames[1]
    if (r < 0.3) {
      const o = pickOther()
      return o ? [a, o] : [a]
    }
    if (r < 0.6) {
      const o = pickOther()
      return o ? [b, o] : [b]
    }
    if (r < 0.75) {
      return [Math.random() < 0.5 ? a : b]
    }
    const o1 = pickOther()
    const o2 = pickOther()
    if (o1 && o2 && o1 !== o2) return [o1, o2]
    return [a]
  },

  _autoSubmitNonSubmitters(state, now) {
    const non = this._aliveIds(state).filter(pid => !state.players[pid].submitted)
    if (!non.length) return

    // 最近还在查看的玩家排在前面；从未查看过的玩家随机排在最后。
    const active = non
      .filter(pid => state.players[pid].lastPeekAt)
      .sort((a, b) => state.players[b].lastPeekAt - state.players[a].lastPeekAt)
    const idle = shuffle(non.filter(pid => !state.players[pid].lastPeekAt))
    const ordered = [...active, ...idle]

    let order = 0
    for (const pid of ordered) {
      const p = state.players[pid]
      let card = null

      if (p.heldCardId) {
        card = state.pool.find(c => c.id === p.heldCardId && !c.submittedBy)
      }
      if (!card && p.peekCardId) {
        card = state.pool.find(c => c.id === p.peekCardId && !c.claimedBy && !c.submittedBy)
      }
      if (!card) {
        const available = state.pool.filter(c => !c.claimedBy && !c.submittedBy)
        card = available.length ? available[Math.floor(Math.random() * available.length)] : null
      }
      if (!card || card.submittedBy) continue
      if (card.claimedBy && card.claimedBy !== pid) continue

      if (!p.heldCardId) {
        card.claimedBy = pid
        card.heldBy = pid
        p.heldCardId = card.id
        p.claimCount = (p.claimCount || 0) + 1
      }

      p.submitted = true
      p.submittedAt = now + order
      p.submittedCardId = card.id
      p.heldCardId = null
      p.peekCardId = null
      p.peekUntil = 0
      p.autoSubmitted = true
      p.searchActions = (p.searchActions || 0) + 1
      card.submittedBy = pid
      card.heldBy = pid

      const submission = {
        playerId: pid,
        playerName: p.playerName,
        cardId: card.id,
        submittedAt: now + order,
        auto: true
      }
      state.submissions.push(submission)
      state.submissionsByPlayer[pid] = submission
      order++
    }
  },

  _startReveal(state, now, trigger) {
    if (state.phase === 'reveal' || state.phase === 'result' || state.finished) return
    state.phase = 'reveal'
    state.phaseStartAt = now
    state.reveal = {
      index: 0,
      stepAt: now + state.opts.revealStepTime * 1000,
      verdicts: [],
      eliminatedId: null,
      reason: null,
      trigger: trigger || ''
    }

    if (!state.submissions.length) {
      const alive = this._aliveIds(state)
      const target = alive[Math.floor(Math.random() * alive.length)]
      if (target) this._setRoundResult(state, target, 'timeout', now)
      return
    }

    pushEvent(state, 'phase', '音乐停止，开始揭晓！', { phase: 'reveal', trigger })
  },

  _revealNext(state, now) {
    const reveal = state.reveal
    if (!reveal) return

    if (reveal.index >= state.submissions.length) {
      if (!reveal.eliminatedId) {
        const alive = this._aliveIds(state)
        const target = alive[alive.length - 1]
        if (target) this._setRoundResult(state, target, 'timeout', now)
      }
      return
    }

    const submission = state.submissions[reveal.index]
    const card = state.pool.find(c => c.id === submission.cardId)
    const correct = !!(card && card.correct)
    const verdict = {
      position: reveal.index + 1,
      playerId: submission.playerId,
      playerName: submission.playerName,
      cardId: submission.cardId,
      names: card ? [...card.names] : [],
      correct,
      auto: !!submission.auto
    }
    reveal.verdicts.push(verdict)

    pushEvent(
      state,
      'reveal',
      `${submission.playerName} ${submission.auto ? '超时自动携带' : '提交'}「${verdict.names.join(' + ')}」：${correct ? '正确' : '错误'}`,
      { ...verdict, names: [...verdict.names] }
    )

    if (!correct) {
      this._setRoundResult(state, submission.playerId, 'wrong', now)
      return
    }

    if (reveal.index === state.submissions.length - 1) {
      if (state.submissions.length >= this._aliveIds(state).length) {
        this._setRoundResult(state, submission.playerId, 'last', now)
      } else {
        const non = this._aliveIds(state).filter(pid => !state.players[pid].submitted)
        const target = non.length ? non[non.length - 1] : submission.playerId
        this._setRoundResult(state, target, non.length ? 'timeout' : 'last', now)
      }
      return
    }

    reveal.index += 1
    reveal.stepAt = now + state.opts.revealStepTime * 1000
  },

  _setRoundResult(state, eliminatedId, reason, now) {
    const p = state.players[eliminatedId]
    if (!p) return
    p.alive = false
    p.eliminatedRound = state.round
    p.eliminationReason = reason
    state.scores[eliminatedId] = Math.max(0, state.round - 1)

    if (state.reveal) {
      state.reveal.eliminatedId = eliminatedId
      state.reveal.reason = reason
    }

    const submissions = state.submissions.map((s, idx) => {
      const card = state.pool.find(c => c.id === s.cardId)
      return {
        position: idx + 1,
        playerId: s.playerId,
        playerName: s.playerName,
        cardId: s.cardId,
        names: card ? [...card.names] : [],
        correct: !!(card && card.correct),
        auto: !!s.auto
      }
    })

    const result = {
      round: state.round,
      clues: [...state.currentClues],
      answerNames: [...state.answerNames],
      answerCount: state.answerCount,
      correctCardIds: [...state.correctCardIds],
      submissions,
      verdicts: state.reveal ? state.reveal.verdicts.map(v => ({ ...v, names: [...(v.names || [])] })) : [],
      eliminated: { playerId: p.playerId, playerName: p.playerName },
      reason,
      trigger: state.reveal ? state.reveal.trigger : ''
    }
    state.roundResult = result
    state.history.push(result)
    state.phase = 'result'
    state.resultEndsAt = now + state.opts.resultTime * 1000

    let text
    if (reason === 'wrong') {
      const wrong = (state.reveal ? state.reveal.verdicts : []).find(v => v.playerId === eliminatedId && !v.correct)
      text = `第 ${state.round} 轮：${p.playerName} 提交「${wrong ? wrong.names.join(' + ') : '—'}」错误，被淘汰`
    } else if (reason === 'last') {
      text = `第 ${state.round} 轮：所有提交正确，最后提交的 ${p.playerName} 被淘汰`
    } else {
      text = `第 ${state.round} 轮：${p.playerName} ${reasonText(reason)}，被淘汰`
    }

    pushEvent(state, 'eliminate', text, {
      round: state.round,
      eliminated: { playerId: p.playerId, playerName: p.playerName },
      reason,
      answerNames: [...state.answerNames]
    })
  },

  _finish(state, now) {
    if (state.finished) return
    const alive = this._aliveIds(state)
    const winner = alive[0] || null
    state.finished = true
    state.phase = 'finished'
    state.winnerId = winner
    state.winners = winner ? [winner] : []
    if (winner) state.scores[winner] = state.round

    pushEvent(
      state,
      'finish',
      winner ? `游戏结束，胜者：${state.players[winner].playerName}` : '游戏结束，无胜者',
      { winnerId: winner, winnerName: winner ? state.players[winner].playerName : '' }
    )
  }
})
