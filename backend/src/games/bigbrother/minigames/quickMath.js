/**
 * 快速算术 (Quick Math)
 * 规则：完成10道两位数加减法，记录总用时，用时最短者获胜
 * 服务端生成题目，答案由服务端校验
 */
const { registerGame } = require('./index')

const TOTAL_QUESTIONS = 10

function generateQuestion() {
  const a = Math.floor(Math.random() * 50) + 10  // 10-59
  const b = Math.floor(Math.random() * 50) + 10  // 10-59
  const op = Math.random() > 0.5 ? '+' : '-'
  const expression = `${a} ${op} ${b}`
  const answer = op === '+' ? a + b : a - b
  return { expression, answer }
}

function generateQuestions() {
  const questions = []
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    questions.push(generateQuestion())
  }
  return questions
}

registerGame({
  id: 'quick-math',
  name: '快速算术',
  icon: '🧮',
  description: '完成10道两位数加减法，用时最短者获胜',
  category: 'intellect',
  playerCount: { min: 2, max: 20 },
  duration: 120,

  init(participants) {
    const playerStates = {}
    participants.forEach(p => {
      playerStates[p.playerId] = {
        questions: generateQuestions(),
        currentIndex: 0,
        answers: [],         // 用户答案记录
        startTime: null,
        finishTime: null
      }
    })
    return { playerStates, status: 'ready' }
  },

  handleAction(state, playerId, action) {
    const ps = state.playerStates[playerId]
    if (!ps) return { updated: false }

    if (action.type === 'answer') {
      if (!ps.startTime) ps.startTime = Date.now()
      if (ps.currentIndex >= TOTAL_QUESTIONS) return { updated: false }

      const q = ps.questions[ps.currentIndex]
      const userAnswer = parseInt(action.answer, 10)
      if (isNaN(userAnswer)) return { updated: false }

      const correct = userAnswer === q.answer
      ps.answers.push({ question: q.expression, userAnswer, correctAnswer: q.answer, correct })

      if (correct) {
        ps.currentIndex++
        if (ps.currentIndex >= TOTAL_QUESTIONS) {
          ps.finishTime = ps.finishTime || Date.now()
          const allFinished = Object.values(state.playerStates).every(
            s => s.currentIndex >= TOTAL_QUESTIONS
          )
          if (allFinished) {
            return { updated: true, finished: true, winner: this.computeWinner(state) }
          }
        }
      }
      return { updated: true, finished: false, result: { correct, correctAnswer: q.answer } }
    }

    return { updated: false }
  },

  computeWinner(state) {
    let bestTime = Infinity
    let winner = null
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      if (ps.finishTime && ps.startTime) {
        const duration = ps.finishTime - ps.startTime
        if (duration < bestTime) {
          bestTime = duration
          winner = pid
        }
      }
    }
    return winner
  },

  getState(state, playerId) {
    const ps = state.playerStates[playerId]
    if (!ps) return null
    return {
      currentQuestion: ps.currentIndex < TOTAL_QUESTIONS ? ps.questions[ps.currentIndex].expression : null,
      currentIndex: ps.currentIndex,
      totalQuestions: TOTAL_QUESTIONS,
      startTime: ps.startTime,
      finishTime: ps.finishTime,
      lastResult: ps.answers.length > 0 ? ps.answers[ps.answers.length - 1] : null,
      status: state.status
    }
  }
})
