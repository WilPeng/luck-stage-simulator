/**
 * 自定义游戏处理器
 * 将 BBCustomGame 文档包装为与内置游戏相同接口的 handler
 *
 * 赛制：
 *   - quiz  答对赛制：全部答对 / 答对指定数量 / 无答案由管理员评判
 *   - score 积分赛制：限时得分最高 / 答对最多
 * 通用：提交方式（单题/全部一起）、提交次数上限、提交间隔、
 *       答错反馈（不告知/告知数量/告知答案/仅全对告知）、答错是否锁定该题
 */
const BBCustomGame = require('../models/BBCustomGame')
const { createModeHandler, MODE_TYPES } = require('./customGameModes')

const customGameCache = new Map()

async function loadCustomGame(gameId) {
  if (customGameCache.has(gameId)) return customGameCache.get(gameId)
  const doc = await BBCustomGame.findOne({ id: gameId, enabled: true })
  if (!doc) return null
  const obj = doc.toObject()
  customGameCache.set(gameId, obj)
  return obj
}

function clearCustomGameCache(gameId) {
  if (gameId) customGameCache.delete(gameId)
  else customGameCache.clear()
}

function getCustomHandlerId(gameId) {
  return `custom-${gameId}`
}

function getGameIdFromHandler(handlerId) {
  return handlerId.replace(/^custom-/, '')
}

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function normalize(v) {
  return String(v == null ? '' : v).trim().toLowerCase()
}

function createCustomGameHandler(gameDef) {
  if (MODE_TYPES.includes(gameDef.type)) return createModeHandler(gameDef)

  const handlerId = getCustomHandlerId(gameDef.id)
  const isAdminJudge = gameDef.winCondition === 'admin_judge'
  // 题目放出方式：同时放出(all) / 逐题放出(sequential)；兼容旧的 submitMode
  const releaseSequential = gameDef.questionRelease
    ? gameDef.questionRelease === 'sequential'
    : (gameDef.submitMode === 'single')
  const submitMode = releaseSequential ? 'single' : 'batch'
  const cooldownMs = (gameDef.cooldownSeconds || 0) * 1000
  const maxAttempts = gameDef.maxAttempts || 0
  const totalQuestions = gameDef.questions.length

  // 单题：与正确答案比较；无答案（管理员评判）返回 null
  function grade(q, userAnswer) {
    if (q.qtype === 'match') {
      const leftOrder = q.matchLeftOrder || []
      const rightOrder = q.matchRightOrder || []
      if (leftOrder.length === 0 || rightOrder.length !== leftOrder.length) return false
      let mapping
      try { mapping = JSON.parse(userAnswer) } catch { return false }
      if (!mapping || typeof mapping !== 'object') return false
      for (let li = 0; li < leftOrder.length; li++) {
        const ri = Number(mapping[li])
        if (!Number.isInteger(ri) || ri < 0 || ri >= rightOrder.length) return false
        if (leftOrder[li] !== rightOrder[ri]) return false
      }
      return true
    }
    if (q.qtype === 'number') {
      const a = Number(userAnswer)
      const c = Number(q.correctAnswer)
      return !Number.isNaN(a) && !Number.isNaN(c) && a === c
    }
    if (!q.correctAnswer) return null
    return normalize(userAnswer) === normalize(q.correctAnswer)
  }

  // 题目是否设置了明确答案（有答案的题目可自动判定）
  function hasCorrectAnswer(q) {
    if (q.qtype === 'match') {
      return Array.isArray(q.pairs) && q.pairs.length >= 2 &&
        q.pairs.every(p => String(p && p.left || '').trim() && String(p && p.right || '').trim())
    }
    if (q.qtype === 'number') {
      return q.correctAnswer !== '' && q.correctAnswer !== null && q.correctAnswer !== undefined && !Number.isNaN(Number(q.correctAnswer))
    }
    return !!(q.correctAnswer !== undefined && q.correctAnswer !== null && String(q.correctAnswer).trim())
  }

  function makePlayerState() {
    return {
      questions: gameDef.questions.map(q => ({
        ...q,
        shuffledOptions: q.options.length > 0 ? shuffleArray(q.options) : [],
        // 连线题：左右两列分别打乱，答案按原始配对下标校验
        matchLeftOrder: q.qtype === 'match' ? shuffleArray(q.pairs.map((_, i) => i)) : [],
        matchRightOrder: q.qtype === 'match' ? shuffleArray(q.pairs.map((_, i) => i)) : []
      })),
      currentIndex: 0,
      answers: {},          // qid -> { userAnswer, correct, points, submitTime }
      locked: {},           // qid -> true 锁定不可再答
      correctCount: 0,
      score: 0,
      attemptsUsed: 0,
      cooldownUntil: 0,
      startTime: null,
      finishTime: null,
      done: false,
      submissions: []       // 管理员评判模式下的提交记录
    }
  }

  function advanceIndex(ps) {
    let i = ps.currentIndex
    while (i < ps.questions.length) {
      const q = ps.questions[i]
      if (!ps.locked[q.id] && !(ps.answers[q.id] && ps.answers[q.id].correct)) break
      i++
    }
    ps.currentIndex = i
  }

  function isWinAchieved(ps) {
    if (gameDef.winCondition === 'all_correct') return ps.correctCount >= totalQuestions
    if (gameDef.winCondition === 'target_correct') return ps.correctCount >= (gameDef.targetCorrect || 1)
    return false
  }

  function cooldownRemaining(ps) {
    return ps.cooldownUntil > 0 ? Math.max(0, Math.ceil((ps.cooldownUntil - Date.now()) / 1000)) : 0
  }

  function canSubmit(ps) {
    if (maxAttempts > 0 && ps.attemptsUsed >= maxAttempts) return { ok: false, error: '提交次数已用完' }
    if (ps.cooldownUntil > Date.now()) return { ok: false, error: `冷却中，还需 ${cooldownRemaining(ps)} 秒` }
    return { ok: true }
  }

  // 单题反馈（严格执行答错反馈设置，不向选手透露正确答案）
  function singleFeedback(ps, q, correct) {
    const fb = gameDef.wrongFeedback
    // 不告知：不透露本次提交是否正确
    if (fb === 'none') return { submitted: true }
    // 仅全部答对时告知：未全部答对前保持中立
    if (fb === 'all_correct_only') {
      if (ps.correctCount >= totalQuestions) {
        return { correct: true, correctCount: ps.correctCount, totalQuestions }
      }
      return { submitted: true }
    }
    // 告知答对数量（不告知具体题目）
    if (fb === 'count') return { correct, correctCount: ps.correctCount }
    // reveal 及其他：保留原有反馈
    return { correct }
  }

  // 批量反馈（严格执行答错反馈设置，不向选手透露正确答案）
  function batchFeedback(ps, gradedCorrect, gradedCount, wrongAnswers) {
    const fb = gameDef.wrongFeedback
    // 不告知：不透露本次提交中任何题目的对错
    if (fb === 'none') return { submitted: true }
    // 仅全部答对时告知：未全部答对前保持中立
    if (fb === 'all_correct_only') {
      if (ps.correctCount >= totalQuestions) {
        return { correct: true, correctCount: ps.correctCount, totalQuestions }
      }
      return { submitted: true }
    }
    // 告知答对数量（不告知具体题目）
    if (fb === 'count') return { submitted: true, correctCount: ps.correctCount }
    // reveal 及其他：保留原有反馈
    return { correct: gradedCorrect > 0, gradedCorrect, gradedCount, correctCount: ps.correctCount }
  }

  return {
    id: handlerId,
    name: gameDef.name,
    icon: gameDef.icon,
    description: gameDef.description,
    category: 'custom',
    playerCount: gameDef.playerCount,
    duration: gameDef.type === 'score'
      ? gameDef.timeLimit
      : (isAdminJudge ? 600 : Math.max(60, totalQuestions * 20)),

    init(participants) {
      const playerStates = {}
      participants.forEach(p => { playerStates[p.playerId] = makePlayerState() })
      const state = {
        playerStates,
        status: 'ready',
        startTime: null,
        timerEndTime: null,
        timeLimit: gameDef.timeLimit
      }
      return state
    },

    handleAction(state, playerId, action) {
      const ps = state.playerStates[playerId]
      if (!ps) return { updated: false }
      if (!action) return { updated: false }

      if (action.type === 'start') {
        if (!ps.startTime) ps.startTime = Date.now()
        if (!state.startTime) state.startTime = Date.now()
        if (gameDef.type === 'score' && !state.timerEndTime) {
          state.timerEndTime = Date.now() + (gameDef.timeLimit || 120) * 1000
        }
        return { updated: true, finished: false }
      }

      if (ps.done) return { updated: false }

      // 积分模式时间到
      if (gameDef.type === 'score' && state.timerEndTime && Date.now() > state.timerEndTime) {
        return { updated: false, finished: false, result: { error: '时间已到' } }
      }

      // ===== 管理员评判模式：有明确答案的题目自动判定，其余仅记录提交 =====
      if (isAdminJudge) {
        if (action.type !== 'answer' && action.type !== 'submit_all') return { updated: false }
        const c = canSubmit(ps)
        if (!c.ok) return { updated: false, result: { error: c.error } }
        if (!ps.startTime) ps.startTime = Date.now()
        ps.attemptsUsed++
        ps.cooldownUntil = Date.now() + cooldownMs
        const payload = action.type === 'answer'
          ? { [action.questionId]: action.answer }
          : (action.answers || {})
        ps.submissions.push({ answers: payload, submitTime: Date.now() })

        let gradedCorrect = 0
        let gradedCount = 0
        let hasManual = false
        for (const q of ps.questions) {
          if (!(q.id in payload)) continue
          if (ps.locked[q.id]) continue
          if (ps.answers[q.id] && ps.answers[q.id].correct) continue
          if (!hasCorrectAnswer(q)) { hasManual = true; continue }
          const userAnswer = String(payload[q.id] == null ? '' : payload[q.id]).trim()
          const correct = grade(q, userAnswer)
          if (correct === null) { hasManual = true; continue }
          ps.answers[q.id] = { userAnswer, correct, points: correct ? q.points : 0, submitTime: Date.now() }
          gradedCount++
          if (correct) {
            gradedCorrect++
            ps.correctCount++
            ps.score += q.points
          } else if (gameDef.lockOnWrong) {
            ps.locked[q.id] = true
          }
        }

        if (gradedCount > 0 && gradedCorrect < gradedCount) {
          return { updated: true, finished: false, result: { correct: false, gradedCorrect, gradedCount, correctCount: ps.correctCount, pendingManual: hasManual } }
        }
        if (gradedCount > 0 && !hasManual) {
          return { updated: true, finished: false, result: { correct: true, correctCount: ps.correctCount } }
        }
        if (gradedCount > 0 && hasManual) {
          return { updated: true, finished: false, result: { submitted: true, autoGradedCount: gradedCount, correctCount: ps.correctCount } }
        }
        return { updated: true, finished: false, result: { submitted: true } }
      }

      // ===== 批量提交 =====
      if (action.type === 'submit_all' || (submitMode === 'batch' && action.type === 'answer')) {
        const input = action.answers || (action.type === 'answer' ? { [action.questionId]: action.answer } : {})
        const c = canSubmit(ps)
        if (!c.ok) return { updated: false, result: { error: c.error } }
        if (!ps.startTime) ps.startTime = Date.now()
        ps.attemptsUsed++
        ps.cooldownUntil = Date.now() + cooldownMs

        let gradedCorrect = 0
        let gradedCount = 0
        const wrongAnswers = {}
        for (const q of ps.questions) {
          if (ps.locked[q.id]) continue
          if (ps.answers[q.id] && ps.answers[q.id].correct) continue
          if (!(q.id in input)) continue
          const userAnswer = String(input[q.id] == null ? '' : input[q.id]).trim()
          const correct = grade(q, userAnswer)
          gradedCount++
          ps.answers[q.id] = { userAnswer, correct, points: correct ? q.points : 0, submitTime: Date.now() }
          if (correct) {
            gradedCorrect++
            ps.correctCount++
            ps.score += q.points
          } else if (gameDef.lockOnWrong) {
            ps.locked[q.id] = true
          } else {
            wrongAnswers[q.id] = q.correctAnswer
          }
        }

        let finished = false
        if (isWinAchieved(ps)) {
          ps.done = true
          ps.finishTime = Date.now()
          finished = true
        }
        const result = batchFeedback(ps, gradedCorrect, gradedCount, wrongAnswers)
        return { updated: true, finished, winner: finished ? playerId : undefined, result }
      }

      // ===== 单题提交 =====
      if (action.type === 'answer') {
        const q = ps.questions[ps.currentIndex]
        if (!q) return { updated: false, result: { error: '没有更多题目' } }
        if (ps.locked[q.id]) { advanceIndex(ps); return { updated: false, result: { error: '该题已锁定' } } }

        const c = canSubmit(ps)
        if (!c.ok) return { updated: false, result: { error: c.error } }
        if (!ps.startTime) ps.startTime = Date.now()
        ps.attemptsUsed++
        ps.cooldownUntil = Date.now() + cooldownMs

        const userAnswer = String(action.answer == null ? '' : action.answer).trim()
        const correct = grade(q, userAnswer)
        ps.answers[q.id] = { userAnswer, correct, points: correct ? q.points : 0, submitTime: Date.now() }

        if (correct) {
          ps.correctCount++
          ps.score += q.points
          advanceIndex(ps)
          if (isWinAchieved(ps)) {
            ps.done = true
            ps.finishTime = Date.now()
            return { updated: true, finished: true, winner: playerId, result: { correct: true, correctCount: ps.correctCount, totalQuestions } }
          }
          // 首个答对即胜
          if (gameDef.winCondition === 'first_correct') {
            ps.done = true
            ps.finishTime = Date.now()
            return { updated: true, finished: true, winner: playerId, result: { correct: true } }
          }
        } else if (gameDef.lockOnWrong) {
          ps.locked[q.id] = true
          advanceIndex(ps)
        }

        return { updated: true, finished: false, result: singleFeedback(ps, q, correct) }
      }

      return { updated: false }
    },

    computeWinner(state) {
      const wc = gameDef.winCondition
      if (wc === 'highest_score') {
        let best = -Infinity, winner = null
        for (const [pid, ps] of Object.entries(state.playerStates)) {
          if (ps.score > best) { best = ps.score; winner = pid }
        }
        return winner
      }
      if (wc === 'most_correct') {
        let best = -1, winner = null
        for (const [pid, ps] of Object.entries(state.playerStates)) {
          if (ps.correctCount > best) { best = ps.correctCount; winner = pid }
        }
        return winner
      }
      // all_correct / target_correct / first_correct
      for (const [pid, ps] of Object.entries(state.playerStates)) {
        if (ps.done) return pid
      }
      // 退化为答对最多
      let best = -1, winner = null
      for (const [pid, ps] of Object.entries(state.playerStates)) {
        if (ps.correctCount > best) { best = ps.correctCount; winner = pid }
      }
      return winner
    },

    getWinners(state) {
      const wc = gameDef.winCondition
      const out = []
      if (wc === 'highest_score' || wc === 'most_correct') {
        const key = wc === 'highest_score' ? 'score' : 'correctCount'
        let best = -Infinity
        for (const ps of Object.values(state.playerStates)) best = Math.max(best, ps[key])
        if (best === -Infinity) return []
        for (const [pid, ps] of Object.entries(state.playerStates)) {
          if (ps[key] === best) out.push(pid)
        }
        return out
      }
      for (const [pid, ps] of Object.entries(state.playerStates)) {
        if (ps.done) out.push(pid)
      }
      if (out.length === 0) {
        const w = this.computeWinner(state)
        if (w) out.push(w)
      }
      return out
    },

    getState(state, playerId) {
      const ps = state.playerStates[playerId]
      if (!ps) return null

      const base = {
        gameType: gameDef.type,
        winCondition: gameDef.winCondition,
        submitMode,
        questionRelease: releaseSequential ? 'sequential' : 'all',
        wrongFeedback: gameDef.wrongFeedback,
        currentIndex: ps.currentIndex,
        totalQuestions,
        score: ps.score,
        correctCount: ps.correctCount,
        attemptsUsed: ps.attemptsUsed,
        maxAttempts,
        cooldownRemaining: cooldownRemaining(ps),
        startTime: ps.startTime,
        finishTime: ps.finishTime,
        timerEndTime: state.timerEndTime,
        timeLimit: state.timeLimit,
        done: ps.done,
        status: state.status,
        media: gameDef.media || null,
        lastResult: null
      }

      if (submitMode === 'batch' || isAdminJudge) {
        const allCorrect = ps.correctCount >= totalQuestions
        // 仅“告知正确答案”模式下才下发每题对错，避免其他反馈设置泄露结果
        const revealPerQuestion = gameDef.wrongFeedback === 'reveal'
        base.questions = ps.questions.map(q => {
          const rec = ps.answers[q.id]
          const item = {
            id: q.id,
            text: q.text,
            qtype: q.qtype || 'text',
            options: q.qtype === 'choice' ? (q.shuffledOptions || q.options)
              : (q.qtype === 'judge' ? (q.options && q.options.length ? q.options : ['对', '错']) : []),
            points: q.points,
            userAnswer: rec ? rec.userAnswer : '',
            locked: !!ps.locked[q.id],
            media: q.media || null
          }
          if (q.qtype === 'match') {
            item.leftItems = (q.matchLeftOrder || []).map(i => (q.pairs[i] ? q.pairs[i].left : ''))
            item.rightItems = (q.matchRightOrder || []).map(i => (q.pairs[i] ? q.pairs[i].right : ''))
          }
          if (revealPerQuestion) item.correct = rec ? !!rec.correct : false
          return item
        })
      } else {
        const q = ps.currentIndex < ps.questions.length ? ps.questions[ps.currentIndex] : null
        const current = q ? {
          id: q.id,
          text: q.text,
          qtype: q.qtype || 'text',
          options: q.qtype === 'choice' ? (q.shuffledOptions || q.options)
            : (q.qtype === 'judge' ? (q.options && q.options.length ? q.options : ['对', '错']) : []),
          points: q.points,
          media: q.media || null
        } : null
        if (current && q && q.qtype === 'match') {
          current.leftItems = (q.matchLeftOrder || []).map(i => (q.pairs[i] ? q.pairs[i].left : ''))
          current.rightItems = (q.matchRightOrder || []).map(i => (q.pairs[i] ? q.pairs[i].right : ''))
        }
        base.currentQuestion = current
      }

      return base
    },

    getAllStates(state) {
      const result = {}
      for (const [pid, ps] of Object.entries(state.playerStates)) {
        const done = ps.done
        result[pid] = {
          score: gameDef.type === 'score' ? ps.score : ps.correctCount,
          progress: ps.correctCount,
          max: totalQuestions,
          done,
          label: isAdminJudge
                ? `已提交 ${ps.submissions.length} 次`
                : (gameDef.type === 'score'
                    ? `得分 ${ps.score} (对${ps.correctCount}/${totalQuestions})`
                    : `答对 ${ps.correctCount}/${totalQuestions}`),
          cooldownRemaining: cooldownRemaining(ps),
          attemptsUsed: ps.attemptsUsed,
          submissions: isAdminJudge ? ps.submissions : undefined
        }
      }
      return result
    },

    checkTarget(state, playerId) {
      const ps = state.playerStates[playerId]
      if (!ps) return false
      if (isAdminJudge) return false
      // 仅“全部答对/答对指定数量”达成即结束；积分/最多答对等待时间或全部完成
      if (gameDef.winCondition === 'all_correct' || gameDef.winCondition === 'target_correct') {
        return !!ps.done
      }
      return false
    },

    getReplayMeta(state) {
      const players = {}
      for (const [pid, ps] of Object.entries(state.playerStates)) {
        players[pid] = {
          score: ps.score,
          correctCount: ps.correctCount,
          done: ps.done,
          answers: (ps.questions || []).map(q => {
            const a = ps.answers[q.id]
            return {
              qid: q.id,
              text: q.text,
              qtype: q.qtype,
              options: q.qtype === 'choice' ? (q.options || []) : [],
              correctAnswer: q.qtype === 'match'
                ? (q.pairs || []).map(p => `${p.left} → ${p.right}`).join('；')
                : q.correctAnswer,
              pairs: q.pairs || [],
              media: q.media || null,
              userAnswer: a ? a.userAnswer : null,
              correct: a ? a.correct : null
            }
          }),
          submissions: ps.submissions || []
        }
      }
      return {
        type: 'custom',
        gameType: gameDef.type,
        winCondition: gameDef.winCondition,
        questions: gameDef.questions.map(q => ({
          id: q.id,
          text: q.text,
          qtype: q.qtype,
          options: q.options || [],
          correctAnswer: q.qtype === 'match'
            ? (q.pairs || []).map(p => `${p.left} → ${p.right}`).join('；')
            : q.correctAnswer,
          pairs: q.pairs || [],
          media: q.media || null
        })),
        players
      }
    }
  }
}

module.exports = {
  loadCustomGame,
  clearCustomGameCache,
  createCustomGameHandler,
  getCustomHandlerId,
  getGameIdFromHandler
}
