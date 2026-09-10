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
  const handlerId = getCustomHandlerId(gameDef.id)
  const isAdminJudge = gameDef.winCondition === 'admin_judge'
  const submitMode = gameDef.submitMode || 'single'
  const cooldownMs = (gameDef.cooldownSeconds || 0) * 1000
  const maxAttempts = gameDef.maxAttempts || 0
  const totalQuestions = gameDef.questions.length

  // 单题：与正确答案比较；无答案（管理员评判）返回 null
  function grade(q, userAnswer) {
    if (!q.correctAnswer) return null
    return normalize(userAnswer) === normalize(q.correctAnswer)
  }

  function makePlayerState() {
    return {
      questions: gameDef.questions.map(q => ({
        ...q,
        shuffledOptions: q.options.length > 0 ? shuffleArray(q.options) : []
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

  // 单题反馈
  function singleFeedback(ps, q, correct) {
    const out = { correct }
    if (correct) return out
    const fb = gameDef.wrongFeedback
    if (fb === 'reveal') out.correctAnswer = q.correctAnswer
    else if (fb === 'count') out.correctCount = ps.correctCount
    // none / all_correct_only 不额外告知
    return out
  }

  // 批量反馈
  function batchFeedback(ps, gradedCorrect, gradedCount, wrongAnswers) {
    const out = { correct: gradedCorrect > 0, gradedCorrect, gradedCount, correctCount: ps.correctCount }
    const fb = gameDef.wrongFeedback
    const allCorrect = ps.correctCount >= totalQuestions
    if (fb === 'reveal') {
      out.correctAnswers = wrongAnswers
    } else if (fb === 'count') {
      // 保留 gradedCorrect / correctCount
    } else if (fb === 'all_correct_only') {
      if (allCorrect) out.correctAnswers = wrongAnswers
    }
    return out
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

      // ===== 管理员评判模式：仅记录提交，不判定 =====
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
        lastResult: null
      }

      if (submitMode === 'batch' || isAdminJudge) {
        const allCorrect = ps.correctCount >= totalQuestions
        const canReveal = gameDef.wrongFeedback === 'reveal' ||
          (gameDef.wrongFeedback === 'all_correct_only' && allCorrect)
        base.questions = ps.questions.map(q => {
          const rec = ps.answers[q.id]
          const revealed = canReveal && (allCorrect || (rec && rec.correct === false))
          return {
            id: q.id,
            text: q.text,
            options: q.shuffledOptions || q.options,
            points: q.points,
            userAnswer: rec ? rec.userAnswer : '',
            correct: rec ? !!rec.correct : false,
            locked: !!ps.locked[q.id],
            correctAnswer: revealed ? q.correctAnswer : undefined
          }
        })
      } else {
        const q = ps.currentIndex < ps.questions.length ? ps.questions[ps.currentIndex] : null
        base.currentQuestion = q ? {
          id: q.id,
          text: q.text,
          options: q.shuffledOptions || q.options,
          points: q.points
        } : null
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
