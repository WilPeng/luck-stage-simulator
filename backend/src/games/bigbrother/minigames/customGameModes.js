/**
 * 自定义游戏 - 对战模式引擎
 * 支持 5 种赛制：
 *  elim-last   模式1：同时作答，最后作答出局 / 第一个答错出局，直到剩 1 人
 *  first-pick  模式2：只检查第一个作答，答对任选一人出局，答错自己出局
 *  duel        模式3：候选池随机/指定 2 人 1v1，只检查第一个作答，胜者回池，直至剩 2 人决赛
 *  survive-tb  模式4：限时可切换答案，锁定后错误/未作答出局，基本题结束进入数字加时题
 *  score-tb    模式5：限时可切换答案，正确积 1 分，基本题结束后唯一最高分获胜，否则数字加时题
 */

const MODE_TYPES = ['elim-last', 'first-pick', 'duel', 'survive-tb', 'score-tb']

function normalize(v) {
  return String(v == null ? '' : v).trim().toLowerCase()
}

function gradeQuestion(q, answer) {
  if (!q) return false
  if (q.qtype === 'number') {
    const a = Number(answer)
    const c = Number(q.correctAnswer)
    return !Number.isNaN(a) && !Number.isNaN(c) && a === c
  }
  if (q.correctAnswer === '' || q.correctAnswer == null) return false
  return normalize(answer) === normalize(q.correctAnswer)
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function createModeHandler(gameDef) {
  const mode = gameDef.type
  const allQuestions = (gameDef.questions || []).filter(q => q.text || q.correctAnswer !== '')
  const basicQuestions = allQuestions.filter(q => !q.tb)
  const tbQuestion = allQuestions.find(q => q.tb) || null
  const basicLimitMs = (gameDef.basicTimeLimit || 30) * 1000
  const tbLimitMs = (gameDef.tiebreakTimeLimit || 30) * 1000
  const REVEAL_MS = 3000

  function publicQuestion(q) {
    if (!q) return null
    return {
      id: q.id,
      text: q.text,
      qtype: q.qtype || 'text',
      options: q.qtype === 'choice' ? q.options : (q.qtype === 'judge' ? (q.options.length ? q.options : ['对', '错']) : []),
      points: q.points || 1
    }
  }

  function init(participants) {
    const ps = {}
    participants.forEach(p => {
      ps[p.playerId] = {
        playerId: p.playerId,
        playerName: p.playerName,
        alive: true,
        eliminated: false,
        score: 0,
        answer: null,
        answered: false,
        correct: null,
        submittedAt: 0,
        locked: false,
        inTiebreak: false
      }
    })
    const state = {
      mode,
      status: 'ready',
      phase: 'idle',
      qIndex: 0,
      tiebreak: false,
      target: null,
      deadline: 0,
      nextAt: 0,
      order: [],
      roundResult: null,
      current: null,
      firstId: null,
      pickerId: null,
      finished: false,
      winner: null,
      started: false,
      _replayEvents: [],
      ps
    }
    return state
  }

  function nameOf(state, id) {
    const p = state.ps[id]
    return p ? p.playerName : (id || '')
  }

  function pushEvent(state, type, text, data) {
    if (!state._replayEvents) state._replayEvents = []
    state._replayEvents.push({ type, text, data: data || null })
  }

  function aliveList(state) {
    return Object.values(state.ps).filter(p => p.alive)
  }

  function resetRoundAnswers(state) {
    Object.values(state.ps).forEach(p => {
      p.answer = null
      p.answered = false
      p.correct = null
      p.submittedAt = 0
      p.locked = false
    })
    state.order = []
    state.roundResult = null
    state.firstId = null
  }

  function finishWith(state, winnerId) {
    state.finished = true
    state.phase = 'finished'
    state.winner = winnerId || null
    pushEvent(state, 'finish', winnerId ? `${nameOf(state, winnerId)} 获胜` : '游戏结束（无胜者）', { winnerId })
    return true
  }

  function beginQuestion(state, q) {
    resetRoundAnswers(state)
    state._q = q
    state.question = publicQuestion(q)
    state.phase = 'answering'
    state.deadline = Date.now() + (state.tiebreak ? tbLimitMs : basicLimitMs)
    state.nextAt = 0
  }

  // ===================== 模式1 / 模式2 / 模式3 =====================
  function resolveElimLast(state) {
    const alive = aliveList(state)
    let elim = null
    if (gameDef.eliminateRule === 'first_wrong') {
      for (const pid of state.order) {
        const p = state.ps[pid]
        if (p && p.alive && p.correct === false) { elim = pid; break }
      }
    } else {
      let worst = -1
      for (const p of alive) {
        const t = p.answered ? p.submittedAt : Number.POSITIVE_INFINITY
        if (t >= worst) { worst = t; elim = p.playerId }
      }
    }
    if (elim && state.ps[elim]) {
      state.ps[elim].alive = false
      state.ps[elim].eliminated = true
    }
    if (elim) pushEvent(state, 'eliminate', `${nameOf(state, elim)} 出局`, { eliminatedId: elim, qIndex: state.qIndex })
    state.roundResult = { eliminatedId: elim }
    state.phase = 'reveal'
    state.nextAt = Date.now() + REVEAL_MS
  }

  function nextEliminationQuestion(state) {
    const alive = aliveList(state)
    if (alive.length <= 1) return finishWith(state, alive[0] ? alive[0].playerId : null)
    state.qIndex++
    if (state.qIndex >= allQuestions.length) return finishWith(state, alive[0].playerId)
    beginQuestion(state, allQuestions[state.qIndex])
    return false
  }

  function advanceElimLast(state) {
    const alive = aliveList(state)
    if (alive.length <= 1) return finishWith(state, alive[0] ? alive[0].playerId : null)
    return nextEliminationQuestion(state)
  }

  function resolveFirstPick(state, correct) {
    if (correct) {
      state.phase = 'picking'
      state.pickerId = state.firstId
      pushEvent(state, 'phase', `${nameOf(state, state.firstId)} 首个作答正确，可选择一人出局`, { pickerId: state.firstId })
    } else {
      const p = state.ps[state.firstId]
      if (p) { p.alive = false; p.eliminated = true }
      pushEvent(state, 'eliminate', `${nameOf(state, state.firstId)} 首个作答错误，自己出局`, { eliminatedId: state.firstId })
      state.roundResult = { eliminatedId: state.firstId, selfEliminated: true }
      state.phase = 'reveal'
      state.nextAt = Date.now() + REVEAL_MS
    }
  }

  function advanceFirstPick(state) {
    const alive = aliveList(state)
    if (alive.length <= 1) return finishWith(state, alive[0] ? alive[0].playerId : null)
    state.qIndex++
    if (state.qIndex >= allQuestions.length) return finishWith(state, alive[0].playerId)
    state.pickerId = null
    beginQuestion(state, allQuestions[state.qIndex])
    return false
  }

  function pickDuelPair(state, ids) {
    let pair = ids && ids.length === 2 ? ids : null
    if (!pair) {
      const pool = aliveList(state).map(p => p.playerId)
      pair = shuffle(pool).slice(0, 2)
    }
    state.current = pair
    if (pair && pair.length === 2) {
      pushEvent(state, 'pair', `${nameOf(state, pair[0])} vs ${nameOf(state, pair[1])}`, { pair })
    }
    state.qIndex++
    if (state.qIndex >= allQuestions.length) state.qIndex = 0
    state.pickerId = null
    state.firstId = null
    resetRoundAnswers(state)
    state._q = allQuestions[state.qIndex]
    state.question = publicQuestion(allQuestions[state.qIndex])
    state.phase = 'answering'
    state.deadline = 0
    state.nextAt = 0
  }

  function advanceDuel(state) {
    const alive = aliveList(state)
    if (alive.length <= 1) return finishWith(state, alive[0] ? alive[0].playerId : null)
    if (alive.length === 2) {
      pickDuelPair(state, alive.map(p => p.playerId))
      return false
    }
    state.current = null
    state.phase = 'pairing'
    state.nextAt = Date.now() + REVEAL_MS
    return false
  }

  // ===================== 模式4 / 模式5 =====================
  function setupTiebreak(state) {
    const alive = aliveList(state)
    if (mode === 'score-tb') {
      const max = alive.length ? Math.max(...alive.map(p => p.score)) : 0
      const top = alive.filter(p => p.score === max)
      if (top.length === 1) return finishWith(state, top[0].playerId)
      state.tbCandidates = top.map(p => p.playerId)
    }
    if (!tbQuestion) {
      if (mode === 'score-tb') {
        const cands = state.tbCandidates || []
        return finishWith(state, cands.length ? cands[0] : (alive[0] ? alive[0].playerId : null))
      }
      return finishWith(state, alive[0] ? alive[0].playerId : null)
    }
    state.tiebreak = true
    state.target = Number(tbQuestion.correctAnswer)
    state._q = tbQuestion
    state.question = publicQuestion(tbQuestion)
    const candidates = mode === 'score-tb' ? state.tbCandidates : alive.map(p => p.playerId)
    Object.values(state.ps).forEach(p => { p.inTiebreak = candidates.includes(p.playerId) })
    resetRoundAnswers(state)
    state.phase = 'answering'
    state.deadline = Date.now() + tbLimitMs
    state.nextAt = 0
    pushEvent(state, 'tiebreak', `基本题结束，进入数字加时题（目标 ${state.target}）`, { target: state.target, candidates })
    return false
  }

  function lockRound(state) {
    if (state.phase !== 'answering') return false
    const now = Date.now()

    if (state.tiebreak) {
      const candidates = Object.values(state.ps).filter(p => p.inTiebreak)
      let best = null
      let bestVal = null
      for (const p of candidates) {
        const a = Number(p.answer)
        if (p.answered && !Number.isNaN(a) && a <= state.target) {
          if (bestVal === null || a > bestVal) { bestVal = a; best = p.playerId }
        }
      }
      if (!best) {
        let minVal = null
        for (const p of candidates) {
          const a = Number(p.answer)
          if (p.answered && !Number.isNaN(a)) {
            if (minVal === null || a < minVal) { minVal = a; best = p.playerId }
          }
        }
      }
      if (!best && candidates.length) best = candidates[0].playerId
      for (const p of candidates) {
        pushEvent(state, 'answer', `${p.playerName} 加时作答：${p.answered ? p.answer : '未作答'}`, { playerId: p.playerId, answer: p.answer, tiebreak: true })
      }
      pushEvent(state, 'tiebreak', `数字加时题目标 ${state.target}，${nameOf(state, best)} 最接近且不超过，获胜`, { winnerId: best, target: state.target })
      state.roundResult = { tiebreak: true, winnerId: best, target: state.target, lockedAt: now }
      return finishWith(state, best)
    }

    const alive = aliveList(state)
    let anyCorrect = false
    for (const p of alive) {
      const correct = p.answered && gradeQuestion(state._q, p.answer)
      p.correct = correct
      p.locked = true
      if (correct) {
        anyCorrect = true
        if (mode === 'score-tb') p.score++
      }
    }
    for (const p of alive) {
      pushEvent(state, 'answer', `${p.playerName} ${p.correct ? '答对' : (p.answered ? '答错' : '未作答')}${p.answered ? '：' + p.answer : ''}`, { playerId: p.playerId, correct: !!p.correct, answer: p.answer })
    }
    if (mode === 'survive-tb' && anyCorrect) {
      for (const p of alive) {
        if (!p.correct) {
          p.alive = false
          p.eliminated = true
          pushEvent(state, 'eliminate', `${p.playerName} 出局`, { playerId: p.playerId })
        }
      }
    }
    state.roundResult = {
      locked: true,
      anyCorrect,
      results: alive.map(p => ({ playerId: p.playerId, correct: !!p.correct, answer: p.answer }))
    }
    state.phase = 'reveal'
    state.nextAt = now + REVEAL_MS
    return false
  }

  function advanceLimit(state) {
    const alive = aliveList(state)
    if (mode === 'survive-tb' && alive.length <= 1) return finishWith(state, alive[0] ? alive[0].playerId : null)
    state.qIndex++
    if (state.qIndex >= basicQuestions.length) return setupTiebreak(state)
    beginQuestion(state, basicQuestions[state.qIndex])
    return false
  }

  function tick(state) {
    const now = Date.now()
    if (state.finished) return false

    if (mode === 'elim-last' || mode === 'first-pick') {
      if (state.phase === 'answering') {
        const alive = aliveList(state)
        if (alive.length && alive.every(p => p.answered)) {
          if (mode === 'elim-last') resolveElimLast(state)
          else resolveFirstPick(state, state.ps[state.firstId] ? state.ps[state.firstId].correct : false)
        }
      } else if (state.phase === 'reveal' && state.nextAt && now >= state.nextAt) {
        return mode === 'elim-last' ? advanceElimLast(state) : advanceFirstPick(state)
      }
      return false
    }

    if (mode === 'duel') {
      if (state.phase === 'answering' && state.firstId) {
        const p = state.ps[state.firstId]
        const correct = p ? p.correct : false
        const other = state.current ? state.current.find(id => id !== state.firstId) : null
        const loser = correct ? other : state.firstId
        if (loser && state.ps[loser]) { state.ps[loser].alive = false; state.ps[loser].eliminated = true }
        pushEvent(state, 'duel', `${nameOf(state, state.firstId)} ${correct ? '答对' : '答错'}，${nameOf(state, loser)} 出局`, { winnerId: correct ? state.firstId : other, eliminatedId: loser })
        state.roundResult = { winnerId: correct ? state.firstId : other, eliminatedId: loser }
        state.phase = 'reveal'
        state.nextAt = now + REVEAL_MS
      } else if (state.phase === 'reveal' && state.nextAt && now >= state.nextAt) {
        return advanceDuel(state)
      } else if (state.phase === 'pairing' && state.nextAt && now >= state.nextAt) {
        pickDuelPair(state, null)
      }
      return false
    }

    if (mode === 'survive-tb' || mode === 'score-tb') {
      if (state.phase === 'answering' && state.deadline && now >= state.deadline) {
        return lockRound(state)
      }
      if (state.phase === 'reveal' && state.nextAt && now >= state.nextAt) {
        return advanceLimit(state)
      }
    }
    return false
  }

  function handleAction(state, playerId, action, opts) {
    const isAdmin = !!(opts && opts.isAdmin)
    if (!action) return { updated: false }
    const p = state.ps[playerId]

    if (action.type === 'start' && !state.started) {
      state.started = true
      state.status = 'playing'
      if (mode === 'elim-last' || mode === 'first-pick') {
        state.qIndex = 0
        beginQuestion(state, allQuestions[0])
      } else if (mode === 'duel') {
        state.phase = 'pairing'
        state.nextAt = Date.now() + 1500
        state.qIndex = -1
      } else {
        state.qIndex = 0
        if (!basicQuestions.length) return { updated: true, finished: setupTiebreak(state) }
        beginQuestion(state, basicQuestions[0])
      }
      return { updated: true, finished: state.finished }
    }

    if (state.finished) return { updated: false }

    // ---- 管理员推进 ----
    if (isAdmin) {
      if (action.type === 'next') {
        if (mode === 'elim-last') return { updated: true, finished: advanceElimLast(state) }
        if (mode === 'first-pick') return { updated: true, finished: advanceFirstPick(state) }
        if (mode === 'duel') {
          if (state.phase === 'pairing') { pickDuelPair(state, null); return { updated: true } }
          if (state.phase === 'reveal') return { updated: true, finished: advanceDuel(state) }
          return { updated: true }
        }
        if (state.phase === 'reveal') return { updated: true, finished: advanceLimit(state) }
        if (state.phase === 'answering') return { updated: true, finished: lockRound(state) }
        return { updated: true }
      }
      if (action.type === 'lock') {
        return { updated: true, finished: lockRound(state) }
      }
      if (mode === 'duel' && action.type === 'pick_pair') {
        if (state.phase === 'pairing' || state.phase === 'idle') {
          const ids = action.playerIds || action.ids
          pickDuelPair(state, ids)
          return { updated: true }
        }
        return { updated: true }
      }
      return { updated: false }
    }

    if (!p) return { updated: false }

    // ---- 选手作答 ----
    if (action.type === 'answer' || action.type === 'set_answer') {
      if (mode === 'elim-last') {
        if (state.phase !== 'answering' || !p.alive || p.answered) return { updated: false }
        p.answer = action.answer
        p.correct = gradeQuestion(state._q, action.answer)
        p.answered = true
        p.submittedAt = Date.now()
        state.order.push(playerId)
        if (aliveList(state).every(x => x.answered)) resolveElimLast(state)
        return { updated: true, finished: state.finished }
      }
      if (mode === 'first-pick') {
        if (state.phase !== 'answering' || !p.alive || state.firstId) return { updated: false }
        state.firstId = playerId
        p.answer = action.answer
        p.correct = gradeQuestion(state._q, action.answer)
        p.answered = true
        p.submittedAt = Date.now()
        state.order.push(playerId)
        resolveFirstPick(state, p.correct)
        return { updated: true, finished: state.finished }
      }
      if (mode === 'duel') {
        if (state.phase !== 'answering' || !p.alive || state.firstId) return { updated: false }
        if (!state.current || !state.current.includes(playerId)) return { updated: false }
        state.firstId = playerId
        p.answer = action.answer
        p.correct = gradeQuestion(state._q, action.answer)
        p.answered = true
        p.submittedAt = Date.now()
        return { updated: true, finished: false }
      }
      if (mode === 'survive-tb' || mode === 'score-tb') {
        if (state.phase !== 'answering') return { updated: false }
        if (!p.alive) return { updated: false }
        if (state.tiebreak && !p.inTiebreak) return { updated: false }
        if (Date.now() >= state.deadline) return { updated: false }
        p.answer = action.answer
        p.answered = true
        return { updated: true, finished: false }
      }
    }

    if (mode === 'first-pick' && action.type === 'pick') {
      if (state.phase !== 'picking' || playerId !== state.pickerId) return { updated: false }
      const target = state.ps[action.targetId]
      if (!target || !target.alive || action.targetId === playerId) return { updated: false }
      target.alive = false
      target.eliminated = true
      state.roundResult = { eliminatedId: action.targetId, pickedBy: playerId }
      state.phase = 'reveal'
      state.nextAt = Date.now() + REVEAL_MS
      return { updated: true, finished: false }
    }

    return { updated: false }
  }

  function computeWinner(state) {
    return state.winner || null
  }

  function getWinners(state) {
    return state.winner ? [state.winner] : []
  }

  function isFinished(state) {
    return !!state.finished
  }

  function buildPlayers(state, viewerId) {
    const showAnswers = mode === 'survive-tb' || mode === 'score-tb'
    const showSubs = gameDef.showSubmissions !== false
    return Object.values(state.ps).map(p => {
      const row = {
        playerId: p.playerId,
        playerName: p.playerName,
        alive: p.alive,
        eliminated: p.eliminated,
        score: p.score,
        answered: p.answered,
        submitted: p.answered,
        locked: p.locked,
        inTiebreak: p.inTiebreak
      }
      if (showAnswers && (state.phase === 'reveal' || state.finished)) row.answer = p.answer
      else if ((mode === 'elim-last' || mode === 'first-pick' || mode === 'duel') && showSubs) {
        row.correct = p.correct
        row.answer = p.answered ? p.answer : null
      }
      if (mode === 'duel' && state.current) row.inDuel = state.current.includes(p.playerId)
      return row
    })
  }

  function getState(state, playerId) {
    const p = state.ps[playerId]
    const base = {
      gameType: 'custom-mode',
      mode,
      status: state.status,
      phase: state.phase,
      qIndex: state.qIndex,
      totalQuestions: (mode === 'survive-tb' || mode === 'score-tb') ? basicQuestions.length : allQuestions.length,
      question: state.question || null,
      deadline: state.deadline || 0,
      serverNow: Date.now(),
      timeLimit: state.tiebreak ? gameDef.tiebreakTimeLimit : gameDef.basicTimeLimit,
      tiebreak: !!state.tiebreak,
      target: state.finished || state.phase === 'reveal' ? state.target : null,
      current: state.current || null,
      pickerId: state.pickerId || null,
      firstId: state.firstId || null,
      roundResult: state.roundResult || null,
      showSubmissions: gameDef.showSubmissions !== false,
      players: buildPlayers(state, playerId),
      winner: state.winner || null,
      finished: !!state.finished
    }
    if (p) {
      base.my = {
        playerId,
        alive: p.alive,
        eliminated: p.eliminated,
        score: p.score,
        answered: p.answered,
        myAnswer: p.answer,
        correct: p.correct,
        inTiebreak: p.inTiebreak,
        canAnswer: state.phase === 'answering' && p.alive &&
          !(state.tiebreak && !p.inTiebreak) &&
          !(mode === 'elim-last' && p.answered) &&
          !(mode === 'first-pick' && state.firstId) &&
          !(mode === 'duel' && state.firstId) &&
          !((mode === 'survive-tb' || mode === 'score-tb') && state.deadline && Date.now() >= state.deadline),
        canPick: mode === 'first-pick' && state.phase === 'picking' && playerId === state.pickerId
      }
    }
    return base
  }

  function getAllStates(state) {
    const out = {}
    for (const pid of Object.keys(state.ps)) {
      const p = state.ps[pid]
      let label = p.alive ? '存活' : '已出局'
      if (mode === 'score-tb') label += ` · ${p.score}分`
      if (p.answered) label += ' · 已作答'
      out[pid] = {
        score: mode === 'score-tb' ? p.score : (p.alive ? 1 : 0),
        progress: p.score,
        max: 0,
        done: !p.alive || state.finished,
        label,
        alive: p.alive,
        answered: p.answered,
        answer: (state.phase === 'reveal' || state.finished) ? p.answer : undefined
      }
    }
    return out
  }

  function checkTarget() {
    return false
  }

  // 复盘：单个操作的可读描述
  function describeEvent(state, playerId, action, result) {
    const p = state.ps[playerId]
    const pname = p ? p.playerName : playerId
    const t = action && action.type
    if (t === 'answer' || t === 'set_answer') {
      return { text: `${pname} 作答：${action.answer}`, data: { answer: action.answer, correct: result ? result.correct : undefined } }
    }
    if (t === 'pick') {
      const target = state.ps[action.targetId]
      return { text: `${pname} 选择 ${target ? target.playerName : action.targetId} 出局`, data: { targetId: action.targetId } }
    }
    if (t === 'pick_pair') {
      const ids = action.playerIds || action.ids || []
      return { text: `${pname} 指定对决：${ids.map(id => nameOf(state, id)).join(' vs ')}`, data: { ids } }
    }
    return null
  }

  // 复盘：取出处理器内部产生的事件（回合结算/淘汰/加时等）
  function takeReplayEvents(state) {
    const evs = state._replayEvents || []
    state._replayEvents = []
    return evs
  }

  return {
    id: gameDef.id,
    name: gameDef.name,
    description: gameDef.description,
    category: 'custom',
    playerCount: gameDef.playerCount,
    duration: Math.max(300, (basicQuestions.length * (gameDef.basicTimeLimit || 30)) + (gameDef.tiebreakTimeLimit || 30) + 60),
    needsServerTick: true,
    serverTickMs: 500,
    broadcastState: true,
    init,
    tick,
    isFinished,
    handleAction,
    computeWinner,
    getWinners,
    getState,
    getAllStates,
    checkTarget,
    describeEvent,
    takeReplayEvents
  }
}

module.exports = { createModeHandler, MODE_TYPES }
