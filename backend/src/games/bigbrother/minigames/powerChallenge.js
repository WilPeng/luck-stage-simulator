const { registerGame } = require('./index')
const BBPowerChallenge = require('../models/BBPowerChallenge')

/**
 * 实力大挑战
 * 规则：每轮放出 (在线人数-1) 道题，每题最先答对的玩家占领一个晋级名额。
 * 全程 WebSocket 实时。
 */

async function loadLatestPool() {
  try {
    const docs = await BBPowerChallenge.find({ gameId: 'bigbrother', enabled: true })
    if (docs.length === 0) return null
    docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    return docs[0].toObject()
  } catch (e) {
    console.error('[PowerChallenge] Failed to load pool:', e)
    return null
  }
}

registerGame({
  id: 'power-challenge',
  name: '实力大挑战',
  icon: '💪',
  description: '每轮(N-1)题，先答对者占领晋级名额',
  category: 'intellect',
  playerCount: { min: 2, max: 20 },
  duration: 180,

  async loadQuestions() {
    return loadLatestPool()
  },

  init(participants, pool) {
    if (!pool || !pool.questions || pool.questions.length === 0) {
      return { status: 'error', error: '题目池为空', questions: [], questionWinners: {}, winners: [], participants: [] }
    }
    const onlineCount = participants.length
    const neededQuestions = Math.max(1, onlineCount - 1)
    const shuffled = [...pool.questions].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, Math.min(neededQuestions, shuffled.length))
    const playerStates = {}
    for (const p of participants) {
      playerStates[p.playerId] = { answeredQuestions: [], score: 0 }
    }
    return {
      status: 'ready',
      theme: pool.theme || '实力大挑战',
      poolId: pool.id,
      poolName: pool.name,
      questions: selected,
      questionWinners: {},
      winners: [],
      participants: participants.map(p => ({ playerId: p.playerId, playerName: p.playerName }))
    }
  },

  handleAction(state, playerId, action) {
    if (!state || !state.questions || !state.questionWinners) return { updated: false }
    if (state.status !== 'playing') return { updated: false }
    if (!action || action.type !== 'answer') return { updated: false }

    const { questionId, selectedOption } = action
    const question = state.questions.find(q => q.id === questionId)
    if (!question) return { updated: false }

    // 已有人答对此题
    if (state.questionWinners[questionId]) return { updated: false }

    const isCorrect = question.correctAnswer === selectedOption
    const participant = (state.participants || []).find(p => p.playerId === playerId)
    const playerName = participant?.playerName || playerId

    if (isCorrect) {
      state.questionWinners[questionId] = { playerId, playerName }
      state.winners.push({ playerId, playerName, questionId })
      const allAnswered = state.questions.every(q => state.questionWinners[q.id])
      return { updated: true, finished: allAnswered, winner: playerId, result: { correct: true, questionId } }
    }

    return { updated: true, finished: false, result: { correct: false, questionId } }
  },

  computeWinner(state) {
    if (!state || !state.winners || state.winners.length === 0) return null
    return state.winners[0].playerId
  },

  getWinners(state) {
    if (!state || !state.winners) return []
    return state.winners.map(w => ({ playerId: w.playerId, playerName: w.playerName }))
  },

  getState(state, playerId) {
    if (!state) return null
    const answeredIds = Object.keys(state.questionWinners || {})
    const myQuestions = state.questions ? state.questions.map(q => ({
      id: q.id,
      text: q.text,
      options: q.options,
      questionId: q.id,
      answered: answeredIds.includes(q.id),
      winner: state.questionWinners[q.id] || null
    })) : []
    return {
      theme: state.theme,
      questions: myQuestions,
      winners: state.winners || [],
      questionWinners: state.questionWinners || {},
      status: state.status,
      myAnsweredQuestions: (state.playerStates?.[playerId]?.answeredQuestions) || []
    }
  },

  getAllStates(state) {
    const result = {}
    for (const [pid, ps] of Object.entries(state?.playerStates || {})) {
      result[pid] = { score: ps?.score || 0, done: false, label: `${ps?.score || 0}题已占领` }
    }
    for (const w of state?.winners || []) {
      if (!result[w.playerId]) result[w.playerId] = { score: 0, done: false }
      result[w.playerId].score += 1
      result[w.playerId].label = `${result[w.playerId].score}题已占领`
    }
    return result
  },

  checkTarget() {
    return false
  }
})
