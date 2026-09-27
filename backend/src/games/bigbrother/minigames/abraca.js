/**
 * 出包魔法师 (Abraca...What?) —— BB 内置多人桌游
 *
 * 规则要点（依据需求文档；实体版规则存在歧义的取值已在代码中注释，并可通过 options 覆盖）：
 *  - 2~5 人，每人 5 块正常魔法石（本人看不到自己石头的编号，其他人可见）
 *  - 生命上限 6；初始 6
 *  - 回合：猜测自己持有的法术编号施放；成功后必须用「>= 上次成功编号」继续或停止；
 *          失败则失去 1 点生命并结束回合；回合结束补牌至 5（库存足够时）
 *  - 8 种法术效果见 SPELLS
 *  - 轮次结束：有人生命归零 / 只剩 1 人 / 有人无法补满（施放完所有石头）
 *  - 计分：施放完所有石头者 +3；击杀者 +3；其他存活 +1；存活者每块猫头鹰 +1
 *  - 先达到目标分（默认 8，可 options.target 覆盖）者获胜
 *
 * 隐藏信息：完整手牌/库存只在服务端；getState 按玩家身份过滤，本人不返回自己的手牌编号。
 */
const { registerGame } = require('./index')

const HAND_SIZE = 5
const START_HP = 6
const MAX_HP = 6
const DEFAULT_TARGET = 8
const TURN_MS = 40000          // 每回合限时 40s（服务端绝对截止时间）
const ROUND_END_PAUSE_MS = 8000

// 默认牌库构成：各法术数量 = 其编号（1号×1、2号×2、…、8号×8，共 36），可 options.deck 覆盖
const DEFAULT_DECK = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8 }

const SPELLS = [
  { id: 1, name: '古代火龙', icon: '🐉', desc: '掷 1-3 点骰子，其他存活玩家各失去对应生命。' },
  { id: 2, name: '暗黑幽灵', icon: '👻', desc: '其他存活玩家各失去 1 点生命，自己恢复 1 点（上限 6）。' },
  { id: 3, name: '甜蜜的梦', icon: '💤', desc: '掷 1-3 点骰子，自己恢复对应生命（上限 6）。' },
  { id: 4, name: '夜之歌者 / 猫头鹰', icon: '🦉', desc: '从中央秘密魔法石中获取 1 块（轮末每块 +1 分）。' },
  { id: 5, name: '闪电暴风雨', icon: '⚡', desc: '左手边和右手边的有效玩家各失去 1 点生命。' },
  { id: 6, name: '暴风雪', icon: '❄️', desc: '左手边玩家失去 1 点生命。' },
  { id: 7, name: '火球', icon: '🔥', desc: '右手边的有效玩家失去 1 点生命。' },
  { id: 8, name: '魔法药水', icon: '🧪', desc: '自己恢复 1 点生命（上限 6）。' }
]

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function d3() { return 1 + Math.floor(Math.random() * 3) }

function buildDeck(deckCfg) {
  const deck = []
  const cfg = deckCfg && typeof deckCfg === 'object' ? deckCfg : DEFAULT_DECK
  for (let s = 1; s <= 8; s++) {
    const n = Math.max(0, parseInt(cfg[s], 10) || 0)
    for (let i = 0; i < n; i++) deck.push(s)
  }
  return shuffle(deck)
}

registerGame({
  id: 'abraca',
  name: '出包魔法师',
  icon: '🎩',
  description: '2-5人隐藏手牌对战：猜测自己持有的法术施放，连锁、伤害、治疗、猫头鹰与积分，先达标者胜。',
  category: 'strategy',
  playerCount: { min: 2, max: 5 },
  duration: 1800,
  needsServerTick: true,
  serverTickMs: 500,
  broadcastState: true,

  init(participants, pool, options) {
    const opts = options || {}
    const handSize = Math.max(1, parseInt(opts.handSize, 10) || HAND_SIZE)
    const startHp = Math.max(1, parseInt(opts.startHp, 10) || START_HP)
    const maxHp = Math.max(startHp, parseInt(opts.maxHp, 10) || MAX_HP)
    const target = Math.max(1, parseInt(opts.target, 10) || DEFAULT_TARGET)
    const turnMs = Math.max(5000, parseInt(opts.turnMs, 10) || TURN_MS)
    const deckCfg = opts.deck || DEFAULT_DECK

    const players = {}
    const order = []
    participants.forEach((p, idx) => {
      players[p.playerId] = {
        playerId: p.playerId,
        name: p.playerName,
        seat: idx,
        hp: startHp,
        maxHp,
        hand: [],
        alive: true,
        owls: [],
        killsRound: 0,
        killerThisRound: false,
        spentAll: false,
        scoreTotal: 0,
        scoreRound: 0,
        lastSpell: 0,
        hasCastThisTurn: false
      }
      order.push(p.playerId)
    })

    const state = {
      status: 'ready',
      startTime: null,
      phase: 'playing',       // playing | roundEnd | gameOver
      round: 0,
      handSize,
      maxHp,
      target,
      turnMs,
      deckCfg,
      players,
      order,
      turnIndex: 0,
      turnDeadline: 0,
      stock: [],              // 剩余公共魔法石（隐藏）
      secretPile: [],         // 猫头鹰秘密石（隐藏）
      tower: {},              // spellId -> { total, cast, lastCasterName }
      recent: [],
      log: [],
      roundResults: null,
      nextAt: 0,
      winner: null,
      _processedOps: {},
      _replayEvents: []
    }
    for (let s = 1; s <= 8; s++) {
      const total = Math.max(0, parseInt(deckCfg[s], 10) || 0)
      state.tower[s] = { total, cast: 0, lastCasterName: '' }
    }
    // 猫头鹰秘密石：数量取 options.owls（默认 6），每块为随机法术编号，抽取者本人可见
    const owlCount = Math.max(0, parseInt(opts.owls, 10) || 6)
    state.secretPile = Array.from({ length: owlCount }, () => 1 + Math.floor(Math.random() * 8))

    startRound(state)
    state.turnDeadline = 0 // 真正开始（start 事件）后再计时
    return state
  },

  handleAction(state, playerId, action, opts) {
    if (!action) return { updated: false }
    if (action.type === 'start') {
      state.status = 'playing'
      if (!state.startTime) state.startTime = Date.now()
      if (!state.turnDeadline) state.turnDeadline = Date.now() + state.turnMs
      return { updated: true, finished: false }
    }
    if (state.phase === 'gameOver') return { updated: false }

    // 幂等：同一操作ID 只处理一次
    if (action.opId) {
      if (state._processedOps[playerId] === action.opId) return { updated: false }
      state._processedOps[playerId] = action.opId
    }

    if (state.phase !== 'playing') return { updated: false }
    const currentId = state.order[state.turnIndex]
    if (playerId !== currentId) return { updated: false, result: { error: '还没轮到你' } }
    const p = state.players[playerId]
    if (!p || !p.alive) return { updated: false }

    if (action.type === 'cast') {
      const spell = parseInt(action.spell, 10)
      if (!(spell >= 1 && spell <= 8)) return { updated: false, result: { error: '非法法术' } }
      if (p.hasCastThisTurn && spell < p.lastSpell) {
        return { updated: false, result: { error: `连锁施法只能选择 ≥ ${p.lastSpell} 号法术` } }
      }
      const idx = p.hand.indexOf(spell)
      if (idx < 0) {
        // 施法失败：扣 1 血并结束回合
        p.hp -= 1
        state.log.push(`❌ ${p.name} 尝试 ${spell} 号法术失败，失去 1 点生命`)
        p.hasCastThisTurn = false
        p.lastSpell = 0
        maybeDeath(state, p, null)
        if (state.phase === 'playing') endTurn(state)
        return { updated: true, finished: state.phase === 'gameOver', result: { success: false, spell, hp: p.hp } }
      }
      // 成功：公开并移除该石头
      p.hand.splice(idx, 1)
      p.lastSpell = spell
      p.hasCastThisTurn = true
      state.tower[spell].cast += 1
      state.tower[spell].lastCasterName = p.name
      state.recent.unshift({ playerName: p.name, spell, at: Date.now() })
      state.recent = state.recent.slice(0, 12)
      state.log.push(`✨ ${p.name} 成功施放 ${spell} 号法术（${spellName(spell)}）`)
      const effect = applySpell(state, p, spell)
      // 统一结算伤害后再判断
      if (state.phase === 'playing') {
        if (p.hand.length === 0) {
          p.spentAll = true
          maybeRoundEnd(state, 'spentAll')
          if (state.phase === 'playing') endTurn(state)
        }
      }
      return { updated: true, finished: state.phase === 'gameOver', result: { success: true, spell, roll: effect.roll || null } }
    }

    if (action.type === 'stop') {
      if (!p.hasCastThisTurn) return { updated: false, result: { error: '至少成功施放一次后才能停止' } }
      state.log.push(`🛑 ${p.name} 结束施法`)
      endTurn(state)
      return { updated: true, finished: state.phase === 'gameOver' }
    }

    return { updated: false }
  },

  tick(state) {
    if (state.status !== 'playing') return false
    const now = Date.now()
    if (state.phase === 'roundEnd' && state.nextAt && now >= state.nextAt) {
      if (state.winner) { state.phase = 'gameOver'; return true }
      startRound(state)
      return false
    }
    if (state.phase === 'playing' && state.turnDeadline && now >= state.turnDeadline) {
      const p = state.players[state.order[state.turnIndex]]
      if (p) {
        if (!p.hasCastThisTurn) {
          // 每回合必须至少喊 1 个咒语；超时一个未喊则失去 1 点生命
          p.hp -= 1
          state.log.push(`⏰ ${p.name} 回合超时且未喊咒语，失去 1 点生命（剩余 ${Math.max(0, p.hp)}）`)
          if (p.hp <= 0) {
            p.hp = 0
            p.alive = false
            state.log.push(`💀 ${p.name} 被淘汰`)
            maybeRoundEnd(state, 'death')
          }
        } else {
          state.log.push(`⏰ ${p.name} 回合超时，自动结束回合`)
        }
      }
      if (state.phase === 'playing') endTurn(state)
    }
    return false
  },

  computeWinner(state) { return state.winner || null },
  getWinners(state) { return state.winner ? [state.winner] : [] },
  isFinished(state) { return state.phase === 'gameOver' },
  checkTarget() { return false },

  getState(state, playerId) {
    const me = state.players[playerId] || null
    const currentId = state.order[state.turnIndex]
    const spells = SPELLS.map(sp => ({
      ...sp,
      total: state.tower[sp.id].total,
      cast: state.tower[sp.id].cast,
      remaining: Math.max(0, state.tower[sp.id].total - state.tower[sp.id].cast),
      lastCasterName: state.tower[sp.id].lastCasterName || ''
    }))
    const players = state.order.map(pid => {
      const p = state.players[pid]
      const isSelf = pid === playerId
      return {
        playerId: pid,
        name: p.name,
        seat: p.seat,
        hp: p.hp,
        maxHp: p.maxHp,
        alive: p.alive,
        handCount: p.hand.length,
        // 其他人可见其正常魔法石编号；本人不可见自己的
        hand: isSelf ? undefined : [...p.hand].sort((a, b) => a - b),
        owls: isSelf ? [...p.owls] : undefined,
        owlsCount: p.owls.length,
        scoreTotal: p.scoreTotal,
        scoreRound: p.scoreRound,
        isTurn: pid === currentId,
        status: p.alive ? '存活' : '已淘汰'
      }
    })
    return {
      gameType: 'abraca',
      status: state.status,
      phase: state.phase,
      round: state.round,
      target: state.target,
      handSize: state.handSize,
      turnPlayerId: currentId,
      turnDeadline: state.turnDeadline,
      serverNow: Date.now(),
      spells,
      recent: state.recent,
      log: state.log.slice(-40),
      players,
      roundResults: state.roundResults,
      winner: state.winner,
      me: me ? {
        playerId: me.playerId,
        hp: me.hp,
        maxHp: me.maxHp,
        alive: me.alive,
        handCount: me.hand.length,
        owls: [...me.owls],
        scoreTotal: me.scoreTotal,
        scoreRound: me.scoreRound,
        isTurn: me.playerId === currentId,
        minSpell: me.hasCastThisTurn ? me.lastSpell : 1,
        lastSpell: me.lastSpell,
        hasCastThisTurn: me.hasCastThisTurn,
        canCast: state.phase === 'playing' && me.playerId === currentId && me.alive,
        canStop: state.phase === 'playing' && me.playerId === currentId && me.hasCastThisTurn
      } : null
    }
  },

  getAllStates(state) {
    const out = {}
    for (const pid of state.order) {
      const p = state.players[pid]
      out[pid] = {
        score: p.scoreTotal,
        progress: p.hp,
        max: p.maxHp,
        done: !p.alive,
        label: `${p.hp}HP · ${p.hand.length}石 · ${p.scoreTotal}分`,
        alive: p.alive,
        hp: p.hp,
        handCount: p.hand.length,
        scoreTotal: p.scoreTotal,
        owlsCount: p.owls.length
      }
    }
    return out
  },

  describeEvent(state, playerId, action, result) {
    const p = state.players[playerId]
    const pname = p ? p.name : playerId
    if (action && action.type === 'cast') {
      const ok = result && result.success
      return { text: ok ? `${pname} 成功施放 ${action.spell} 号法术` : `${pname} 施放 ${action.spell} 号法术失败`, data: { spell: action.spell, success: !!ok } }
    }
    if (action && action.type === 'stop') return { text: `${pname} 结束施法` }
    return null
  },

  takeReplayEvents(state) {
    const evs = state._replayEvents || []
    state._replayEvents = []
    return evs
  }
})

// ==================== 内部逻辑 ====================

function spellName(id) {
  const s = SPELLS.find(x => x.id === id)
  return s ? s.name : `${id} 号`
}

function pushEvent(state, text) {
  state._replayEvents = state._replayEvents || []
  state._replayEvents.push({ type: 'abraca', text })
}

/** 开始新一轮：重置生命、发放手牌、重置法塔计数 */
function startRound(state) {
  state.round += 1
  state.phase = 'playing'
  state.roundResults = null
  state.stock = buildDeck(state.deckCfg)
  state.recent = []
  for (let s = 1; s <= 8; s++) { state.tower[s].cast = 0; state.tower[s].lastCasterName = '' }
  for (const pid of state.order) {
    const p = state.players[pid]
    p.hp = p.maxHp
    p.alive = true
    p.owls = []
    p.killsRound = 0
    p.killerThisRound = false
    p.spentAll = false
    p.scoreRound = 0
    p.lastSpell = 0
    p.hasCastThisTurn = false
    p.hand = state.stock.splice(0, state.handSize)
  }
  state.turnIndex = 0
  state.turnDeadline = Date.now() + state.turnMs
  state.log.push(`—— 第 ${state.round} 轮开始 ——`)
  pushEvent(state, `第 ${state.round} 轮开始`)
}

function refillHand(state, p) {
  const need = state.handSize - p.hand.length
  if (need <= 0) return
  const draw = state.stock.splice(0, need)
  p.hand.push(...draw)
}

/** 结束当前回合：补牌并切换下一位存活玩家 */
function endTurn(state) {
  const p = state.players[state.order[state.turnIndex]]
  if (p) {
    refillHand(state, p)
    p.hasCastThisTurn = false
    p.lastSpell = 0
    // 补牌后若仍不足（库存耗尽）视为施放完所有石头
    if (p.hand.length === 0) { p.spentAll = true }
  }
  if (state.phase !== 'playing') return
  if (maybeRoundEnd(state, p && p.spentAll ? 'spentAll' : null)) return
  advanceTurn(state)
}

function advanceTurn(state) {
  const n = state.order.length
  for (let i = 1; i <= n; i++) {
    const idx = (state.turnIndex + i) % n
    const pid = state.order[idx]
    if (state.players[pid] && state.players[pid].alive) {
      state.turnIndex = idx
      state.turnDeadline = Date.now() + state.turnMs
      return
    }
  }
  maybeRoundEnd(state, 'lastStanding')
}

/** 按座位顺序找左/右的下一位存活玩家 */
function neighbor(state, fromId, dir) {
  const n = state.order.length
  const start = state.order.indexOf(fromId)
  for (let i = 1; i <= n; i++) {
    const idx = (start + dir * i + n * i) % n
    const pid = state.order[idx]
    if (pid !== fromId && state.players[pid] && state.players[pid].alive) return state.players[pid]
  }
  return null
}

function damagePlayer(state, target, amount, killer) {
  if (!target || !target.alive) return
  target.hp -= amount
  state.log.push(`💥 ${target.name} 失去 ${amount} 点生命（剩余 ${Math.max(0, target.hp)}）`)
  if (killer && target.hp <= 0) {
    killer.killsRound = (killer.killsRound || 0) + 1
    killer.killerThisRound = true
  }
  if (target.hp <= 0) {
    target.hp = 0
    target.alive = false
    state.log.push(`💀 ${target.name} 被淘汰`)
  }
}

function healPlayer(state, p, amount) {
  if (!p || !p.alive) return
  const before = p.hp
  p.hp = Math.min(p.maxHp, p.hp + amount)
  const gained = p.hp - before
  if (gained > 0) state.log.push(`💚 ${p.name} 恢复 ${gained} 点生命（剩余 ${p.hp}）`)
}

/** 执行法术效果（服务端结算） */
function applySpell(state, caster, spell) {
  const effect = { roll: null }
  switch (spell) {
    case 1: {
      const roll = d3()
      effect.roll = roll
      state.log.push(`🎲 古代火龙掷出 ${roll} 点`)
      for (const p of Object.values(state.players)) {
        if (p.playerId !== caster.playerId && p.alive) damagePlayer(state, p, roll, caster)
      }
      break
    }
    case 2: {
      for (const p of Object.values(state.players)) {
        if (p.playerId !== caster.playerId && p.alive) damagePlayer(state, p, 1, caster)
      }
      healPlayer(state, caster, 1)
      break
    }
    case 3: {
      const roll = d3()
      effect.roll = roll
      state.log.push(`🎲 甜蜜的梦掷出 ${roll} 点`)
      healPlayer(state, caster, roll)
      break
    }
    case 4: {
      if (state.secretPile.length) {
        const stone = state.secretPile.pop()
        caster.owls.push(stone)
        state.log.push(`🦉 ${caster.name} 获得 1 块猫头鹰秘密石`)
      }
      break
    }
    case 5: {
      const left = neighbor(state, caster.playerId, 1)
      const right = neighbor(state, caster.playerId, -1)
      const hit = new Set()
      if (left && !hit.has(left.playerId)) { hit.add(left.playerId); damagePlayer(state, left, 1, caster) }
      if (right && !hit.has(right.playerId)) { hit.add(right.playerId); damagePlayer(state, right, 1, caster) }
      break
    }
    case 6: {
      const left = neighbor(state, caster.playerId, 1)
      if (left) damagePlayer(state, left, 1, caster)
      break
    }
    case 7: {
      const right = neighbor(state, caster.playerId, -1)
      if (right) damagePlayer(state, right, 1, caster)
      break
    }
    case 8: {
      healPlayer(state, caster, 1)
      break
    }
  }
  // 施法导致任何人死亡 → 立即进入轮次结算（伤害已统一结算）
  for (const p of Object.values(state.players)) {
    if (!p.alive) { maybeRoundEnd(state, 'death'); break }
  }
  return effect
}

function maybeDeath(state, p, killer) {
  if (p.hp <= 0) { p.hp = 0; p.alive = false; state.log.push(`💀 ${p.name} 被淘汰`) }
  for (const x of Object.values(state.players)) {
    if (!x.alive) { maybeRoundEnd(state, 'death'); break }
  }
}

/** 判断并执行轮次结束 + 计分 */
function maybeRoundEnd(state, reason) {
  if (state.phase !== 'playing') return true
  const alive = Object.values(state.players).filter(p => p.alive)
  let r = reason
  if (!r) {
    if (alive.length <= 1) r = 'lastStanding'
    else if (Object.values(state.players).some(p => p.spentAll || p.hand.length === 0)) r = 'spentAll'
  }
  if (!r) return false
  resolveRound(state, r)
  return true
}

function resolveRound(state, reason) {
  state.phase = 'roundEnd'
  state.turnDeadline = 0
  const alive = Object.values(state.players).filter(p => p.alive)
  // 击杀者集合（本轮）
  const killers = Object.values(state.players).filter(p => p.killerThisRound)
  const spentAllers = Object.values(state.players).filter(p => p.spentAll)
  for (const p of Object.values(state.players)) {
    let sc = 0
    if (p.spentAll) sc += 3
    if (p.killerThisRound) sc += 3
    if (p.alive && !p.killerThisRound && !p.spentAll) sc += 1
    if (p.alive) sc += (p.owls || []).length // 存活者每块猫头鹰 +1
    p.scoreRound = sc
    p.scoreTotal += sc
  }
  state.scores = {}
  for (const pid of state.order) state.scores[pid] = state.players[pid].scoreTotal
  state.roundResults = {
    reason,
    round: state.round,
    players: state.order.map(pid => {
      const p = state.players[pid]
      return {
        playerId: pid, name: p.name, hp: p.hp, alive: p.alive,
        owls: (p.owls || []).length, kills: p.killsRound || 0, spentAll: !!p.spentAll,
        scoreRound: p.scoreRound, scoreTotal: p.scoreTotal
      }
    })
  }
  state.log.push(`—— 第 ${state.round} 轮结束（${roundReasonText(reason)}）——`)
  pushEvent(state, `第 ${state.round} 轮结束：${roundReasonText(reason)}`)

  // 判定比赛结束
  let winner = null
  for (const pid of state.order) {
    if (state.players[pid].scoreTotal >= state.target) { winner = pid; break }
  }
  if (winner) {
    state.winner = winner
    state.nextAt = Date.now() + ROUND_END_PAUSE_MS
    state.log.push(`🏆 ${state.players[winner].name} 达到 ${state.target} 分，赢得比赛！`)
    pushEvent(state, `${state.players[winner].name} 赢得比赛`)
  } else {
    state.nextAt = Date.now() + ROUND_END_PAUSE_MS
  }
}

function roundReasonText(reason) {
  return ({ death: '有玩家被淘汰', lastStanding: '仅剩一名存活玩家', spentAll: '有玩家施放完所有魔法石' })[reason] || reason
}
