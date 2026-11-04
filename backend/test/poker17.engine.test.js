'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('../src/games/poker17/engine')

const deck = engine.buildDeck()
const card = (rank, suit) => deck.find(c => c.rank === rank && c.suit === suit)
const joker = deck.find(c => c.joker)
const hand = (rank, suit) => card(rank, suit)

function newMatch() {
  return engine.createMatch([
    { playerId: 'p1', playerName: '玩家A' },
    { playerId: 'p2', playerName: '玩家B' }
  ])
}

function cutBoth(state) {
  assert.equal(engine.handleAction(state, 'p1', { type: 'cut' }).updated, true)
  assert.equal(engine.handleAction(state, 'p2', { type: 'cut' }).updated, true)
}

test('17-card deck has the exact required composition and unique ids', () => {
  assert.equal(deck.length, 17)
  assert.equal(new Set(deck.map(c => c.id)).size, 17)
  for (const rank of ['A', 'K', 'Q', 'J']) {
    assert.equal(deck.filter(c => c.rank === rank).length, 4)
  }
  assert.equal(deck.filter(c => c.joker).length, 1)
})

test('joker can make five of a kind and straight flush', () => {
  const five = engine.evaluateHand([
    joker, hand('A', '♠'), hand('A', '♥'), hand('A', '♣'), hand('A', '♦')
  ])
  assert.equal(five.categoryName, '五条')
  assert.equal(five.score[0], engine.CATEGORY.FIVE_OF_A_KIND)

  const straightFlush = engine.evaluateHand([
    joker, hand('A', '♠'), hand('K', '♠'), hand('Q', '♠'), hand('J', '♠')
  ])
  assert.equal(straightFlush.categoryName, '同花顺')
  assert.equal(straightFlush.score[0], engine.CATEGORY.STRAIGHT_FLUSH)
  assert.equal(straightFlush.score[1], 14)
  assert.equal(straightFlush.jokerAs[0].label, '10♠')
})

test('joker can form 10-J-Q-K-A straight and other categories', () => {
  const straight = engine.evaluateHand([
    joker, hand('A', '♠'), hand('K', '♥'), hand('Q', '♣'), hand('J', '♦')
  ])
  assert.equal(straight.categoryName, '顺子')
  assert.equal(straight.score[1], 14)

  const fullHouse = engine.evaluateHand([
    joker, hand('A', '♠'), hand('A', '♥'), hand('K', '♣'), hand('K', '♦')
  ])
  assert.equal(fullHouse.categoryName, '葫芦')
  assert.deepEqual(fullHouse.score.slice(0, 3), [engine.CATEGORY.FULL_HOUSE, 14, 13])

  const trips = engine.evaluateHand([
    joker, hand('A', '♠'), hand('A', '♥'), hand('K', '♣'), hand('Q', '♦')
  ])
  assert.equal(trips.categoryName, '三条')
})

test('hand comparison follows category and tiebreakers', () => {
  const quads = engine.evaluateHand([
    hand('A', '♠'), hand('A', '♥'), hand('A', '♣'), hand('A', '♦'), hand('K', '♠')
  ])
  const full = engine.evaluateHand([
    hand('K', '♠'), hand('K', '♥'), hand('K', '♣'), hand('A', '♦'), hand('A', '♠')
  ])
  assert.equal(engine.compareHands(quads, full), 1)

  const pairA = engine.evaluateHand([
    hand('A', '♠'), hand('A', '♥'), hand('K', '♣'), hand('Q', '♦'), hand('J', '♠')
  ])
  const pairK = engine.evaluateHand([
    hand('K', '♠'), hand('K', '♥'), hand('A', '♣'), hand('Q', '♦'), hand('J', '♠')
  ])
  assert.equal(engine.compareHands(pairA, pairK), 1)

  const identical1 = engine.evaluateHand([
    hand('A', '♠'), hand('K', '♥'), hand('Q', '♣'), hand('J', '♦'), joker
  ])
  const identical2 = engine.evaluateHand([
    hand('A', '♥'), hand('K', '♣'), hand('Q', '♦'), hand('J', '♠'), joker
  ])
  assert.equal(engine.compareHands(identical1, identical2), 0)
})

test('dealing is five cards each with seven cards left, and antes are paid', () => {
  const state = newMatch()
  cutBoth(state)
  assert.equal(state.phase, 'bet1')
  assert.equal(state.players[0].hand.length, 5)
  assert.equal(state.players[1].hand.length, 5)
  assert.equal(state.deck.length, 7)
  assert.equal(state.chips.p1, 95)
  assert.equal(state.chips.p2, 95)
  assert.equal(state.antePot, 10)
  assert.equal(state.currentBet, 0)
  assert.equal(state.turn, 'p1')
})

test('per-player serialization never exposes the opponent hand before showdown', () => {
  const state = newMatch()
  cutBoth(state)
  const opponentHand = state.players[1].hand.map(c => c.id)
  const json = JSON.stringify(engine.serializeForPlayer(state, 'p1'))
  for (const id of opponentHand) assert.equal(json.includes(id), false)
  assert.equal(JSON.parse(json).opponentHand, null)
  assert.equal(JSON.parse(json).myHand.length, 5)
})

test('live replay snapshots never contain hidden cards before showdown', () => {
  const state = newMatch()
  cutBoth(state)
  const snapshot = engine.serializeReplaySnapshot(state)
  for (const p of Object.values(snapshot.players)) {
    assert.deepEqual(p.hand, [])
  }
  const json = JSON.stringify(snapshot)
  for (const p of state.players) {
    for (const card of p.hand) assert.equal(json.includes(card.id), false)
  }
})

test('check-check is no contest: both antes are refunded and total chips stay 200', () => {
  const state = newMatch()
  cutBoth(state)
  assert.equal(engine.handleAction(state, 'p1', { type: 'bet', move: 'check' }).updated, true)
  assert.equal(engine.handleAction(state, 'p2', { type: 'bet', move: 'check' }).updated, true)
  assert.equal(state.phase, 'round_result')
  assert.equal(state.lastResult.type, 'no_contest')
  assert.equal(state.chips.p1, 100)
  assert.equal(state.chips.p2, 100)
  assert.equal(state.dealerCollected, 0)
  assert.equal(state.lastResult.refundedAnte, 10)
  assert.deepEqual(state.lastResult.payouts, { p1: 5, p2: 5 })
  assert.equal(Object.values(state.chips).reduce((a, b) => a + b, 0), 200)
  assert.equal(state.history.length, 1)
})

test('exchange order and total seven-card exchange limit are enforced', () => {
  const state = newMatch()
  cutBoth(state)
  engine.handleAction(state, 'p1', { type: 'bet', move: 'bet', amount: 5 })
  engine.handleAction(state, 'p2', { type: 'bet', move: 'call' })

  assert.equal(state.phase, 'exchange')
  assert.equal(state.exchangeOrder[0], 'p1') // last aggressor exchanges first
  assert.equal(state.exchangeTurn, 'p1')
  assert.equal(state.deck.length, 7)

  assert.equal(engine.handleAction(state, 'p1', { type: 'exchange', indices: [0, 1, 2, 3, 4] }).updated, true)
  assert.equal(state.deck.length, 2)
  const second = engine.serializeForPlayer(state, 'p2')
  assert.equal(second.exchange.maxSelectable, 2)
  // p2 tries to exchange 3 -> rejected, then 2 -> accepted
  assert.equal(engine.handleAction(state, 'p2', { type: 'exchange', indices: [0, 1, 2] }).updated, false)
  assert.equal(engine.handleAction(state, 'p2', { type: 'exchange', indices: [0, 1] }).updated, true)
  assert.equal(state.phase, 'bet2')
  assert.equal(state.deck.length, 0)
  assert.equal(state.exchangedTotal, 7)
  assert.equal(state.currentBet, 5)
})

test('round two calls lead to showdown and conserve chips', () => {
  const state = newMatch()
  cutBoth(state)
  engine.handleAction(state, 'p1', { type: 'bet', move: 'bet', amount: 5 })
  engine.handleAction(state, 'p2', { type: 'bet', move: 'call' })
  while (state.phase === 'exchange') {
    engine.handleAction(state, state.exchangeTurn, { type: 'exchange', indices: [] })
  }
  assert.equal(state.phase, 'bet2')
  const first = state.turn
  assert.equal(engine.handleAction(state, first, { type: 'bet', move: 'call' }).updated, true)
  assert.equal(engine.handleAction(state, state.turn, { type: 'bet', move: 'call' }).updated, true)
  assert.equal(state.phase, 'round_result')
  assert.equal(state.lastResult.type, 'showdown')
  assert.equal(state.lastResult.pot, 30)
  assert.equal(state.dealerCollected, 0)
  assert.equal(Object.values(state.chips).reduce((a, b) => a + b, 0), 200)
})

test('fold awards the entire pot including both antes, with no rake', () => {
  const state = newMatch()
  cutBoth(state)
  engine.handleAction(state, 'p1', { type: 'bet', move: 'bet', amount: 5 })
  engine.handleAction(state, 'p2', { type: 'bet', move: 'call' })
  while (state.phase === 'exchange') {
    engine.handleAction(state, state.exchangeTurn, { type: 'exchange', indices: [] })
  }
  const first = state.turn
  engine.handleAction(state, first, { type: 'bet', move: 'raise', amount: 25 })
  const other = state.turn
  engine.handleAction(state, other, { type: 'bet', move: 'fold' })

  const winnerId = state.lastResult.winnerIds[0]
  const folderId = state.lastResult.folderId
  assert.equal(state.phase, 'round_result')
  assert.equal(state.lastResult.type, 'fold')
  // antes 10 + round1 bets 10 + round2 raise 25 = 45
  assert.equal(state.lastResult.pot, 45)
  assert.equal(state.dealerCollected, 0)
  assert.equal(state.lastResult.payouts[winnerId], 45)
  assert.equal(state.chips[winnerId], 110)
  assert.equal(state.chips[folderId], 90)
  assert.equal(Object.values(state.chips).reduce((a, b) => a + b, 0), 200)
})

test('final winner rule 1: a player reaching zero chips loses immediately', () => {
  const state = newMatch()
  state.players[0].chips = 5
  state.players[1].chips = 195
  state.chips = { p1: 5, p2: 195 }
  cutBoth(state)

  // p1 pays the 5-chip ante and is left with 0 chips.
  assert.equal(state.chips.p1, 0)
  assert.equal(engine.handleAction(state, 'p1', { type: 'bet', move: 'check' }).updated, true)
  assert.equal(engine.handleAction(state, 'p2', { type: 'bet', move: 'bet', amount: 5 }).updated, true)
  const result = engine.handleAction(state, 'p1', { type: 'bet', move: 'fold' })

  assert.equal(result.finished, true)
  assert.equal(state.matchOver, true)
  assert.equal(state.finalResult.endReason, 'chips_zero')
  assert.deepEqual(state.finalResult.winnerIds, ['p2'])
  assert.equal(state.chips.p1, 0)
  assert.equal(state.chips.p2, 200)
  assert.equal(state.finalResult.totalChips, 200)
})

test('final winner rule 2: after ten rounds the player with more chips wins', () => {
  const state = newMatch()
  state.round = 10
  state.history = new Array(10).fill({})
  state.players[0].chips = 120
  state.players[1].chips = 80
  state.chips = { p1: 120, p2: 80 }
  engine.finalizeMatch(state, 'rounds_complete')

  assert.equal(state.finalResult.endReason, 'chips')
  assert.deepEqual(state.finalResult.winnerIds, ['p1'])
  assert.equal(state.finalResult.isTie, false)
})

test('final winner rule 3: equal chips after ten rounds uses round-10 chip increase', () => {
  const state = newMatch()
  state.round = 10
  state.history = new Array(10).fill({})
  state.players[0].chips = 100
  state.players[1].chips = 100
  state.chips = { p1: 100, p2: 100 }
  state.lastResult = {
    type: 'showdown',
    round: 10,
    winnerIds: ['p1'],
    chipDeltas: { p1: 10, p2: -10 }
  }
  engine.finalizeMatch(state, 'rounds_complete')

  assert.equal(state.finalResult.endReason, 'round10')
  assert.deepEqual(state.finalResult.winnerIds, ['p1'])
  assert.equal(state.finalResult.tiebreak, 'round10_chip_increase')
})

test('final winner rule 3: equal chips and no round-10 increase is a tie', () => {
  const state = newMatch()
  state.round = 10
  state.history = new Array(10).fill({})
  state.players[0].chips = 100
  state.players[1].chips = 100
  state.chips = { p1: 100, p2: 100 }
  state.lastResult = {
    type: 'no_contest',
    round: 10,
    winnerIds: [],
    chipDeltas: { p1: 0, p2: 0 }
  }
  engine.finalizeMatch(state, 'rounds_complete')

  assert.equal(state.finalResult.endReason, 'tie')
  assert.equal(state.finalResult.isTie, true)
  assert.deepEqual(state.finalResult.winnerIds.sort(), ['p1', 'p2'])
})

test('a match finishes within ten rounds and never produces negative chips', () => {
  const state = newMatch()

  function takeTurn() {
    const pid = state.turn
    assert.ok(pid)
    const actions = engine.computeAvailableActions(state, pid)
    if (actions.available.includes('call')) {
      return engine.handleAction(state, pid, { type: 'bet', move: 'call' })
    }
    if (actions.available.includes('check')) {
      return engine.handleAction(state, pid, { type: 'bet', move: 'check' })
    }
    if (actions.available.includes('bet')) {
      return engine.handleAction(state, pid, { type: 'bet', move: 'bet', amount: actions.minBet })
    }
    if (actions.available.includes('fold')) {
      return engine.handleAction(state, pid, { type: 'bet', move: 'fold' })
    }
    throw new Error('no available action: ' + JSON.stringify(actions))
  }

  for (let round = 1; round <= 10 && !state.matchOver; round++) {
    cutBoth(state)
    assert.equal(state.phase, 'bet1')
    assert.equal(takeTurn().updated, true)
    if (state.phase === 'bet1') assert.equal(takeTurn().updated, true)
    while (state.phase === 'exchange') {
      const pid = state.exchangeTurn
      assert.equal(engine.handleAction(state, pid, { type: 'exchange', indices: [] }).updated, true)
    }
    let guard = 0
    while (state.phase === 'bet2' && guard++ < 4) {
      const result = takeTurn()
      assert.equal(result.updated, true)
    }
    assert.equal(state.phase === 'round_result' || state.phase === 'match_over', true)
    for (const p of state.players) assert.equal(p.chips >= 0, true)
    assert.equal(Object.values(state.chips).reduce((a, b) => a + b, 0), 200)
    if (!state.matchOver) {
      assert.equal(state.phase, 'round_result')
      assert.equal(engine.handleAction(state, 'p1', { type: 'next_round' }).updated, true)
    }
  }
  assert.equal(state.matchOver, true)
  assert.equal(state.phase, 'match_over')
  assert.ok(state.history.length >= 1 && state.history.length <= 10)
  assert.ok(state.finalResult)
  assert.equal(state.finalResult.initialChips, 100)
  assert.equal(state.finalResult.totalChips, 200)
  assert.equal(state.finalResult.dealerCollected, 0)
  assert.equal(Object.values(state.chips).reduce((a, b) => a + b, 0), 200)
  assert.equal(engine.isFinished(state), true)
})

test('invalid or out-of-turn actions are rejected', () => {
  const state = newMatch()
  cutBoth(state)
  // p2 is not the first actor
  assert.equal(engine.handleAction(state, 'p2', { type: 'bet', move: 'bet', amount: 5 }).updated, false)
  // bet outside 5..15
  assert.equal(engine.handleAction(state, 'p1', { type: 'bet', move: 'bet', amount: 20 }).updated, false)
  assert.equal(engine.handleAction(state, 'p1', { type: 'bet', move: 'bet', amount: 5 }).updated, true)
  // check is not allowed while facing a bet
  assert.equal(engine.handleAction(state, 'p2', { type: 'bet', move: 'check' }).updated, false)
  // unmatched amounts cannot start the exchange
  assert.equal(state.phase, 'bet1')
})
