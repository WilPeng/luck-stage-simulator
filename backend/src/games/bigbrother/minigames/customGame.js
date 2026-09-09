/**
 * 自定义游戏处理器
 * 将 BBCustomGame 文档包装为与内置游戏相同接口的 handler
 * 支持两种模式：
 *   - quiz: 答题模式，首个答对即胜 / 答对最多者胜
 *   - score: 积分模式，限时得分最高者胜，同分比提交时间
 */
const BBCustomGame = require('../models/BBCustomGame')

// 缓存已加载的游戏定义（内存，重启失效）
const customGameCache = new Map()

async function loadCustomGame(gameId) {
  if (customGameCache.has(gameId)) {
    return customGameCache.get(gameId)
  }
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

/**
 * 为自定义游戏生成唯一 handler ID
 */
function getCustomHandlerId(gameId) {
  return `custom-${gameId}`
}

/**
 * 从 handler ID 还原原始 gameId
 */
function getGameIdFromHandler(handlerId) {
  return handlerId.replace(/^custom-/, '')
}

/**
 * 创建自定义游戏 handler（符合 minigame handler 接口）
 * @param {Object} gameDef - BBCustomGame 文档对象（toObject 后）
 * @returns {Object} handler
 */
function createCustomGameHandler(gameDef) {
  const handlerId = getCustomHandlerId(gameDef.id)

  // 预处理题目：打乱顺序（如果需要）
  function shuffleArray(arr) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  function shuffleQuestions(questions) {
    return shuffleArray(questions)
  }

  return {
    id: handlerId,
    name: gameDef.name,
    icon: gameDef.icon,
    description: gameDef.description,
    category: 'custom',
    playerCount: gameDef.playerCount,
    duration: gameDef.type === 'score' ? gameDef.timeLimit : Math.max(60, gameDef.questions.length * 15),

    init(participants) {
      const playerStates = {}
      const shuffled = shuffleQuestions(gameDef.questions)

      participants.forEach(p => {
        const questions = gameDef.type === 'score'
          ? shuffled // 积分模式：所有选手看相同顺序（或可改为每人不同）
          : shuffleQuestions(gameDef.questions) // 答题模式：每人不同顺序

        playerStates[p.playerId] = {
          questions: questions.map(q => ({
            ...q,
            // 选择题打乱选项
            shuffledOptions: q.options.length > 0 ? shuffleArray(q.options) : []
          })),
          currentIndex: 0,
          score: 0,
          correctCount: 0,
          answers: [],           // [{ questionId, userAnswer, correct, points, submitTime }]
          cooldownUntil: 0,      // 冷却截止时间戳
          wrongCount: 0,         // 当前题连续答错次数（用于冷却）
          startTime: null,
          finishTime: null
        }
      })

      // 积分模式的全局计时器
      const state = {
        playerStates,
        status: 'ready',
        startTime: null,
        timeLimit: gameDef.timeLimit,
        timerEndTime: null // 积分模式的时间终止时间戳
      }

      if (gameDef.type === 'score') {
        state.timerEndTime = null // 在 start 时设置
      }

      return state
    },

    handleAction(state, playerId, action) {
      const ps = state.playerStates[playerId]
      if (!ps) return { updated: false }

      if (action.type === 'start') {
        // 标记开始时间
        if (!ps.startTime) ps.startTime = Date.now()
        if (!state.startTime) state.startTime = Date.now()

        // 积分模式：设置全局结束时间
        if (gameDef.type === 'score' && !state.timerEndTime) {
          state.timerEndTime = Date.now() + gameDef.timeLimit * 1000
        }
        return { updated: true, finished: false }
      }

      if (action.type === 'submit_answer') {
        if (!ps.startTime) ps.startTime = Date.now()
        if (!state.startTime) state.startTime = Date.now()

        // 积分模式：检查时间是否已到
        if (gameDef.type === 'score' && state.timerEndTime && Date.now() > state.timerEndTime) {
          return { updated: false, finished: false, result: { error: '时间已到' } }
        }

        // 检查是否在冷却中
        if (ps.cooldownUntil > 0 && Date.now() < ps.cooldownUntil) {
          const remainSec = Math.ceil((ps.cooldownUntil - Date.now()) / 1000)
          return { updated: false, finished: false, result: { error: `冷却中，还需 ${remainSec} 秒` } }
        }

        // 检查是否还有题目
        if (ps.currentIndex >= ps.questions.length) {
          return { updated: false, finished: false, result: { error: '已无更多题目' } }
        }

        const q = ps.questions[ps.currentIndex]
        const userAnswer = (action.answer || '').trim()
        const correct = userAnswer.toLowerCase() === q.correctAnswer.trim().toLowerCase()

        const points = correct ? (q.points || 1) : 0
        const submitTime = Date.now()

        ps.answers.push({
          questionId: q.id,
          userAnswer,
          correctAnswer: q.correctAnswer,
          correct,
          points,
          submitTime
        })

        if (correct) {
          ps.score += points
          ps.correctCount++
          ps.currentIndex++
          ps.wrongCount = 0
          ps.cooldownUntil = 0

          // 答题模式 - 首个答对即胜
          if (gameDef.type === 'quiz' && gameDef.winCondition === 'first_correct') {
            ps.finishTime = Date.now()
            return { updated: true, finished: true, winner: playerId, result: { correct, points, correctAnswer: q.correctAnswer } }
          }
        } else {
          ps.wrongCount++
          // 答题模式 - 答错冷却
          if (gameDef.type === 'quiz' && gameDef.cooldownSeconds > 0) {
            ps.cooldownUntil = Date.now() + gameDef.cooldownSeconds * 1000
          }
          // 积分模式 - 答错不扣分，直接下一题
        }

        // 检查是否所有题目答完
        if (ps.currentIndex >= ps.questions.length) {
          ps.finishTime = Date.now()

          // 如果是积分模式，检查时间是否也到了
          if (gameDef.type === 'score') {
            const allDone = Object.values(state.playerStates).every(s => s.currentIndex >= s.questions.length)
            const timeUp = state.timerEndTime && Date.now() >= state.timerEndTime
            if (allDone || timeUp) {
              return { updated: true, finished: true, winner: this.computeWinner(state), result: { correct, points, correctAnswer: q.correctAnswer } }
            }
          } else {
            // 答题模式 - most_correct：检查是否所有人都完成
            const allDone = Object.values(state.playerStates).every(s => s.currentIndex >= s.questions.length)
            if (allDone) {
              return { updated: true, finished: true, winner: this.computeWinner(state), result: { correct, points, correctAnswer: q.correctAnswer } }
            }
          }
        }

        return { updated: true, finished: false, result: { correct, points, correctAnswer: q.correctAnswer } }
      }

      return { updated: false }
    },

    computeWinner(state) {
      let bestScore = -1
      let bestTime = Infinity
      let winner = null

      for (const [pid, ps] of Object.entries(state.playerStates)) {
        let isBetter = false
        if (ps.score > bestScore) {
          isBetter = true
        } else if (ps.score === bestScore) {
          // 同分比最后一次答对的时间（越早越好）
          const lastCorrect = ps.answers.filter(a => a.correct).pop()
          const time = lastCorrect ? lastCorrect.submitTime : Infinity
          if (time < bestTime) {
            isBetter = true
          }
        }
        if (isBetter) {
          bestScore = ps.score
          bestTime = ps.answers.filter(a => a.correct).pop()?.submitTime || Infinity
          winner = pid
        }
      }

      return winner
    },

    getState(state, playerId) {
      const ps = state.playerStates[playerId]
      if (!ps) return null

      const currentQ = ps.currentIndex < ps.questions.length ? ps.questions[ps.currentIndex] : null
      const cooldownRemaining = ps.cooldownUntil > 0 ? Math.max(0, Math.ceil((ps.cooldownUntil - Date.now()) / 1000)) : 0

      return {
        gameType: gameDef.type,
        currentQuestion: currentQ ? {
          id: currentQ.id,
          text: currentQ.text,
          options: currentQ.shuffledOptions || currentQ.options,
          points: currentQ.points
        } : null,
        currentIndex: ps.currentIndex,
        totalQuestions: ps.questions.length,
        score: ps.score,
        correctCount: ps.correctCount,
        cooldownRemaining,
        startTime: ps.startTime,
        finishTime: ps.finishTime,
        lastResult: ps.answers.length > 0 ? ps.answers[ps.answers.length - 1] : null,
        // 积分模式的全局计时器
        timerEndTime: state.timerEndTime,
        timeLimit: state.timeLimit,
        status: state.status
      }
    },

    getAllStates(state) {
      const result = {}
      for (const [pid, ps] of Object.entries(state.playerStates)) {
        const done = ps.currentIndex >= ps.questions.length
        const cooldownRemaining = ps.cooldownUntil > 0 ? Math.max(0, Math.ceil((ps.cooldownUntil - Date.now()) / 1000)) : 0
        result[pid] = {
          score: ps.score,
          progress: ps.currentIndex,
          max: ps.questions.length,
          done,
          label: `得分 ${ps.score} (${ps.correctCount}/${ps.currentIndex}/${ps.questions.length})`,
          cooldownRemaining
        }
      }
      return result
    },

    // 目标判定
    checkTarget(state, playerId, targetScore) {
      const ps = state.playerStates[playerId]
      if (!ps) return false
      if (!targetScore || targetScore <= 0) return ps.currentIndex >= ps.questions.length
      return ps.score >= targetScore
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
