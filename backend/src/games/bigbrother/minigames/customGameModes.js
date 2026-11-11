/**
 * 自定义游戏 - 对战模式引擎
 * 支持 5 种赛制：
 *  elim-last   模式1：同时作答，最后作答出局 / 第一个答错出局，直到剩 1 人
 *  first-pick  模式2：只检查第一个作答，答对任选一人出局，答错自己出局
 *  duel        模式3：候选池随机/指定 2 人 1v1，只检查第一个作答，胜者回池，直至剩 2 人决赛
 *  survive-tb  模式4：限时可切换答案，锁定后错误/未作答出局，基本题结束进入数字加时题
 *  score-tb    模式5：限时可切换答案，正确积 1 分，基本题结束后唯一最高分获胜，否则数字加时题
 */

const MODE_TYPES = ['elim-last', 'first-pick', 'duel', 'survive-tb', 'score-tb', 'lives-build', 'race-score']

function normalize(v) {
  return String(v == null ? '' : v).trim().toLowerCase()
}

function gradeQuestion(q, answer) {
  if (!q) return false
  if (q.qtype === 'match') {
    const leftOrder = q._matchLeftOrder || []
    const rightOrder = q._matchRightOrder || []
    if (leftOrder.length === 0 || rightOrder.length !== leftOrder.length) return false
    let mapping
    try { mapping = JSON.parse(answer) } catch { return false }
    if (!mapping || typeof mapping !== 'object') return false
    for (let li = 0; li < leftOrder.length; li++) {
      const ri = Number(mapping[li])
      if (!Number.isInteger(ri) || ri < 0 || ri >= rightOrder.length) return false
      if (leftOrder[li] !== rightOrder[ri]) return false
    }
    return true
  }
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
  // 模式1/2/3 的每题限时（管理员可设置，默认 30s）
  const answerLimitMs = (gameDef.answerTimeLimit || gameDef.basicTimeLimit || 30) * 1000
  const REVEAL_MS = 3000
  const DUEL_ANNOUNCE_MS = 8000
  const DUEL_PICK_MS = 20000
  // 模式6（记忆回溯）：初始生命值
  const initialLives = Math.max(1, parseInt(gameDef.lives, 10) || 2)
  // 模式7（众里寻他千百度）：目标分与名次得分
  const raceTarget = Math.max(1, parseInt(gameDef.raceTarget, 10) || 10)
  const racePoints = Array.isArray(gameDef.racePoints) && gameDef.racePoints.length
    ? gameDef.racePoints.map(n => Math.max(0, parseInt(n, 10) || 0))
    : [4, 2, 1]
  // 模式6/7 每轮结算展示时长
  const modeRevealMs = Math.max(1, parseInt(gameDef.revealTime, 10) || 5) * 1000

  function limitFor(state) {
    if (state.tiebreak) return tbLimitMs
    if (mode === 'survive-tb' || mode === 'score-tb') return basicLimitMs
    return answerLimitMs
  }

  function publicQuestion(q) {
    if (!q) return null
    const out = {
      id: q.id,
      text: q.text,
      qtype: q.qtype || 'text',
      options: q.qtype === 'choice' ? q.options : (q.qtype === 'judge' ? (q.options.length ? q.options : ['对', '错']) : []),
      points: q.points || 1,
      media: q.media || null
    }
    if (q.qtype === 'match') {
      out.leftItems = (q._matchLeftOrder || []).map(i => (q.pairs[i] ? q.pairs[i].left : ''))
      out.rightItems = (q._matchRightOrder || []).map(i => (q.pairs[i] ? q.pairs[i].right : ''))
    }
    return out
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
        lives: initialLives,
        answer: null,
        answered: false,
        correct: null,
        correctAt: 0,
        roundPoints: 0,
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
      duelWinnerId: null,
      finished: false,
      winner: null,
      started: false,
      roundHistory: [],
      // 模式6/7 运行时数据
      lives: initialLives,
      raceTarget,
      racePoints,
      correctOrder: [],
      roundAwards: {},
      pendingWinner: null,
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

  function questionInfo(q) {
    if (!q) return null
    return {
      id: q.id,
      text: q.text,
      qtype: q.qtype || 'text',
      options: q.options || [],
      correctAnswer: q.qtype === 'match'
        ? (q.pairs || []).map(p => `${p.left} ↔ ${p.right}`).join('；')
        : q.correctAnswer,
      pairs: q.pairs || [],
      media: q.media || null
    }
  }

  // 记录一轮完整过程：题目、每人答案/对错/分数/生命、淘汰与得分结果
  function snapshotRound(state) {
    if (!Array.isArray(state.roundHistory)) state.roundHistory = []
    const players = Object.values(state.ps).map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      answer: p.answer,
      correct: p.correct,
      score: p.score || 0,
      lives: p.lives,
      roundPoints: p.roundPoints || 0,
      alive: !!p.alive,
      eliminated: !!p.eliminated,
      inTiebreak: !!p.inTiebreak
    }))
    state.roundHistory.push({
      qIndex: state.qIndex,
      tiebreak: !!state.tiebreak,
      question: questionInfo(state._q || null),
      players,
      result: state.roundResult ? JSON.parse(JSON.stringify(state.roundResult)) : null,
      winnerId: state.pendingWinner || state.duelWinnerId || null,
      at: Date.now()
    })
  }

  function resetRoundAnswers(state) {
    Object.values(state.ps).forEach(p => {
      p.answer = null
      p.answered = false
      p.correct = null
      p.correctAt = 0
      p.roundPoints = 0
      p.submittedAt = 0
      p.locked = false
    })
    state.order = []
    state.roundResult = null
    state.firstId = null
    state.correctOrder = []
    state.roundAwards = {}
    state.pendingWinner = null
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
    let active = q
    if (q && q.qtype === 'match' && Array.isArray(q.pairs)) {
      const indices = q.pairs.map((_, i) => i)
      active = { ...q, _matchLeftOrder: shuffle(indices), _matchRightOrder: shuffle(indices) }
    }
    state._q = active
    state.question = publicQuestion(active)
    state.phase = 'answering'
    state.deadline = Date.now() + limitFor(state)
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
    snapshotRound(state)
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
      state.pickDeadline = Date.now() + answerLimitMs
      pushEvent(state, 'phase', `${nameOf(state, state.firstId)} 首个作答正确，可选择一人出局`, { pickerId: state.firstId })
    } else {
      const p = state.ps[state.firstId]
      if (p) { p.alive = false; p.eliminated = true }
      pushEvent(state, 'eliminate', `${nameOf(state, state.firstId)} 首个作答错误，自己出局`, { eliminatedId: state.firstId })
      state.roundResult = { eliminatedId: state.firstId, selfEliminated: true }
      snapshotRound(state)
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

  // 模式3：公示本轮 PK 的两人（8 秒），公示结束后再开始答题
  function announceDuelPair(state, pair) {
    state.current = pair
    state.pickerId = null
    resetRoundAnswers(state)
    state._q = null
    state.question = null
    state.phase = 'announcing'
    state.nextAt = Date.now() + DUEL_ANNOUNCE_MS
    state.deadline = 0
    state.pickDeadline = 0
    if (pair && pair.length === 2) {
      pushEvent(state, 'pair', `本轮 PK：${nameOf(state, pair[0])} vs ${nameOf(state, pair[1])}`, { pair })
    }
  }

  // 公示结束，正式开始本轮答题
  function beginDuelQuestion(state) {
    state.qIndex++
    if (state.qIndex >= allQuestions.length) state.qIndex = 0
    beginQuestion(state, allQuestions[state.qIndex])
  }

  function advanceDuel(state) {
    const alive = aliveList(state)
    if (alive.length <= 1) return finishWith(state, alive[0] ? alive[0].playerId : null)
    // 只剩 2 人：直接进行最终对决，但仍需公示 8 秒
    if (alive.length === 2) {
      announceDuelPair(state, alive.map(p => p.playerId))
      return false
    }
    // 后续轮次由上一局胜者选择 2 名 PK 选手
    const lastWinner = state.duelWinnerId && state.ps[state.duelWinnerId] && state.ps[state.duelWinnerId].alive
      ? state.duelWinnerId
      : null
    if (lastWinner) {
      state.current = null
      state.question = null
      state._q = null
      state.firstId = null
      state.phase = 'duel-picking'
      state.pickerId = lastWinner
      state.pickDeadline = Date.now() + DUEL_PICK_MS
      state.nextAt = 0
      pushEvent(state, 'phase', `${nameOf(state, lastWinner)} 选择本轮 PK 的 2 名选手`, { pickerId: lastWinner })
      return false
    }
    // 兜底：随机选择
    announceDuelPair(state, shuffle(alive.map(p => p.playerId)).slice(0, 2))
    return false
  }

  // 应用一次「选择出局」（选手点选或超时随机）
  function applyPick(state, targetId) {
    const target = state.ps[targetId]
    if (!target || !target.alive || targetId === state.pickerId) {
      state.phase = 'reveal'
      state.nextAt = Date.now() + REVEAL_MS
      return false
    }
    target.alive = false
    target.eliminated = true
    pushEvent(state, 'eliminate', `${nameOf(state, targetId)} 被 ${nameOf(state, state.pickerId)} 选择出局`, { eliminatedId: targetId, pickedBy: state.pickerId })
    state.roundResult = { eliminatedId: targetId, pickedBy: state.pickerId }
    snapshotRound(state)
    state.phase = 'reveal'
    state.nextAt = Date.now() + REVEAL_MS
    state.pickDeadline = 0
    return false
  }

  // 模式1 超时结算
  function timeoutElimLast(state) {
    const alive = aliveList(state)
    let elim = null
    if (gameDef.eliminateRule === 'first_wrong') {
      // 无人答错则本轮无人出局
      elim = null
    } else {
      // 未作答者视为最后提交；多个未作答取最后一个
      const unanswered = alive.filter(p => !p.answered)
      if (unanswered.length) elim = unanswered[unanswered.length - 1].playerId
      else {
        let worst = -1
        for (const p of alive) { const t = p.submittedAt || 0; if (t >= worst) { worst = t; elim = p.playerId } }
      }
    }
    for (const p of alive) { if (!p.answered) { p.correct = false; p.locked = true } }
    if (elim && state.ps[elim]) { state.ps[elim].alive = false; state.ps[elim].eliminated = true }
    if (elim) pushEvent(state, 'eliminate', `超时：${nameOf(state, elim)} 出局`, { eliminatedId: elim, timeout: true })
    state.roundResult = { eliminatedId: elim, timeout: true }
    snapshotRound(state)
    state.phase = 'reveal'
    state.nextAt = Date.now() + REVEAL_MS
  }

  // 模式2 超时：无人作答则本轮无人出局
  function timeoutFirstPick(state) {
    state.roundResult = { timeout: true, eliminatedId: null }
    snapshotRound(state)
    state.phase = 'reveal'
    state.nextAt = Date.now() + REVEAL_MS
  }

  // 模式3 作答超时：无人作答时双方淘汰；若已是全场最后 2 人则随机判负一人
  function timeoutDuel(state) {
    const pair = state.current || []
    if (pair.length !== 2) return advanceDuel(state)
    const alive = aliveList(state)
    if (alive.length > 2) {
      for (const id of pair) {
        if (state.ps[id]) { state.ps[id].alive = false; state.ps[id].eliminated = true }
      }
      pushEvent(state, 'duel', `超时：${nameOf(state, pair[0])}、${nameOf(state, pair[1])} 均未作答，两人淘汰`, { eliminatedIds: pair, timeout: true, bothEliminated: true })
      state.roundResult = { eliminatedIds: pair, timeout: true, bothEliminated: true }
      state.duelWinnerId = null
      snapshotRound(state)
      state.phase = 'reveal'
      state.nextAt = Date.now() + REVEAL_MS
      return false
    }
    // 最后 2 人：不能同时淘汰，随机判负一人以保证产生胜者
    const loser = Math.random() < 0.5 ? pair[0] : pair[1]
    const winner = pair.find(id => id !== loser)
    if (state.ps[loser]) { state.ps[loser].alive = false; state.ps[loser].eliminated = true }
    pushEvent(state, 'duel', `超时：${nameOf(state, loser)} 出局`, { winnerId: winner, eliminatedId: loser, timeout: true })
    state.roundResult = { winnerId: winner, eliminatedId: loser, timeout: true }
    state.duelWinnerId = winner
    snapshotRound(state)
    state.phase = 'reveal'
    state.nextAt = Date.now() + REVEAL_MS
    return false
  }

  // ===================== 模式6：记忆回溯（生命值） =====================
  function resolveLivesRound(state, timedOut) {
    if (state.phase !== 'answering') return false
    const alive = aliveList(state)
    for (const p of alive) {
      if (!p.correct) p.correct = false
    }
    const correctOnes = alive
      .filter(p => p.answered && p.correct)
      .sort((a, b) => (a.correctAt || 0) - (b.correctAt || 0))
    let loser = null
    if (correctOnes.length === alive.length) {
      // 全部答对：最后一个答对（最慢）的选手失去 1 点生命
      loser = correctOnes[correctOnes.length - 1]
    } else {
      // 超时仍有未答对者：最后一个未答对者失去 1 点生命
      const notCorrect = alive.filter(p => !(p.answered && p.correct))
      loser = notCorrect.length ? notCorrect[notCorrect.length - 1] : correctOnes[correctOnes.length - 1] || null
    }
    let eliminated = false
    if (loser) {
      loser.lives = Math.max(0, (loser.lives == null ? initialLives : loser.lives) - 1)
      if (loser.lives <= 0) {
        loser.alive = false
        loser.eliminated = true
        eliminated = true
      }
      pushEvent(state, 'eliminate', `${loser.playerName} 失去 1 点生命${eliminated ? '，生命耗尽出局' : `（剩余 ${loser.lives} 点）`}`, {
        playerId: loser.playerId, lives: loser.lives, eliminated
      })
    }
    state.roundResult = {
      lives: true,
      loserId: loser ? loser.playerId : null,
      livesLeft: loser ? loser.lives : null,
      eliminated,
      timedOut: !!timedOut,
      correctOrder: correctOnes.map(p => ({ playerId: p.playerId, at: p.correctAt })),
      livesMap: Object.fromEntries(alive.map(p => [p.playerId, p.lives]))
    }
    snapshotRound(state)
    state.phase = 'reveal'
    state.nextAt = Date.now() + modeRevealMs
    return false
  }

  function advanceLives(state) {
    const alive = aliveList(state)
    if (alive.length <= 1) return finishWith(state, alive[0] ? alive[0].playerId : null)
    state.qIndex = (state.qIndex + 1) % Math.max(1, basicQuestions.length)
    beginQuestion(state, basicQuestions[state.qIndex])
    return false
  }

  // ===================== 模式7：众里寻他千百度（抢分赛） =====================
  function resolveRaceRound(state, timedOut) {
    if (state.phase !== 'answering') return false
    const alive = aliveList(state)
    let winner = null
    for (const rec of state.correctOrder) {
      const p = state.ps[rec.playerId]
      if (p && (p.score || 0) >= raceTarget) { winner = p.playerId; break }
    }
    state.pendingWinner = winner
    state.roundResult = {
      race: true,
      order: state.correctOrder.map(r => ({ ...r })),
      awards: { ...state.roundAwards },
      scores: Object.fromEntries(alive.map(p => [p.playerId, p.score || 0])),
      timedOut: !!timedOut
    }
    const detail = state.correctOrder.map(r => {
      const p = state.ps[r.playerId]
      return `${nameOf(state, r.playerId)} 第${r.rank}名 +${r.points}`
    }).join('、')
    pushEvent(state, 'round', `第${state.qIndex + 1}题结算：${detail || '无人答对'}`, state.roundResult)
    snapshotRound(state)
    state.phase = 'reveal'
    state.nextAt = Date.now() + modeRevealMs
    return false
  }

  function advanceRace(state) {
    if (state.pendingWinner) return finishWith(state, state.pendingWinner)
    const alive = aliveList(state)
    if (alive.length <= 1) return finishWith(state, alive[0] ? alive[0].playerId : null)
    state.qIndex = (state.qIndex + 1) % Math.max(1, basicQuestions.length)
    beginQuestion(state, basicQuestions[state.qIndex])
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
        // 无人不超过目标：取最接近目标（绝对差最小）者
        let minDiff = null
        for (const p of candidates) {
          const a = Number(p.answer)
          if (p.answered && !Number.isNaN(a)) {
            const diff = Math.abs(a - state.target)
            if (minDiff === null || diff < minDiff) { minDiff = diff; best = p.playerId }
          }
        }
      }
      if (!best && candidates.length) best = candidates[0].playerId
      for (const p of candidates) {
        pushEvent(state, 'answer', `${p.playerName} 加时作答：${p.answered ? p.answer : '未作答'}`, { playerId: p.playerId, answer: p.answer, tiebreak: true })
      }
      pushEvent(state, 'tiebreak', `数字加时题目标 ${state.target}，${nameOf(state, best)} 最接近且不超过，获胜`, { winnerId: best, target: state.target })
      state.roundResult = { tiebreak: true, winnerId: best, target: state.target, lockedAt: now }
      snapshotRound(state)
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
    snapshotRound(state)
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
        } else if (state.deadline && now >= state.deadline) {
          if (mode === 'elim-last') timeoutElimLast(state)
          else if (state.firstId) resolveFirstPick(state, state.ps[state.firstId] ? state.ps[state.firstId].correct : false)
          else timeoutFirstPick(state)
        }
      } else if (state.phase === 'picking' && state.pickDeadline && now >= state.pickDeadline) {
        const others = aliveList(state).filter(p => p.playerId !== state.pickerId)
        applyPick(state, others.length ? others[Math.floor(Math.random() * others.length)].playerId : null)
      } else if (state.phase === 'reveal' && state.nextAt && now >= state.nextAt) {
        return mode === 'elim-last' ? advanceElimLast(state) : advanceFirstPick(state)
      }
      return false
    }

    if (mode === 'duel') {
      if (state.phase === 'announcing' && state.nextAt && now >= state.nextAt) {
        beginDuelQuestion(state)
      } else if (state.phase === 'answering' && state.firstId) {
        const p = state.ps[state.firstId]
        const correct = p ? p.correct : false
        const other = state.current ? state.current.find(id => id !== state.firstId) : null
        const loser = correct ? other : state.firstId
        if (loser && state.ps[loser]) { state.ps[loser].alive = false; state.ps[loser].eliminated = true }
        pushEvent(state, 'duel', `${nameOf(state, state.firstId)} ${correct ? '答对' : '答错'}，${nameOf(state, loser)} 出局`, { winnerId: correct ? state.firstId : other, eliminatedId: loser })
        state.roundResult = { winnerId: correct ? state.firstId : other, eliminatedId: loser }
        state.duelWinnerId = correct ? state.firstId : other
        snapshotRound(state)
        state.phase = 'reveal'
        state.nextAt = now + REVEAL_MS
      } else if (state.phase === 'answering' && state.deadline && now >= state.deadline) {
        timeoutDuel(state)
      } else if (state.phase === 'reveal' && state.nextAt && now >= state.nextAt) {
        return advanceDuel(state)
      } else if (state.phase === 'duel-picking' && state.pickDeadline && now >= state.pickDeadline) {
        // 胜者超时未选择：随机抽取 2 人
        const pool = aliveList(state).map(p => p.playerId)
        announceDuelPair(state, shuffle(pool).slice(0, 2))
      }
      return false
    }

    if (mode === 'lives-build') {
      if (state.phase === 'answering' && state.deadline && now >= state.deadline) {
        return resolveLivesRound(state, true)
      }
      if (state.phase === 'reveal' && state.nextAt && now >= state.nextAt) {
        return advanceLives(state)
      }
      return false
    }

    if (mode === 'race-score') {
      if (state.phase === 'answering' && state.deadline && now >= state.deadline) {
        return resolveRaceRound(state, true)
      }
      if (state.phase === 'reveal' && state.nextAt && now >= state.nextAt) {
        return advanceRace(state)
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
        state.qIndex = -1
        const pair = shuffle(aliveList(state).map(p => p.playerId)).slice(0, 2)
        announceDuelPair(state, pair)
      } else {
        state.qIndex = 0
        if (!basicQuestions.length) return { updated: true, finished: setupTiebreak(state) }
        beginQuestion(state, basicQuestions[0])
      }
      return { updated: true, finished: state.finished }
    }

    if (state.finished) return { updated: false }

    // 模式3：上一局胜者选择本轮 PK 的 2 名选手（选手操作，非管理员）
    if (mode === 'duel' && action.type === 'pick_pair') {
      if (state.phase === 'duel-picking' && playerId === state.pickerId) {
        const ids = Array.isArray(action.playerIds) ? action.playerIds : (action.ids || [])
        const aliveIds = new Set(aliveList(state).map(x => x.playerId))
        if (ids.length === 2 && ids[0] !== ids[1] && ids.every(id => aliveIds.has(id))) {
          announceDuelPair(state, ids)
        }
      }
      return { updated: true }
    }

    // ---- 管理员推进 ----
    if (isAdmin) {
      if (action.type === 'next') {
        if (mode === 'elim-last') return { updated: true, finished: advanceElimLast(state) }
        if (mode === 'first-pick') return { updated: true, finished: advanceFirstPick(state) }
        if (mode === 'duel') {
          if (state.phase === 'announcing') { beginDuelQuestion(state); return { updated: true } }
          if (state.phase === 'reveal') return { updated: true, finished: advanceDuel(state) }
          return { updated: true }
        }
        if (mode === 'lives-build') {
          if (state.phase === 'reveal') return { updated: true, finished: advanceLives(state) }
          if (state.phase === 'answering') return { updated: true, finished: resolveLivesRound(state, false) }
          return { updated: true }
        }
        if (mode === 'race-score') {
          if (state.phase === 'reveal') return { updated: true, finished: advanceRace(state) }
          if (state.phase === 'answering') return { updated: true, finished: resolveRaceRound(state, false) }
          return { updated: true }
        }
        if (state.phase === 'reveal') return { updated: true, finished: advanceLimit(state) }
        if (state.phase === 'answering') return { updated: true, finished: lockRound(state) }
        return { updated: true }
      }
      if (action.type === 'lock') {
        if (mode === 'lives-build') return { updated: true, finished: resolveLivesRound(state, false) }
        if (mode === 'race-score') return { updated: true, finished: resolveRaceRound(state, false) }
        return { updated: true, finished: lockRound(state) }
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
      if (mode === 'lives-build') {
        if (state.phase !== 'answering' || !p.alive) return { updated: false }
        if (Date.now() >= state.deadline) return { updated: false }
        if (p.answered && p.correct) return { updated: false }
        p.answer = action.answer
        const correct = gradeQuestion(state._q, action.answer)
        if (!correct) {
          // 答错：数字清零，可在本轮继续重试（不进入冷却）
          p.correct = false
          p.answered = false
          return { updated: true, finished: false, result: { correct: false, reset: true, retry: true } }
        }
        p.correct = true
        p.answered = true
        p.correctAt = Date.now()
        p.submittedAt = p.correctAt
        const alive = aliveList(state)
        if (alive.every(x => x.correct)) resolveLivesRound(state, false)
        return { updated: true, finished: false, result: { correct: true, lives: p.lives } }
      }

      if (mode === 'race-score') {
        if (state.phase !== 'answering' || !p.alive) return { updated: false }
        if (Date.now() >= state.deadline) return { updated: false }
        if (p.correct) return { updated: false }
        p.answer = action.answer
        const correct = gradeQuestion(state._q, action.answer)
        if (!correct) {
          // 答错不结束本题，可继续尝试（不公布正确答案）
          return { updated: true, finished: false, result: { correct: false, retry: true } }
        }
        p.correct = true
        p.answered = true
        p.correctAt = Date.now()
        p.submittedAt = p.correctAt
        const rank = state.correctOrder.length
        if (rank < racePoints.length) {
          const points = racePoints[rank]
          p.roundPoints = points
          p.score = (p.score || 0) + points
          state.roundAwards[p.playerId] = points
          state.correctOrder.push({ playerId, at: p.correctAt, points, rank: rank + 1 })
          pushEvent(state, 'answer', `${p.playerName} 第${rank + 1}位答对，+${points} 分`, {
            playerId, rank: rank + 1, points, score: p.score
          })
        }
        const alive = aliveList(state)
        const allCorrect = alive.every(x => x.correct)
        // 一旦有人达到目标总分，立即结束本题并进入最终结算
        if ((p.score || 0) >= raceTarget || state.correctOrder.length >= racePoints.length || allCorrect) {
          resolveRaceRound(state, false)
        }
        return {
          updated: true,
          finished: false,
          result: {
            correct: true,
            points: p.roundPoints,
            score: p.score,
            rank: state.correctOrder.find(r => r.playerId === playerId)?.rank || null
          }
        }
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
      applyPick(state, action.targetId)
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
    const showAnswers = mode === 'survive-tb' || mode === 'score-tb' || mode === 'lives-build' || mode === 'race-score'
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
      if (mode === 'lives-build') {
        row.lives = p.lives
      }
      if (mode === 'race-score') {
        row.roundPoints = p.roundPoints
      }
      const revealPhase = state.phase === 'reveal' || state.finished
      // 作答阶段只暴露“是否已提交”，答案/对错仅在揭晓后展示，避免泄露
      if (revealPhase && (showAnswers || showSubs)) {
        row.answer = p.answer
        if (!showAnswers || mode === 'lives-build' || mode === 'race-score') row.correct = p.correct
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
      totalQuestions: (mode === 'survive-tb' || mode === 'score-tb' || mode === 'lives-build' || mode === 'race-score')
        ? basicQuestions.length
        : allQuestions.length,
      question: state.question || null,
      deadline: state.deadline || 0,
      serverNow: Date.now(),
      timeLimit: state.tiebreak
        ? Math.round(tbLimitMs / 1000)
        : (mode === 'survive-tb' || mode === 'score-tb' ? Math.round(basicLimitMs / 1000) : Math.round(answerLimitMs / 1000)),
      pickDeadline: state.pickDeadline || 0,
      tiebreak: !!state.tiebreak,
      target: state.finished || state.phase === 'reveal' ? state.target : null,
      current: state.current || null,
      pickerId: state.pickerId || null,
      firstId: state.firstId || null,
      nextAt: state.nextAt || 0,
      duelWinnerId: state.duelWinnerId || null,
      roundResult: state.roundResult || null,
      showSubmissions: gameDef.showSubmissions !== false,
      players: buildPlayers(state, playerId),
      winner: state.winner || null,
      finished: !!state.finished
    }
    if (mode === 'lives-build') {
      base.lives = state.lives
      base.livesMap = Object.fromEntries(Object.values(state.ps).map(x => [x.playerId, x.lives]))
    }
    if (mode === 'race-score') {
      base.raceTarget = state.raceTarget
      base.racePoints = state.racePoints
      base.correctOrder = state.correctOrder.map(r => ({ ...r }))
      base.roundAwards = { ...state.roundAwards }
      base.pendingWinner = state.pendingWinner || null
    }
    if (p) {
      base.my = {
        playerId,
        alive: p.alive,
        eliminated: p.eliminated,
        score: p.score,
        lives: p.lives,
        answered: p.answered,
        myAnswer: p.answer,
        correct: p.correct,
        correctAt: p.correctAt,
        roundPoints: p.roundPoints,
        inTiebreak: p.inTiebreak,
        canAnswer: state.phase === 'answering' && p.alive &&
          (mode !== 'duel' || (state.current && state.current.includes(playerId))) &&
          !(state.tiebreak && !p.inTiebreak) &&
          !(mode === 'elim-last' && p.answered) &&
          !(mode === 'first-pick' && state.firstId) &&
          !(mode === 'duel' && state.firstId) &&
          !(mode === 'lives-build' && p.answered && p.correct) &&
          !(mode === 'race-score' && p.correct) &&
          !(state.deadline && Date.now() >= state.deadline),
        canPick: mode === 'first-pick' && state.phase === 'picking' && playerId === state.pickerId,
        canPickDuel: mode === 'duel' && state.phase === 'duel-picking' && playerId === state.pickerId
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
      if (mode === 'race-score') label = `${p.score || 0} 分`
      if (mode === 'lives-build') label = `❤️ ${p.lives}`
      if (p.answered && mode !== 'lives-build') label += ' · 已作答'
      out[pid] = {
        score: (mode === 'score-tb' || mode === 'race-score') ? p.score : (mode === 'lives-build' ? p.lives : (p.alive ? 1 : 0)),
        progress: mode === 'lives-build' ? p.lives : p.score,
        max: 0,
        done: !p.alive || state.finished,
        label,
        alive: p.alive,
        lives: p.lives,
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
    if ((t === 'answer' || t === 'set_answer') && (mode === 'lives-build' || mode === 'race-score')) {
      return { text: `${pname} 提交了答案`, data: { correct: result ? result.correct : undefined } }
    }
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

  // 复盘：题目、每一轮的完整答案/得分/淘汰过程
  function getReplayMeta(state) {
    const correctCount = {}
    for (const r of (state.roundHistory || [])) {
      for (const p of (r.players || [])) {
        if (p.correct) correctCount[p.playerId] = (correctCount[p.playerId] || 0) + 1
      }
    }
    return {
      type: 'custom-mode',
      mode,
      gameName: gameDef.name,
      description: gameDef.description,
      winCondition: gameDef.winCondition,
      eliminateRule: gameDef.eliminateRule || '',
      raceTarget,
      racePoints,
      initialLives,
      winnerId: state.winner || null,
      questions: allQuestions.map(questionInfo),
      rounds: state.roundHistory || [],
      players: Object.values(state.ps).map(p => ({
        playerId: p.playerId,
        playerName: p.playerName,
        alive: !!p.alive,
        eliminated: !!p.eliminated,
        score: p.score || 0,
        lives: p.lives,
        correctCount: correctCount[p.playerId] || 0
      }))
    }
  }

  // 管理员完整局面（含隐藏信息）
  function getReplaySnapshot(state) {
    const summary = {
      模式: mode,
      阶段: state.phase,
      题号: `${Math.min(state.qIndex + 1, basicQuestions.length || allQuestions.length || 1)}/${basicQuestions.length || allQuestions.length || 1}`
    }
    if (mode === 'lives-build') summary['生命值'] = initialLives
    if (mode === 'race-score') {
      summary['目标分'] = raceTarget
      summary['名次得分'] = racePoints.join(' / ')
      if (state.correctOrder.length) {
        summary['本题答对顺序'] = state.correctOrder.map(r => `${nameOf(state, r.playerId)} +${r.points}`).join('、')
      }
    }
    if (state.roundResult && state.roundResult.race) {
      summary['上题结算'] = (state.roundResult.order || []).map(r => `${nameOf(state, r.playerId)} 第${r.rank}位 +${r.points}`).join('、') || '无人答对'
    }
    if (state.roundResult && state.roundResult.lives && state.roundResult.loserId) {
      summary['上轮失去生命'] = nameOf(state, state.roundResult.loserId)
    }
    const players = {}
    for (const p of Object.values(state.ps)) {
      players[p.playerId] = {
        分数: p.score || 0,
        生命: p.lives,
        存活: !!p.alive,
        本题状态: p.correct ? '已答对' : (p.answer != null ? '已提交' : '未作答'),
        本题得分: p.roundPoints || 0,
        答案: p.answer == null ? '—' : p.answer
      }
    }
    return { type: 'custom-mode', mode, summary, players }
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
    duration: (mode === 'lives-build' || mode === 'race-score')
      ? 3600
      : Math.max(300, (basicQuestions.length * (gameDef.basicTimeLimit || 30)) + (gameDef.tiebreakTimeLimit || 30) + 60),
    privateActions: (mode === 'lives-build' || mode === 'race-score') ? ['answer', 'set_answer'] : [],
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
    getReplayMeta,
    takeReplayEvents
  }
}

module.exports = { createModeHandler, MODE_TYPES }
