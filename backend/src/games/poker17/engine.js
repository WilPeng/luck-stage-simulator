'use strict'

/**
 * 17 Poker (17扑克) — pure game engine.
 *
 * The engine is intentionally framework-free so it can be unit tested and so
 * every state transition happens on the server. It never exposes the deck or
 * the opponent's hand through the per-player serializer.
 */

const INITIAL_CHIPS = 100
const ANTE = 5
const TOTAL_ROUNDS = 10
const MAX_EXCHANGE_TOTAL = 7
const MAX_EXCHANGE_PER_PLAYER = 5
const ROUND1_MIN = 5
const ROUND1_MAX = 15
const ROUND2_MAX = 30
const RESULT_DELAY_MS = 8000

const SUITS = ['♠', '♥', '♣', '♦']
const NATURAL_RANKS = [
  { rank: 'A', value: 14 },
  { rank: 'K', value: 13 },
  { rank: 'Q', value: 12 },
  { rank: 'J', value: 11 }
]

const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FULL_HOUSE: 5,
  FOUR_OF_A_KIND: 6,
  STRAIGHT_FLUSH: 7,
  FIVE_OF_A_KIND: 8
}

const CATEGORY_NAME = {
  [CATEGORY.HIGH_CARD]: '高牌',
  [CATEGORY.PAIR]: '一对',
  [CATEGORY.TWO_PAIR]: '两对',
  [CATEGORY.THREE_OF_A_KIND]: '三条',
  [CATEGORY.STRAIGHT]: '顺子',
  [CATEGORY.FULL_HOUSE]: '葫芦',
  [CATEGORY.FOUR_OF_A_KIND]: '四条',
  [CATEGORY.STRAIGHT_FLUSH]: '同花顺',
  [CATEGORY.FIVE_OF_A_KIND]: '五条'
}

const CATEGORY_NAME_EN = {
  [CATEGORY.HIGH_CARD]: 'High Card',
  [CATEGORY.PAIR]: 'One Pair',
  [CATEGORY.TWO_PAIR]: 'Two Pair',
  [CATEGORY.THREE_OF_A_KIND]: 'Three of a Kind',
  [CATEGORY.STRAIGHT]: 'Straight',
  [CATEGORY.FULL_HOUSE]: 'Full House',
  [CATEGORY.FOUR_OF_A_KIND]: 'Four of a Kind',
  [CATEGORY.STRAIGHT_FLUSH]: 'Straight Flush',
  [CATEGORY.FIVE_OF_A_KIND]: 'Five of a Kind'
}

const PHASE_LABEL = {
  cut: '切牌',
  bet1: '第一轮下注',
  exchange: '换牌',
  bet2: '第二轮下注',
  round_result: '本局结算',
  match_over: '比赛结束'
}

function makeCard(rank, suit, value) {
  return {
    id: `${rank}${suit}`,
    rank,
    suit,
    value,
    joker: false,
    label: `${rank}${suit}`,
    color: suit === '♥' || suit === '♦' ? 'red' : 'black'
  }
}

function makeJoker() {
  return {
    id: 'JOKER',
    rank: 'JOKER',
    suit: null,
    value: null,
    joker: true,
    label: 'Joker',
    color: 'purple'
  }
}

function buildDeck() {
  const deck = []
  for (const { rank, value } of NATURAL_RANKS) {
    for (const suit of SUITS) deck.push(makeCard(rank, suit, value))
  }
  deck.push(makeJoker())
  return deck
}

function shuffleDeck(deck, rng = Math.random) {
  const out = deck.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function cutDeck(deck, position) {
  const n = deck.length
  if (!n) return []
  let p = Math.trunc(Number(position))
  if (!Number.isFinite(p)) p = 0
  p = ((p % n) + n) % n
  return deck.slice(p).concat(deck.slice(0, p))
}

function cardLabel(card) {
  if (!card) return ''
  if (card.joker) return 'Joker'
  return `${card.rank}${card.suit || ''}`
}

// ===== Hand evaluation =====

function compareScore(a, b) {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const av = a[i] || 0
    const bv = b[i] || 0
    if (av !== bv) return av > bv ? 1 : -1
  }
  return 0
}

function compareHands(a, b) {
  return compareScore(a.score, b.score)
}

function groupValues(cards) {
  const counts = new Map()
  for (const card of cards) counts.set(card.value, (counts.get(card.value) || 0) + 1)
  const groups = Array.from(counts.entries()).map(([value, count]) => ({ value, count }))
  groups.sort((a, b) => (b.count - a.count) || (b.value - a.value))
  return groups
}

function evaluateNatural(cards) {
  const values = cards.map(c => c.value).sort((a, b) => b - a)
  const suits = cards.map(c => c.suit)
  const unique = Array.from(new Set(values)).sort((a, b) => b - a)
  const groups = groupValues(cards)
  const isFlush = suits.every(s => s === suits[0])
  const isStraight = unique.length === 5 && unique[0] - unique[4] === 4
  const highest = unique[0]

  let category = CATEGORY.HIGH_CARD
  let tiebreak = values.slice()

  if (groups[0] && groups[0].count === 5) {
    category = CATEGORY.FIVE_OF_A_KIND
    tiebreak = [groups[0].value]
  } else if (isStraight && isFlush) {
    category = CATEGORY.STRAIGHT_FLUSH
    tiebreak = [highest]
  } else if (groups[0] && groups[0].count === 4) {
    category = CATEGORY.FOUR_OF_A_KIND
    tiebreak = [groups[0].value, groups[1] ? groups[1].value : 0]
  } else if (groups[0] && groups[0].count === 3 && groups[1] && groups[1].count === 2) {
    category = CATEGORY.FULL_HOUSE
    tiebreak = [groups[0].value, groups[1].value]
  } else if (isStraight) {
    category = CATEGORY.STRAIGHT
    tiebreak = [highest]
  } else if (groups[0] && groups[0].count === 3) {
    category = CATEGORY.THREE_OF_A_KIND
    tiebreak = [groups[0].value]
      .concat(groups.slice(1).map(g => g.value).sort((a, b) => b - a))
  } else if (groups[0] && groups[0].count === 2 && groups[1] && groups[1].count === 2) {
    category = CATEGORY.TWO_PAIR
    const pairs = [groups[0].value, groups[1].value].sort((a, b) => b - a)
    const kicker = groups[2] ? groups[2].value : 0
    tiebreak = [pairs[0], pairs[1], kicker]
  } else if (groups[0] && groups[0].count === 2) {
    category = CATEGORY.PAIR
    tiebreak = [groups[0].value]
      .concat(groups.slice(1).map(g => g.value).sort((a, b) => b - a))
  }

  return {
    category,
    categoryName: CATEGORY_NAME[category],
    categoryNameEn: CATEGORY_NAME_EN[category],
    score: [category, ...tiebreak],
    tiebreak,
    values,
    suits,
    isFlush,
    isStraight
  }
}

function* jokerAssignments(count) {
  if (count <= 0) {
    yield []
    return
  }
  const options = []
  for (const value of [14, 13, 12, 11, 10]) {
    for (const suit of SUITS) {
      options.push({ value, suit, rank: value === 14 ? 'A' : value === 13 ? 'K' : value === 12 ? 'Q' : value === 11 ? 'J' : '10' })
    }
  }
  if (count === 1) {
    for (const option of options) yield [option]
    return
  }
  // The real deck only contains one Joker; support two for safety, cap the rest.
  const limit = Math.min(count, 2)
  const combos = [[]]
  for (let i = 0; i < limit; i++) {
    const next = []
    for (const combo of combos) {
      for (const option of options) {
        next.push(combo.concat([option]))
        if (next.length > 5000) break
      }
      if (next.length > 5000) break
    }
    combos.length = 0
    combos.push(...next)
    if (combos.length > 5000) break
  }
  for (const combo of combos) {
    while (combo.length < count) combo.push({ value: 10, suit: '♠', rank: '10' })
    yield combo
  }
}

function evaluateHand(hand) {
  const cards = Array.isArray(hand) ? hand : []
  const jokers = cards.filter(c => c.joker)
  const naturals = cards.filter(c => !c.joker)

  let best = null
  let bestAssignment = null
  for (const assignment of jokerAssignments(jokers.length)) {
    let nextJoker = 0
    const concrete = cards.map(card => {
      if (card.joker) {
        const assigned = assignment[nextJoker++] || { value: 10, suit: '♠', rank: '10' }
        return {
          id: 'JOKER',
          rank: assigned.rank,
          value: assigned.value,
          suit: assigned.suit,
          joker: false,
          virtual: true,
          label: `${assigned.rank}${assigned.suit}`,
          color: assigned.suit === '♥' || assigned.suit === '♦' ? 'red' : 'black'
        }
      }
      return card
    })
    const ev = evaluateNatural(concrete)
    if (!best || compareScore(ev.score, best.score) > 0) {
      best = ev
      bestAssignment = assignment
    }
  }

  if (!best) {
    return {
      category: CATEGORY.HIGH_CARD,
      categoryName: CATEGORY_NAME[CATEGORY.HIGH_CARD],
      categoryNameEn: CATEGORY_NAME_EN[CATEGORY.HIGH_CARD],
      score: [CATEGORY.HIGH_CARD],
      tiebreak: [],
      values: [],
      suits: [],
      isFlush: false,
      isStraight: false,
      jokerAs: []
    }
  }

  const jokerAs = []
  let jokerIndex = 0
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].joker) {
      const assigned = bestAssignment && bestAssignment[jokerIndex]
        ? bestAssignment[jokerIndex]
        : { value: 10, suit: '♠', rank: '10' }
      jokerAs.push({
        index: i,
        value: assigned.value,
        rank: assigned.rank,
        suit: assigned.suit,
        label: `${assigned.rank}${assigned.suit}`
      })
      jokerIndex++
    }
  }

  return {
    ...best,
    jokerAs,
    highlightIndices: cards.map((_, index) => index)
  }
}

// ===== Match / round state =====

function makeIdFactory() {
  let used = new Set()
  return (raw, index) => {
    let id = raw == null || raw === '' ? `player-${index + 1}` : String(raw)
    while (used.has(id)) id = `${id}-${index + 1}`
    used.add(id)
    return id
  }
}

function getPlayer(state, playerId) {
  return state.players.find(p => p.id === playerId) || null
}

function otherId(state, playerId) {
  const index = state.players.findIndex(p => p.id === playerId)
  if (index < 0) return null
  return state.players[(index + 1) % state.players.length].id
}

function otherPlayer(state, playerId) {
  return getPlayer(state, otherId(state, playerId))
}

function initialRoundFields(state) {
  state.deck = []
  state.discard = []
  state.cutDone = {}
  state.cuts = {}
  state.antePaid = {}
  state.antePot = 0
  state.betPot = 0
  state.round1 = {}
  state.round2 = {}
  state.round1Matched = 0
  state.currentBet = 0
  state.exchangedTotal = 0
  state.exchangeDone = {}
  state.exchangeCounts = {}
  state.exchangeOrder = []
  state.exchangeTurn = null
  state.turn = null
  state.lastAggressor = null
  state.checked = {}
  state.checkCount = 0
  state.resultEndsAt = null
  state.lastResult = null
  for (const p of state.players) {
    p.hand = []
    state.round1[p.id] = 0
    state.round2[p.id] = 0
    state.cutDone[p.id] = false
    state.antePaid[p.id] = 0
    state.exchangeDone[p.id] = false
    state.exchangeCounts[p.id] = 0
    state.roundStartChips[p.id] = p.chips
  }
}

function startRound(state, round) {
  state.round = round
  state.phase = 'cut'
  state.firstActor = state.players[(round - 1) % state.players.length].id
  initialRoundFields(state)
  state.deck = shuffleDeck(buildDeck())
}

function createMatch(participants, options = {}) {
  const roster = Array.isArray(participants) ? participants.slice(0, 2) : []
  if (roster.length !== 2) throw new Error('17 Poker 需要正好 2 名玩家')

  const makeId = makeIdFactory()
  const players = roster.map((p, index) => ({
    id: makeId(p && (p.playerId != null ? p.playerId : p.id), index),
    name: (p && (p.playerName || p.name)) || `玩家${index + 1}`,
    avatar: (p && p.avatar) || null,
    seat: index,
    chips: INITIAL_CHIPS,
    hand: []
  }))

  const state = {
    gameId: 'poker17',
    status: 'playing',
    createdAt: Date.now(),
    initialChips: INITIAL_CHIPS,
    ante: ANTE,
    totalRounds: TOTAL_ROUNDS,
    players,
    chips: {},
    scores: {},
    roundStartChips: {},
    round: 0,
    phase: 'cut',
    firstActor: null,
    deck: [],
    discard: [],
    cutDone: {},
    cuts: {},
    antePaid: {},
    antePot: 0,
    betPot: 0,
    dealerCollected: 0,
    round1: {},
    round2: {},
    round1Matched: 0,
    currentBet: 0,
    exchangedTotal: 0,
    exchangeDone: {},
    exchangeCounts: {},
    exchangeOrder: [],
    exchangeTurn: null,
    turn: null,
    lastAggressor: null,
    checked: {},
    checkCount: 0,
    resultEndsAt: null,
    lastResult: null,
    history: [],
    matchOver: false,
    finalResult: null,
    pendingEvents: [],
    options: options || {}
  }

  for (const p of players) {
    state.chips[p.id] = p.chips
    state.scores[p.id] = p.chips
    state.roundStartChips[p.id] = p.chips
  }

  startRound(state, 1)
  return state
}

function payAnte(state, playerId) {
  const p = getPlayer(state, playerId)
  if (!p) return 0
  const paid = Math.max(0, Math.min(ANTE, p.chips))
  p.chips -= paid
  state.chips[p.id] = p.chips
  state.scores[p.id] = p.chips
  state.antePaid[p.id] = paid
  state.antePot += paid
  return paid
}

function dealAndAnte(state) {
  // Deal alternately, five cards each. The final seven cards form the exchange deck.
  for (let i = 0; i < 5; i++) {
    for (const p of state.players) {
      if (state.deck.length) p.hand.push(state.deck.shift())
    }
  }
  for (const p of state.players) payAnte(state, p.id)

  state.phase = 'bet1'
  state.currentBet = 0
  state.round1Matched = 0
  state.turn = state.firstActor
  state.lastAggressor = null
  state.checked = {}
  state.checkCount = 0

  pushEvent(state, `第 ${state.round} 局开始，双方已支付底注 ${ANTE} 枚`)
}

function commitChips(state, playerId, amount, roundKey) {
  const p = getPlayer(state, playerId)
  if (!p) return false
  const value = Math.trunc(Number(amount))
  if (!Number.isFinite(value) || value <= 0 || value > p.chips) return false
  p.chips -= value
  state.chips[p.id] = p.chips
  state.scores[p.id] = p.chips
  state.betPot += value
  state[roundKey][p.id] = (state[roundKey][p.id] || 0) + value
  return true
}

function handleCut(state, playerId, action) {
  if (state.phase !== 'cut') return { updated: false }
  if (!getPlayer(state, playerId) || state.cutDone[playerId]) return { updated: false }

  let position = Math.trunc(Number(action && action.position))
  if (!Number.isFinite(position) || position < 0 || position > state.deck.length) {
    position = Math.floor(Math.random() * (state.deck.length + 1))
  }
  state.deck = cutDeck(state.deck, position)
  state.cutDone[playerId] = true
  state.cuts[playerId] = position

  if (state.players.every(p => state.cutDone[p.id])) {
    dealAndAnte(state)
  }

  return { updated: true, result: { cut: true } }
}

function startExchange(state) {
  state.round1Matched = state.currentBet
  state.phase = 'exchange'
  const first = state.lastAggressor || state.firstActor
  state.exchangeOrder = [first, otherId(state, first)]
  state.exchangeTurn = state.exchangeOrder[0]
  state.exchangeDone = {}
  state.exchangeCounts = {}
  for (const p of state.players) {
    state.exchangeDone[p.id] = false
    state.exchangeCounts[p.id] = 0
  }
  state.exchangedTotal = 0
  state.turn = null
  const firstPlayer = getPlayer(state, first)
  pushEvent(state, `第一轮下注结束，${firstPlayer ? firstPlayer.name : '先手'} 先换牌`)
}

function handleExchange(state, playerId, action) {
  if (state.phase !== 'exchange' || state.exchangeTurn !== playerId) return { updated: false }
  if (state.exchangeDone[playerId]) return { updated: false }

  const raw = action && Array.isArray(action.indices) ? action.indices : []
  const indices = []
  for (const value of raw) {
    const idx = Math.trunc(Number(value))
    if (!Number.isInteger(idx) || idx < 0 || idx >= 5) return { updated: false }
    if (!indices.includes(idx)) indices.push(idx)
  }

  const count = indices.length
  if (count > MAX_EXCHANGE_PER_PLAYER) return { updated: false }
  if (state.exchangedTotal + count > MAX_EXCHANGE_TOTAL) return { updated: false }
  if (state.deck.length < count) return { updated: false }

  const p = getPlayer(state, playerId)
  const drawn = []
  for (let i = 0; i < count; i++) drawn.push(state.deck.shift())
  indices.forEach((idx, offset) => {
    state.discard.push(p.hand[idx])
    p.hand[idx] = drawn[offset]
  })

  state.exchangeDone[playerId] = true
  state.exchangeCounts[playerId] = count
  state.exchangedTotal += count

  if (state.players.every(x => state.exchangeDone[x.id])) {
    state.phase = 'bet2'
    state.round2 = {}
    for (const x of state.players) state.round2[x.id] = 0
    state.currentBet = state.round1Matched
    state.turn = otherId(state, state.lastAggressor || state.exchangeOrder[0] || state.firstActor)
    state.checkCount = 0
    pushEvent(state, '双方换牌完成，进入第二轮下注')
  } else {
    state.exchangeTurn = otherId(state, playerId)
  }

  return { updated: true, result: { exchangeCount: count } }
}

function finishBetAction(state, payload) {
  const res = { updated: true, result: payload }
  if (state.matchOver) res.finished = true
  return res
}

function handleBet(state, playerId, action) {
  if (!state || state.matchOver) return { updated: false }
  if (state.phase !== 'bet1' && state.phase !== 'bet2') return { updated: false }
  if (state.turn !== playerId) return { updated: false }
  const p = getPlayer(state, playerId)
  if (!p) return { updated: false }

  let move = String(action.move || action.action || '').toLowerCase()
  if (!move && ['check', 'call', 'raise', 'fold'].includes(action.type)) move = action.type
  if (action.type === 'bet' && !move) move = 'bet'
  if (!move) return { updated: false }

  return state.phase === 'bet1'
    ? handleBet1(state, p, playerId, move, action)
    : handleBet2(state, p, playerId, move, action)
}

function handleBet1(state, p, playerId, move, action) {
  const opponentId = otherId(state, playerId)
  const myBet = state.round1[playerId] || 0

  if (state.currentBet === 0) {
    if (move === 'check') {
      state.checkCount = (state.checkCount || 0) + 1
      if (state.checkCount >= 2) {
        settleNoContest(state)
      } else {
        state.turn = opponentId
      }
      return finishBetAction(state, { move: 'check' })
    }

    if (move === 'bet') {
      const amount = Math.trunc(Number(action.amount))
      if (!Number.isFinite(amount) || amount < ROUND1_MIN || amount > ROUND1_MAX || amount > p.chips) {
        return { updated: false }
      }
      if (!commitChips(state, playerId, amount, 'round1')) return { updated: false }
      state.currentBet = amount
      state.lastAggressor = playerId
      state.checkCount = 0
      state.checked = {}
      state.turn = opponentId
      return finishBetAction(state, { move: 'bet', amount })
    }

    return { updated: false }
  }

  if (move === 'fold') {
    settleFold(state, playerId)
    return finishBetAction(state, { move: 'fold' })
  }

  if (move === 'call') {
    const cost = state.currentBet - myBet
    if (cost < 0 || cost > p.chips) return { updated: false }
    if (cost > 0 && !commitChips(state, playerId, cost, 'round1')) return { updated: false }
    state.round1[playerId] = state.currentBet
    if ((state.round1[opponentId] || 0) === state.currentBet) {
      startExchange(state)
    } else {
      state.turn = opponentId
    }
    return finishBetAction(state, { move: 'call', amount: cost })
  }

  if (move === 'raise') {
    const newTotal = Math.trunc(Number(action.amount))
    if (!Number.isFinite(newTotal) || newTotal <= state.currentBet || newTotal > ROUND1_MAX) {
      return { updated: false }
    }
    const cost = newTotal - myBet
    if (cost <= 0 || cost > p.chips) return { updated: false }
    if (!commitChips(state, playerId, cost, 'round1')) return { updated: false }
    state.round1[playerId] = newTotal
    state.currentBet = newTotal
    state.lastAggressor = playerId
    state.checkCount = 0
    state.turn = opponentId
    return finishBetAction(state, { move: 'raise', amount: newTotal })
  }

  return { updated: false }
}

function handleBet2(state, p, playerId, move, action) {
  const opponentId = otherId(state, playerId)
  const myRound1 = state.round1[playerId] || 0
  const myRound2 = state.round2[playerId] || 0

  if (move === 'fold') {
    settleFold(state, playerId)
    return finishBetAction(state, { move: 'fold' })
  }

  if (move === 'call') {
    const cost = state.currentBet - myRound2
    if (cost < 0 || cost > p.chips) return { updated: false }
    if (cost > 0 && !commitChips(state, playerId, cost, 'round2')) return { updated: false }
    state.round2[playerId] = state.currentBet
    if ((state.round2[opponentId] || 0) === state.currentBet) {
      settleShowdown(state)
    } else {
      state.turn = opponentId
    }
    return finishBetAction(state, { move: 'call', amount: cost })
  }

  if (move === 'raise') {
    const newCurrent = Math.trunc(Number(action.amount))
    if (!Number.isFinite(newCurrent) || newCurrent <= state.currentBet) return { updated: false }
    if (myRound1 + newCurrent > ROUND2_MAX) return { updated: false }
    const cost = newCurrent - myRound2
    if (cost <= 0 || cost > p.chips) return { updated: false }
    if (!commitChips(state, playerId, cost, 'round2')) return { updated: false }
    state.round2[playerId] = newCurrent
    state.currentBet = newCurrent
    state.lastAggressor = playerId
    state.turn = opponentId
    return finishBetAction(state, { move: 'raise', amount: newCurrent })
  }

  return { updated: false }
}

function handleAction(state, playerId, action) {
  if (!state || !action) return { updated: false }
  if (state.matchOver) return { updated: false }
  if (!getPlayer(state, playerId)) return { updated: false }

  if (action.type === 'cut') return handleCut(state, playerId, action)
  if (action.type === 'exchange') return handleExchange(state, playerId, action)

  if (action.type === 'next_round') {
    if (state.phase !== 'round_result' || state.matchOver) return { updated: false }
    advanceRound(state)
    const res = { updated: true, result: { nextRound: state.round } }
    if (state.matchOver) res.finished = true
    return res
  }

  if (['check', 'bet', 'call', 'raise', 'fold'].includes(action.type)) {
    return handleBet(state, playerId, { ...action, move: action.move || action.type })
  }

  return handleBet(state, playerId, action)
}

function computeDeltas(state) {
  const deltas = {}
  for (const p of state.players) {
    deltas[p.id] = p.chips - (state.roundStartChips[p.id] == null ? p.chips : state.roundStartChips[p.id])
  }
  return deltas
}

function totalChipCount(state) {
  return state.players.reduce((sum, p) => sum + p.chips, 0)
}

function applyPayout(state, playerId, amount) {
  const p = getPlayer(state, playerId)
  if (!p) return
  const value = Math.max(0, Math.trunc(Number(amount) || 0))
  p.chips += value
  state.chips[p.id] = p.chips
  state.scores[p.id] = p.chips
}

function pushEvent(state, text, data = null) {
  if (!Array.isArray(state.pendingEvents)) state.pendingEvents = []
  state.pendingEvents.push({
    playerId: null,
    playerName: '',
    type: 'poker17_event',
    text,
    data
  })
}

function finishRound(state, result) {
  state.lastResult = result
  state.history.push(result)
  state.phase = 'round_result'
  state.turn = null
  state.exchangeTurn = null
  state.resultEndsAt = Date.now() + RESULT_DELAY_MS

  // 10局内任意一方筹码归零：另一方直接获胜。
  if (state.players.some(p => p.chips <= 0)) {
    finalizeMatch(state, 'chips_zero')
    return
  }
  if (state.round >= state.totalRounds) finalizeMatch(state, 'rounds_complete')
}

function settleNoContest(state) {
  const refunds = {}
  let totalRefund = 0

  // 双方连续过牌：底注原路退还，不产生抽水，也不改变双方总筹码。
  for (const p of state.players) {
    const paid = state.antePaid[p.id] || 0
    if (paid > 0) {
      applyPayout(state, p.id, paid)
      refunds[p.id] = paid
      totalRefund += paid
    }
  }

  state.antePot = 0
  state.betPot = 0

  const result = {
    type: 'no_contest',
    round: state.round,
    pot: 0,
    refundedAnte: totalRefund,
    anteToDealer: 0,
    winnerIds: [],
    winnerNames: [],
    payouts: refunds,
    chipDeltas: computeDeltas(state),
    revealed: false
  }
  pushEvent(state, `第 ${state.round} 局双方连续过牌，No Contest，底注 ${totalRefund} 枚已退还`)
  finishRound(state, result)
}

function settleFold(state, folderId) {
  const winnerId = otherId(state, folderId)
  const winner = getPlayer(state, winnerId)
  const folder = getPlayer(state, folderId)
  const pot = state.antePot + state.betPot

  // 一方弃牌：赢家获得全部底池（含双方底注），不抽水。
  applyPayout(state, winnerId, pot)
  state.antePot = 0
  state.betPot = 0

  const result = {
    type: 'fold',
    round: state.round,
    folderId,
    folderName: folder ? folder.name : '',
    winnerIds: winnerId ? [winnerId] : [],
    winnerNames: winner ? [winner.name] : [],
    pot,
    refundedAnte: 0,
    anteToDealer: 0,
    payouts: winnerId ? { [winnerId]: pot } : {},
    chipDeltas: computeDeltas(state),
    revealed: false
  }
  pushEvent(state, `${folder ? folder.name : '玩家'} 弃牌，${winner ? winner.name : '对手'} 赢得全部底池 ${pot} 枚`)
  finishRound(state, result)
}

function settleShowdown(state) {
  const [first, second] = state.players
  const pot = state.antePot + state.betPot
  const evalFirst = evaluateHand(first.hand)
  const evalSecond = evaluateHand(second.hand)
  const cmp = compareHands(evalFirst, evalSecond)

  let winnerIds = []
  let winnerNames = []
  const payouts = {}

  if (cmp > 0) {
    winnerIds = [first.id]
    winnerNames = [first.name]
    payouts[first.id] = pot
    applyPayout(state, first.id, pot)
  } else if (cmp < 0) {
    winnerIds = [second.id]
    winnerNames = [second.name]
    payouts[second.id] = pot
    applyPayout(state, second.id, pot)
  } else {
    winnerIds = [first.id, second.id]
    winnerNames = [first.name, second.name]
    const half = Math.floor(pot / 2)
    payouts[first.id] = half
    payouts[second.id] = pot - half
    applyPayout(state, first.id, payouts[first.id])
    applyPayout(state, second.id, payouts[second.id])
  }

  state.antePot = 0
  state.betPot = 0

  const result = {
    type: 'showdown',
    round: state.round,
    pot,
    winnerIds,
    winnerNames,
    payouts,
    chipDeltas: computeDeltas(state),
    hands: {
      [first.id]: first.hand,
      [second.id]: second.hand
    },
    evaluations: {
      [first.id]: evalFirst,
      [second.id]: evalSecond
    },
    revealed: true
  }

  if (cmp === 0) {
    pushEvent(state, `第 ${state.round} 局摊牌：双方牌型相同，平分底池 ${pot} 枚`)
  } else {
    pushEvent(state, `第 ${state.round} 局摊牌：${winnerNames[0]} 以「${(cmp > 0 ? evalFirst : evalSecond).categoryName}」赢得底池 ${pot} 枚`)
  }
  finishRound(state, result)
}

function finalizeMatch(state, reason = 'rounds_complete') {
  if (state.matchOver) return

  const entries = state.players.map(p => ({
    playerId: p.id,
    playerName: p.name,
    chips: p.chips,
    net: p.chips - state.initialChips
  }))
  const maxChips = Math.max(...entries.map(e => e.chips))
  const minChips = Math.min(...entries.map(e => e.chips))

  let winnerIds = []
  let endReason = reason
  let tiebreak = null

  const zeroPlayers = entries.filter(e => e.chips <= 0)
  if (zeroPlayers.length === 1) {
    // 规则1：10局内一方筹码归零，另一方直接获胜。
    endReason = 'chips_zero'
    winnerIds = entries.filter(e => e.chips > 0).map(e => e.playerId)
    tiebreak = 'opponent_chips_zero'
  } else if (zeroPlayers.length > 1) {
    endReason = 'tie'
    winnerIds = entries.map(e => e.playerId)
    tiebreak = 'both_chips_zero'
  } else if (reason === 'rounds_complete' || state.round >= state.totalRounds) {
    if (maxChips !== minChips) {
      // 规则2：10局后金币更多者获胜。
      endReason = 'chips'
      winnerIds = entries.filter(e => e.chips === maxChips).map(e => e.playerId)
      tiebreak = 'more_chips'
    } else {
      // 规则3：10局后金币相等，第10局金币增加者获胜。
      const deltas = (state.lastResult && state.lastResult.chipDeltas) || {}
      const increased = entries.filter(e => (deltas[e.playerId] || 0) > 0)
      if (increased.length === 1) {
        endReason = 'round10'
        winnerIds = increased.map(e => e.playerId)
        tiebreak = 'round10_chip_increase'
      } else {
        endReason = 'tie'
        winnerIds = entries.map(e => e.playerId)
        tiebreak = 'round10_no_increase'
      }
    }
  } else {
    // 兜底：按当前筹码领先者。
    endReason = 'chips'
    winnerIds = entries.filter(e => e.chips === maxChips).map(e => e.playerId)
    tiebreak = 'more_chips'
  }

  if (!winnerIds.length) {
    winnerIds = entries.filter(e => e.chips === maxChips).map(e => e.playerId)
    endReason = 'chips'
    tiebreak = 'more_chips'
  }

  const winnerNames = entries
    .filter(e => winnerIds.includes(e.playerId))
    .map(e => e.playerName)

  state.matchOver = true
  state.phase = 'match_over'
  state.resultEndsAt = null
  state.finalResult = {
    chips: Object.fromEntries(entries.map(e => [e.playerId, e.chips])),
    net: Object.fromEntries(entries.map(e => [e.playerId, e.net])),
    winnerIds,
    winnerNames,
    isTie: endReason === 'tie',
    endReason,
    tiebreak,
    dealerCollected: 0,
    totalChips: totalChipCount(state),
    roundsPlayed: state.history.length,
    initialChips: state.initialChips
  }

  let text = ''
  if (endReason === 'chips_zero') {
    const loser = entries.find(e => e.chips <= 0)
    text = `比赛结束，${loser ? loser.playerName : '一方'} 筹码归零，${winnerNames[0]} 直接获胜`
  } else if (endReason === 'round10') {
    text = `10局结束，双方筹码相同（${maxChips}），${winnerNames[0]} 因第10局筹码增加获胜`
  } else if (endReason === 'tie') {
    text = `10局结束，双方筹码相同且第10局无净增，比赛平局`
  } else {
    text = `10局结束，${winnerNames[0]} 以更多筹码（${maxChips}）获胜`
  }
  pushEvent(state, text)
}

function advanceRound(state) {
  if (state.matchOver) return
  if (state.round >= state.totalRounds) {
    finalizeMatch(state, 'rounds_complete')
    return
  }
  startRound(state, state.round + 1)
}

function tick(state) {
  if (!state || state.matchOver || state.status === 'paused') return
  if (state.phase === 'round_result' && state.resultEndsAt && Date.now() >= state.resultEndsAt) {
    advanceRound(state)
  }
}

function isFinished(state) {
  return !!(state && state.matchOver)
}

function getWinners(state) {
  if (!state) return []
  if (state.finalResult && Array.isArray(state.finalResult.winnerIds)) return state.finalResult.winnerIds
  if (!state.players || !state.players.length) return []
  const max = Math.max(...state.players.map(p => p.chips))
  return state.players.filter(p => p.chips === max).map(p => p.id)
}

function computeWinner(state) {
  const winners = getWinners(state)
  return winners.length ? winners[0] : null
}

// ===== Serializers =====

function publicPlayer(state, player, viewerId) {
  return {
    playerId: player.id,
    id: player.id,
    playerName: player.name,
    name: player.name,
    avatar: player.avatar || null,
    seat: player.seat,
    chips: player.chips,
    bet: (state.round1[player.id] || 0) + (state.round2[player.id] || 0),
    handCount: player.hand.length,
    isMe: player.id === viewerId,
    isTurn: state.turn === player.id || state.exchangeTurn === player.id,
    cutDone: !!state.cutDone[player.id]
  }
}

function sanitizeResult(result) {
  if (!result) return null
  const base = {
    type: result.type,
    round: result.round,
    pot: result.pot || 0,
    refundedAnte: result.refundedAnte || 0,
    anteToDealer: result.anteToDealer || 0,
    winnerIds: result.winnerIds || [],
    winnerNames: result.winnerNames || [],
    payouts: result.payouts || {},
    chipDeltas: result.chipDeltas || {},
    folderId: result.folderId || null,
    folderName: result.folderName || '',
    revealed: result.type === 'showdown'
  }
  if (result.type === 'showdown') {
    base.hands = result.hands || {}
    base.evaluations = result.evaluations || {}
  }
  return base
}

function computeAvailableActions(state, playerId) {
  const info = {
    canAct: false,
    available: [],
    minBet: 0,
    maxBet: 0,
    callAmount: 0,
    raiseMin: 0,
    raiseMax: 0,
    maxSelectable: 0,
    exchangeRemaining: 0
  }
  const p = getPlayer(state, playerId)
  if (!p || state.matchOver) return info

  if (state.phase === 'cut') {
    if (!state.cutDone[playerId]) {
      info.canAct = true
      info.available = ['cut']
    }
    return info
  }

  if (state.phase === 'exchange') {
    info.exchangeRemaining = Math.max(0, MAX_EXCHANGE_TOTAL - state.exchangedTotal)
    if (state.exchangeTurn === playerId && !state.exchangeDone[playerId]) {
      info.canAct = true
      info.available = ['exchange']
      info.maxSelectable = Math.min(
        MAX_EXCHANGE_PER_PLAYER,
        state.deck.length,
        MAX_EXCHANGE_TOTAL - state.exchangedTotal
      )
    }
    return info
  }

  if (state.phase === 'bet1') {
    if (state.turn !== playerId) return info
    const myBet = state.round1[playerId] || 0
    if (state.currentBet === 0) {
      info.available = ['check']
      if (p.chips >= ROUND1_MIN) {
        info.available.push('bet')
        info.minBet = ROUND1_MIN
        info.maxBet = Math.min(ROUND1_MAX, p.chips)
      }
    } else {
      const callAmount = state.currentBet - myBet
      info.callAmount = Math.max(0, callAmount)
      if (callAmount >= 0 && p.chips >= callAmount) info.available.push('call')
      const raiseMin = state.currentBet + ROUND1_MIN
      const raiseMax = Math.min(ROUND1_MAX, myBet + p.chips)
      if (raiseMax >= raiseMin && raiseMax > state.currentBet) {
        info.available.push('raise')
        info.raiseMin = raiseMin
        info.raiseMax = raiseMax
      }
      info.available.push('fold')
    }
    info.canAct = info.available.length > 0
    return info
  }

  if (state.phase === 'bet2') {
    if (state.turn !== playerId) return info
    const myRound1 = state.round1[playerId] || 0
    const myRound2 = state.round2[playerId] || 0
    const callAmount = state.currentBet - myRound2
    info.callAmount = Math.max(0, callAmount)
    if (callAmount >= 0 && p.chips >= callAmount) info.available.push('call')
    const raiseMin = state.currentBet + ROUND1_MIN
    const raiseMax = Math.min(ROUND2_MAX - myRound1, myRound2 + p.chips)
    if (raiseMax >= raiseMin && raiseMax > state.currentBet) {
      info.available.push('raise')
      info.raiseMin = raiseMin
      info.raiseMax = raiseMax
    }
    info.available.push('fold')
    info.canAct = info.available.length > 0
    return info
  }

  if (state.phase === 'round_result') {
    info.canAct = true
    info.available = ['next_round']
  }
  return info
}

function serializeForPlayer(state, playerId) {
  const me = getPlayer(state, playerId)
  const opponent = otherPlayer(state, playerId)
  const revealShowdown = !!(state.lastResult && state.lastResult.type === 'showdown')

  const chips = {}
  const bets = {}
  for (const p of state.players) {
    chips[p.id] = p.chips
    bets[p.id] = (state.round1[p.id] || 0) + (state.round2[p.id] || 0)
  }

  const action = computeAvailableActions(state, playerId)
  const exchange = {
    turnPlayerId: state.exchangeTurn,
    isMyTurn: state.exchangeTurn === playerId,
    done: { ...state.exchangeDone },
    counts: { ...state.exchangeCounts },
    exchangedTotal: state.exchangedTotal,
    remainingDeck: state.deck.length,
    remainingTotal: Math.max(0, MAX_EXCHANGE_TOTAL - state.exchangedTotal),
    maxSelectable: state.exchangeTurn === playerId && !state.exchangeDone[playerId]
      ? Math.min(MAX_EXCHANGE_PER_PLAYER, state.deck.length, MAX_EXCHANGE_TOTAL - state.exchangedTotal)
      : 0,
    myCount: state.exchangeCounts[playerId] || 0
  }

  return {
    gameId: 'poker17',
    status: state.status,
    round: state.round,
    totalRounds: state.totalRounds,
    phase: state.phase,
    phaseLabel: PHASE_LABEL[state.phase] || state.phase,
    turnPlayerId: state.turn,
    firstActor: state.firstActor,
    lastAggressor: state.lastAggressor,
    players: state.players.map(p => publicPlayer(state, p, playerId)),
    myId: playerId,
    myHand: me ? me.hand : [],
    opponentHand: revealShowdown && opponent ? opponent.hand : null,
    opponentHandCount: opponent ? opponent.hand.length : 0,
    opponent: opponent ? publicPlayer(state, opponent, playerId) : null,
    chips,
    bets,
    ante: { ...state.antePaid },
    antePot: state.antePot,
    betPot: state.betPot,
    pot: state.antePot + state.betPot,
    dealerCollected: 0,
    currentBet: state.currentBet,
    round1Matched: state.round1Matched,
    round1: { ...state.round1 },
    round2: { ...state.round2 },
    deckRemaining: state.deck.length,
    discardCount: state.discard.length,
    cut: {
      done: { ...state.cutDone },
      myDone: !!state.cutDone[playerId],
      canCut: state.phase === 'cut' && !state.cutDone[playerId],
      waitingForOpponent: state.phase === 'cut' && !!state.cutDone[playerId]
    },
    exchange,
    action,
    lastResult: sanitizeResult(state.lastResult),
    history: state.history.map(sanitizeResult),
    resultEndsAt: state.resultEndsAt,
    matchOver: state.matchOver,
    finalResult: state.finalResult,
    totalChips: totalChipCount(state),
    canNextRound: state.phase === 'round_result' && !state.matchOver
  }
}

function serializeForObserver(state) {
  const result = {}
  if (!state || !Array.isArray(state.players)) return result
  for (const p of state.players) {
    const bet = (state.round1[p.id] || 0) + (state.round2[p.id] || 0)
    result[p.id] = {
      name: p.name,
      chips: p.chips,
      bet,
      score: p.chips,
      total: p.chips,
      done: !!state.matchOver,
      label: `筹码 ${p.chips} · 下注 ${bet}`
    }
  }
  return result
}

function serializeAdmin(state) {
  if (!state) return null
  const players = {}
  for (const p of state.players) {
    players[p.id] = {
      name: p.name,
      chips: p.chips,
      bet: (state.round1[p.id] || 0) + (state.round2[p.id] || 0),
      hand: p.hand.map(cardLabel),
      isTurn: state.turn === p.id,
      exchanged: state.exchangeCounts[p.id] || 0
    }
  }
  return {
    type: 'poker17',
    round: state.round,
    totalRounds: state.totalRounds,
    phase: state.phase,
    phaseLabel: PHASE_LABEL[state.phase] || state.phase,
    pot: state.antePot + state.betPot,
    antePot: state.antePot,
    betPot: state.betPot,
    dealerCollected: 0,
    currentBet: state.currentBet,
    round1Matched: state.round1Matched,
    players,
    deckRemaining: state.deck.length,
    discard: state.discard.map(cardLabel),
    lastResult: sanitizeResult(state.lastResult),
    finalResult: state.finalResult,
    totalChips: totalChipCount(state)
  }
}

// 公开复盘快照：比赛进行中不包含任何暗牌，只有摊牌阶段才公开双方手牌。
function serializeReplaySnapshot(state) {
  if (!state) return null
  const reveal = !!(state.lastResult && state.lastResult.type === 'showdown')
  const players = {}
  for (const p of state.players) {
    players[p.id] = {
      name: p.name,
      chips: p.chips,
      bet: (state.round1[p.id] || 0) + (state.round2[p.id] || 0),
      hand: reveal ? p.hand.map(cardLabel) : [],
      isTurn: state.turn === p.id,
      exchanged: state.exchangeCounts[p.id] || 0
    }
  }
  return {
    type: 'poker17',
    round: state.round,
    totalRounds: state.totalRounds,
    phase: state.phase,
    phaseLabel: PHASE_LABEL[state.phase] || state.phase,
    pot: state.antePot + state.betPot,
    dealerCollected: 0,
    currentBet: state.currentBet,
    round1Matched: state.round1Matched,
    players,
    deckRemaining: state.deck.length,
    lastResult: sanitizeResult(state.lastResult),
    finalResult: state.finalResult,
    totalChips: totalChipCount(state)
  }
}

function serializeMeta(state) {
  if (!state) return null
  return {
    type: 'poker17',
    initialChips: state.initialChips,
    totalRounds: state.totalRounds,
    finalResult: state.finalResult,
    dealerCollected: 0,
    totalChips: totalChipCount(state),
    rounds: state.history.map(r => ({
      round: r.round,
      type: r.type,
      pot: r.pot,
      refundedAnte: r.refundedAnte || 0,
      winnerIds: r.winnerIds || [],
      winnerNames: r.winnerNames || [],
      payouts: r.payouts || {},
      chipDeltas: r.chipDeltas || {},
      hands: r.hands || null,
      evaluations: r.evaluations || null
    }))
  }
}

function describeEvent(state, playerId, action) {
  const player = getPlayer(state, playerId)
  const name = player ? player.name : '玩家'
  const type = action && action.type
  if (type === 'cut') return { text: `${name} 切牌` }
  if (type === 'exchange') {
    const count = action && Array.isArray(action.indices) ? action.indices.length : 0
    return { text: `${name} 交换了 ${count} 张牌` }
  }
  if (type === 'next_round') return { text: `${name} 进入下一局` }
  if (type === 'bet') {
    const move = action.move || action.action
    if (move === 'check') return { text: `${name} 过牌` }
    if (move === 'bet') return { text: `${name} 下注 ${action.amount}` }
    if (move === 'call') return { text: `${name} 跟注` }
    if (move === 'raise') return { text: `${name} 加注到 ${action.amount}` }
    if (move === 'fold') return { text: `${name} 弃牌` }
  }
  return null
}

function takeReplayEvents(state) {
  if (!state || !Array.isArray(state.pendingEvents) || !state.pendingEvents.length) return []
  const events = state.pendingEvents
  state.pendingEvents = []
  return events
}

module.exports = {
  INITIAL_CHIPS,
  ANTE,
  TOTAL_ROUNDS,
  MAX_EXCHANGE_TOTAL,
  MAX_EXCHANGE_PER_PLAYER,
  ROUND1_MIN,
  ROUND1_MAX,
  ROUND2_MAX,
  RESULT_DELAY_MS,
  CATEGORY,
  CATEGORY_NAME,
  CATEGORY_NAME_EN,
  buildDeck,
  shuffleDeck,
  cutDeck,
  cardLabel,
  evaluateHand,
  evaluateNatural,
  compareScore,
  compareHands,
  createMatch,
  startRound,
  handleAction,
  tick,
  isFinished,
  computeWinner,
  getWinners,
  computeAvailableActions,
  serializeForPlayer,
  serializeForObserver,
  serializeAdmin,
  serializeReplaySnapshot,
  serializeMeta,
  describeEvent,
  takeReplayEvents,
  settleShowdown,
  settleFold,
  settleNoContest,
  finalizeMatch
}
