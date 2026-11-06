/**
 * 毒酒 (Poison Drink)
 *
 * 规则：
 *  - 每位玩家初始 3 点生命，座位顺序随机生成后固定；
 *  - 每轮随机指定一名庄家（首轮随机，之后按座位顺时针轮换）；
 *  - 根据存活人数 N 抽取 N 种不同饮料作为酒杯，随机选 1 ~ N-1 杯下毒；
 *  - 毒酒位置仅庄家可见；庄家把 N 杯酒分配给 N 名存活玩家；
 *  - 非庄家玩家依次秘密选择：不动 / 顺时针 1 格 / 顺时针 2 格；
 *  - 所有选择完成后统一结算，转盘累计旋转，喝到毒酒者生命 -1，生命归零淘汰；
 *  - 仅剩 1 名存活玩家时游戏结束。
 *
 * 注意：饮料名称唯一，但 Emoji 可能重复，内部一律使用独立 id 区分。
 */
const { registerGame } = require('./index')

const DRINK_LIBRARY = [
  { id: 'd01', name: '神秘药剂', emoji: '🧪' },
  { id: 'd02', name: '巫师秘酿', emoji: '🧙' },
  { id: 'd03', name: '冰霜药水', emoji: '🧊' },
  { id: 'd04', name: '生命之泉', emoji: '💧' },
  { id: 'd05', name: '不老灵药', emoji: '✨' },
  { id: 'd06', name: '魔力精华', emoji: '🔮' },
  { id: 'd07', name: '暗影药剂', emoji: '🌑' },
  { id: 'd08', name: '星辰药水', emoji: '🌟' },
  { id: 'd09', name: '凤凰圣露', emoji: '🔥' },
  { id: 'd10', name: '独角兽灵液', emoji: '🦄' },
  { id: 'd11', name: '吸血鬼红酒', emoji: '🍷' },
  { id: 'd12', name: '龙焰烈酒', emoji: '🥃' },
  { id: 'd13', name: '月光鸡尾酒', emoji: '🍸' },
  { id: 'd14', name: '精灵果酒', emoji: '🍹' },
  { id: 'd15', name: '星辰香槟', emoji: '🍾' },
  { id: 'd16', name: '樱花清酒', emoji: '🍶' },
  { id: 'd17', name: '海盗朗姆酒', emoji: '🏴‍☠️' },
  { id: 'd18', name: '恶魔之血', emoji: '🩸' },
  { id: 'd19', name: '黄金麦酒', emoji: '🍺' },
  { id: 'd20', name: '仙境蜜酒', emoji: '🍯' },
  { id: 'd21', name: '森林灵茶', emoji: '🍵' },
  { id: 'd22', name: '女巫花茶', emoji: '🫖' },
  { id: 'd23', name: '暗夜咖啡', emoji: '☕' },
  { id: 'd24', name: '月桂奶茶', emoji: '🧋' },
  { id: 'd25', name: '珍珠魔法奶茶', emoji: '🧋' },
  { id: 'd26', name: '紫晶乌龙茶', emoji: '🍵' },
  { id: 'd27', name: '玫瑰花露茶', emoji: '🌹' },
  { id: 'd28', name: '龙息热可可', emoji: '☕' },
  { id: 'd29', name: '极光抹茶', emoji: '🍵' },
  { id: 'd30', name: '梦境安神茶', emoji: '🌙' },
  { id: 'd31', name: '彩虹果汁', emoji: '🌈' },
  { id: 'd32', name: '雷电柠檬饮', emoji: '🍋' },
  { id: 'd33', name: '紫晶葡萄酿', emoji: '🍇' },
  { id: 'd34', name: '桃花仙露', emoji: '🍑' },
  { id: 'd35', name: '红宝石果饮', emoji: '🍓' },
  { id: 'd36', name: '翡翠青苹果汁', emoji: '🍏' },
  { id: 'd37', name: '黄金菠萝汁', emoji: '🍍' },
  { id: 'd38', name: '海妖椰奶', emoji: '🥥' },
  { id: 'd39', name: '太阳橙汁', emoji: '🍊' },
  { id: 'd40', name: '蓝莓星河饮', emoji: '🫐' },
  { id: 'd41', name: '幻影汽水', emoji: '🥤' },
  { id: 'd42', name: '生命圣饮', emoji: '🧉' },
  { id: 'd43', name: '独角兽牛奶', emoji: '🥛' },
  { id: 'd44', name: '蜂王蜜露', emoji: '🍯' },
  { id: 'd45', name: '冰雪可乐', emoji: '🧊' },
  { id: 'd46', name: '迷雾气泡水', emoji: '🫧' },
  { id: 'd47', name: '幸运七彩饮', emoji: '🎨' },
  { id: 'd48', name: '时空穿梭饮', emoji: '⏳' },
  { id: 'd49', name: '黄金圣杯', emoji: '🏆' },
  { id: 'd50', name: '混沌之饮', emoji: '🌀' }
]

const INITIAL_HP = 3

function clamp(v, min, max, dflt) {
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return dflt
  return Math.max(min, Math.min(max, n))
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function pushReplay(state, type, text, data) {
  if (!state._replayEvents) state._replayEvents = []
  state._replayEvents.push({ type, text, data: data || null })
}

function publicCup(c) {
  return { id: c.id, drinkId: c.drinkId, name: c.name, emoji: c.emoji }
}

registerGame({
  id: 'poison-drink',
  name: '毒酒',
  icon: '🍷',
  description: '每轮庄家分配酒杯，玩家按顺时针依次公开旋转转盘；喝到毒酒扣 1 点生命，最后存活者获胜',
  category: 'strategy',
  playerCount: { min: 2, max: 20 },
  duration: 1800,
  needsServerTick: true,
  serverTickMs: 500,
  broadcastState: true,
  privateActions: [],

  init(participants, _pool, options = {}) {
    const opts = {
      seatTime: clamp(options.seatTime, 5, 300, 30),
      assignTime: clamp(options.assignTime, 10, 600, 90),
      rotateTime: clamp(options.rotateTime, 5, 600, 60),
      revealTime: clamp(options.revealTime, 2, 60, 8)
    }
    const participantOrder = participants.map(p => p.playerId)
    const players = {}
    participants.forEach(p => {
      players[p.playerId] = {
        playerId: p.playerId,
        playerName: p.playerName || p.playerId,
        seat: null,
        hp: INITIAL_HP,
        alive: true
      }
    })
    return {
      status: 'ready',
      started: false,
      finished: false,
      winnerId: null,
      round: 0,
      participantOrder,
      seatOrder: [],
      players,
      dealerId: null,
      phase: 'seat',
      phaseEndsAt: 0,
      // 自由选座
      seatPickOrder: [],
      seatPickIndex: 0,
      cups: [],
      assignment: {},
      rotations: {},
      currentRotation: 0,      // 本轮转盘累计旋转格数（已公开）
      rotationOrder: [],       // 本轮非庄家行动顺序（从庄家顺时针下一位开始）
      rotationIndex: 0,        // 当前轮到 rotationOrder 中的第几位
      rotationHistory: [],     // 依次公开的转盘操作记录
      lastResult: null,
      opts,
      _replayEvents: []
    }
  },

  tick(state) {
    if (state.status !== 'playing' || state.finished) return
    const now = Date.now()
    if (!state.started) {
      state.started = true
      this._startSeatSelection(state, now)
      return
    }
    if (now < state.phaseEndsAt) return

    if (state.phase === 'seat') {
      // 当前选座玩家超时：自动随机选一个空座，然后轮到下一位
      this._autoSeatCurrent(state, now)
    } else if (state.phase === 'assign') {
      this._autoAssign(state)
      state.phase = 'rotate'
      state.phaseEndsAt = now + state.opts.rotateTime * 1000
      pushReplay(state, 'auto_assign', '庄家超时，系统随机分配了酒杯', null)
    } else if (state.phase === 'rotate') {
      // 当前玩家超时：自动“不动”，然后把选择权交给下一位，而不是直接结算
      this._autoRotateCurrent(state, now)
    } else if (state.phase === 'reveal') {
      this._nextRound(state, now)
    }
    return
  },

  handleAction(state, playerId, action, opts) {
    const isAdmin = !!(opts && opts.isAdmin)
    if (!action) return { updated: false }
    const p = state.players[playerId]

    if (action.type === 'start' && !state.started) {
      state.started = true
      state.status = 'playing'
      this._startSeatSelection(state, Date.now())
      return { updated: true, finished: state.finished }
    }
    if (state.finished) return { updated: false }

    // ---- 管理员推进 ----
    if (isAdmin) {
      if (action.type === 'next' || action.type === 'lock') {
        const now = Date.now()
        if (state.phase === 'seat') {
          this._autoSeatCurrent(state, now)
        } else if (state.phase === 'assign') {
          this._autoAssign(state)
          state.phase = 'rotate'
          state.phaseEndsAt = now + state.opts.rotateTime * 1000
        } else if (state.phase === 'rotate') {
          this._autoRotateCurrent(state, now)
        } else if (state.phase === 'reveal') {
          this._nextRound(state, now)
        }
        return { updated: true, finished: state.finished }
      }
      return { updated: false }
    }

    if (!p) return { updated: false }

    // ---- 自由选座：按随机顺序依次选择 ----
    if (action.type === 'pick_seat') {
      if (state.phase !== 'seat') return { updated: false }
      const currentPickerId = state.seatPickOrder[state.seatPickIndex] || null
      if (!currentPickerId) return { updated: false }
      if (playerId !== currentPickerId) {
        return { updated: false, result: { error: `还未轮到你选座，当前轮到 ${state.players[currentPickerId]?.playerName || ''}` } }
      }
      const seat = parseInt(action.seat, 10)
      const total = state.participantOrder.length
      if (!Number.isInteger(seat) || seat < 0 || seat >= total) {
        return { updated: false, result: { error: '座位号无效' } }
      }
      const occupied = Object.values(state.players).some(x => x.seat === seat)
      if (occupied) return { updated: false, result: { error: '该座位已被选择' } }
      const now = Date.now()
      p.seat = seat
      state.seatPickIndex += 1
      pushReplay(state, 'pick_seat', `${p.playerName} 选择了座位 ${seat + 1}`, { playerId, seat })
      if (state.seatPickIndex >= state.seatPickOrder.length) {
        this._finishSeatSelection(state, now)
      } else {
        state.phaseEndsAt = now + state.opts.seatTime * 1000
      }
      const nextPickerId = state.seatPickOrder[state.seatPickIndex] || null
      return { updated: true, finished: state.finished, result: { picked: true, seat, nextPickerId } }
    }

    // ---- 庄家分配酒杯 ----
    if (action.type === 'assign') {
      if (state.phase !== 'assign') return { updated: false }
      if (playerId !== state.dealerId) return { updated: false, result: { error: '只有庄家可以分配酒杯' } }
      const raw = action.assignments || action.assignment || {}
      const alive = this._aliveIds(state)
      const cupIds = state.cups.map(c => c.id)
      if (!raw || typeof raw !== 'object') return { updated: false, result: { error: '分配数据无效' } }
      // 必须恰好是存活玩家与全部酒杯的一一对应
      const playerKeys = Object.keys(raw)
      if (playerKeys.length !== alive.length) return { updated: false, result: { error: '请为每位玩家分配一杯酒' } }
      const used = new Set()
      for (const pid of alive) {
        const cupId = raw[pid]
        if (!cupId || !cupIds.includes(cupId)) return { updated: false, result: { error: '酒杯分配不完整' } }
        if (used.has(cupId)) return { updated: false, result: { error: '同一杯酒不能分配给多人' } }
        used.add(cupId)
      }
      if (used.size !== cupIds.length) return { updated: false, result: { error: '请分配全部酒杯' } }
      state.assignment = {}
      for (const pid of alive) state.assignment[pid] = raw[pid]
      state.phase = 'rotate'
      state.phaseEndsAt = Date.now() + state.opts.rotateTime * 1000
      pushReplay(state, 'assign', `${p.playerName} 完成了第${state.round}轮酒杯分配`, null)
      return { updated: true, finished: false, result: { submitted: true } }
    }

    // ---- 非庄家按顺时针依次选择转盘操作（选择即时公开） ----
    if (action.type === 'rotate') {
      if (state.phase !== 'rotate') return { updated: false }
      if (!p.alive) return { updated: false }
      if (playerId === state.dealerId) return { updated: false, result: { error: '庄家本轮不参与转盘操作' } }
      const currentActorId = state.rotationOrder[state.rotationIndex] || null
      if (!currentActorId) return { updated: false }
      if (playerId !== currentActorId) {
        return { updated: false, result: { error: `还未轮到你，当前轮到 ${state.players[currentActorId]?.playerName || ''} 选择` } }
      }
      if (state.rotations[playerId] != null) return { updated: false, result: { error: '本轮已经选择过了' } }
      const rotation = parseInt(action.rotation, 10)
      if (![0, 1, 2].includes(rotation)) return { updated: false, result: { error: '请选择 0 / 1 / 2 格' } }
      const now = Date.now()
      const alive = this._aliveIds(state)
      const n = alive.length
      state.rotations[playerId] = rotation
      state.currentRotation = (state.currentRotation + rotation) % Math.max(1, n)
      state.rotationHistory.push({
        playerId,
        playerName: p.playerName,
        rotation,
        cumulativeRotation: state.currentRotation,
        at: now
      })
      state.rotationIndex += 1
      const allChosen = state.rotationIndex >= state.rotationOrder.length
      pushReplay(state, 'rotate', `${p.playerName} 旋转 ${rotation} 格，转盘当前累计 ${state.currentRotation} 格`, {
        playerId, rotation, currentRotation: state.currentRotation, allChosen
      })
      if (allChosen) this._resolveRound(state, now)
      // 每位玩家独立的选择时间窗口
      else state.phaseEndsAt = now + state.opts.rotateTime * 1000
      const nextActorId = state.rotationOrder[state.rotationIndex] || null
      return {
        updated: true,
        finished: false,
        result: { submitted: true, allChosen, rotation, currentRotation: state.currentRotation, nextActorId }
      }
    }

    return { updated: false }
  },

  _aliveIds(state) {
    return state.seatOrder.filter(pid => state.players[pid] && state.players[pid].alive)
  },

  _freeSeats(state) {
    const total = state.participantOrder.length
    const taken = new Set(Object.values(state.players)
      .map(p => p.seat)
      .filter(s => s != null))
    const free = []
    for (let i = 0; i < total; i++) if (!taken.has(i)) free.push(i)
    return free
  },

  _startSeatSelection(state, now) {
    for (const pid of state.participantOrder) state.players[pid].seat = null
    state.seatOrder = []
    state.dealerId = null
    state.seatPickOrder = shuffle(state.participantOrder)
    state.seatPickIndex = 0
    state.phase = 'seat'
    state.phaseEndsAt = now + state.opts.seatTime * 1000
    pushReplay(state, 'seat_start', '自由选座开始，按随机顺序依次选择座位', {
      order: state.seatPickOrder.map(id => ({ playerId: id, playerName: state.players[id]?.playerName || id }))
    })
  },

  // 当前选座玩家超时：随机选一个空座，然后轮到下一位；最后一位完成才进入分配阶段
  _autoSeatCurrent(state, now) {
    if (state.phase !== 'seat') return
    const pid = state.seatPickOrder[state.seatPickIndex]
    if (!pid) {
      this._finishSeatSelection(state, now)
      return
    }
    if (state.players[pid] && state.players[pid].seat == null) {
      const free = this._freeSeats(state)
      if (free.length) {
        const seat = free[Math.floor(Math.random() * free.length)]
        state.players[pid].seat = seat
        pushReplay(state, 'seat_timeout', `${state.players[pid].playerName} 未按时选座，系统随机安排座位 ${seat + 1}`, {
          playerId: pid, seat
        })
      }
    }
    state.seatPickIndex += 1
    if (state.seatPickIndex >= state.seatPickOrder.length) this._finishSeatSelection(state, now)
    else state.phaseEndsAt = now + state.opts.seatTime * 1000
  },

  _finishSeatSelection(state, now) {
    const total = state.participantOrder.length
    const seatOrder = new Array(total).fill(null)
    for (const pid of state.participantOrder) {
      const seat = state.players[pid]?.seat
      if (Number.isInteger(seat) && seat >= 0 && seat < total && !seatOrder[seat]) {
        seatOrder[seat] = pid
      }
    }
    // 兜底：把未安排的玩家填入空座
    for (let i = 0; i < total; i++) {
      if (!seatOrder[i]) {
        const pid = state.participantOrder.find(id => !seatOrder.includes(id) && state.players[id].seat == null)
        if (pid) {
          state.players[pid].seat = i
          seatOrder[i] = pid
        }
      }
    }
    state.seatOrder = seatOrder.filter(Boolean)
    state.dealerId = state.seatOrder[Math.floor(Math.random() * state.seatOrder.length)] || null
    pushReplay(state, 'seat_done', `选座完成，庄家：${state.players[state.dealerId]?.playerName || '—'}`, {
      seatOrder: state.seatOrder.map(id => ({ playerId: id, playerName: state.players[id]?.playerName || id })),
      dealerId: state.dealerId
    })
    this._startRound(state, now)
  },

  _startRound(state, now) {
    const alive = this._aliveIds(state)
    if (alive.length <= 1) {
      this._finish(state, alive[0] || null)
      return
    }
    state.round += 1
    const n = alive.length
    const drinks = shuffle(DRINK_LIBRARY).slice(0, n)
    const poisonCount = 1 + Math.floor(Math.random() * (n - 1))
    const poisonIndexes = new Set(shuffle([...Array(n).keys()]).slice(0, poisonCount))
    state.cups = drinks.map((d, i) => ({
      id: uid('cup'),
      drinkId: d.id,
      name: d.name,
      emoji: d.emoji,
      poison: poisonIndexes.has(i)
    }))
    state.assignment = {}
    state.rotations = {}
    state.currentRotation = 0
    state.rotationHistory = []
    state.rotationIndex = 0
    // 行动顺序：从庄家座位的下一位开始，顺时针依次行动（跳过庄家）
    const dealerSeat = state.players[state.dealerId]?.seat ?? -1
    const rotationOrder = []
    for (let step = 1; step < state.seatOrder.length; step++) {
      const seat = (dealerSeat + step + state.seatOrder.length) % state.seatOrder.length
      const pid = state.seatOrder[seat]
      const p = state.players[pid]
      if (p && p.alive && pid !== state.dealerId) rotationOrder.push(pid)
    }
    state.rotationOrder = rotationOrder
    state.lastResult = null
    state.phase = 'assign'
    state.phaseEndsAt = now + state.opts.assignTime * 1000
    pushReplay(state, 'round_start', `第${state.round}轮开始，庄家：${state.players[state.dealerId]?.playerName || '—'}，本轮流转 ${n} 杯酒`, {
      round: state.round,
      dealerId: state.dealerId,
      cups: state.cups.map(publicCup),
      rotationOrder
    })
  },

  _autoAssign(state) {
    const alive = this._aliveIds(state)
    const cups = shuffle(state.cups)
    state.assignment = {}
    alive.forEach((pid, i) => {
      if (cups[i]) state.assignment[pid] = cups[i].id
    })
  },

  // 只处理当前这一位超时玩家：自动不动，然后轮到下一位；最后一位才结算
  _autoRotateCurrent(state, now) {
    if (state.phase !== 'rotate') return
    const pid = state.rotationOrder[state.rotationIndex]
    if (!pid) {
      this._resolveRound(state, now)
      return
    }
    if (state.rotations[pid] == null) {
      state.rotations[pid] = 0
      state.rotationHistory.push({
        playerId: pid,
        playerName: state.players[pid]?.playerName || pid,
        rotation: 0,
        cumulativeRotation: state.currentRotation,
        at: now,
        auto: true
      })
      pushReplay(state, 'rotate_timeout', `${state.players[pid]?.playerName || pid} 未按时选择，自动不动，轮到下一位`, {
        playerId: pid,
        rotation: 0,
        currentRotation: state.currentRotation
      })
    }
    state.rotationIndex += 1
    const allChosen = state.rotationIndex >= state.rotationOrder.length
    if (allChosen) this._resolveRound(state, now)
    else state.phaseEndsAt = now + state.opts.rotateTime * 1000
  },

  _resolveRound(state, now) {
    if (state.phase !== 'rotate') return
    const alive = this._aliveIds(state)
    const n = alive.length
    if (!n) { this._finish(state, null); return }
    // 依次公开执行后，转盘累计角度已经记录在 currentRotation 中
    const totalRotation = (state.currentRotation || 0) % n

    const cupById = new Map(state.cups.map(c => [c.id, c]))
    // initialCupAtSeat[i]：按存活玩家座位顺序，初始分到第 i 个座位的酒
    const initialCupAtSeat = alive.map(pid => cupById.get(state.assignment[pid]) || null)
    // 顺时针移动 totalRotation 格后，第 i 个座位上的酒
    const finalCupAtSeat = new Array(n).fill(null)
    for (let i = 0; i < n; i++) {
      const cup = initialCupAtSeat[i]
      if (cup) finalCupAtSeat[(i + totalRotation) % n] = cup
    }

    const rows = []
    const eliminatedIds = []
    alive.forEach((pid, i) => {
      const p = state.players[pid]
      const cup = finalCupAtSeat[i]
      const hpBefore = p.hp
      const poisoned = !!(cup && cup.poison)
      const hpAfter = poisoned ? Math.max(0, hpBefore - 1) : hpBefore
      const rotation = pid === state.dealerId ? null : (state.rotations[pid] || 0)
      let eliminated = false
      if (hpAfter <= 0) {
        eliminated = true
        eliminatedIds.push(pid)
      }
      rows.push({
        playerId: pid,
        playerName: p.playerName,
        seat: p.seat,
        cupId: cup ? cup.id : null,
        drinkId: cup ? cup.drinkId : null,
        drinkName: cup ? cup.name : '—',
        emoji: cup ? cup.emoji : '❔',
        poison: poisoned,
        hpBefore,
        hpAfter,
        eliminated,
        rotation
      })
    })

    // 统一结算生命值/淘汰
    for (const row of rows) {
      const p = state.players[row.playerId]
      if (!p) continue
      p.hp = row.hpAfter
      if (row.eliminated) p.alive = false
    }

    state.lastResult = {
      round: state.round,
      dealerId: state.dealerId,
      totalRotation,
      rotations: { ...state.rotations },
      rows,
      eliminatedIds,
      poisonedCupIds: state.cups.filter(c => c.poison).map(c => c.id)
    }
    const poisonNames = state.cups.filter(c => c.poison).map(c => `${c.emoji}${c.name}`)
    const hit = rows.filter(r => r.poison).map(r => `${r.playerName}(${r.drinkName})`)
    pushReplay(state, 'round', `第${state.round}轮结算：毒酒 ${poisonNames.join('、')}；喝到毒酒：${hit.length ? hit.join('、') : '无人'}；转盘累计 ${totalRotation} 格`, {
      round: state.round,
      totalRotation,
      rows,
      eliminatedIds
    })

    state.phase = 'reveal'
    state.phaseEndsAt = now + state.opts.revealTime * 1000
  },

  _nextRound(state, now) {
    const alive = this._aliveIds(state)
    if (alive.length <= 1) {
      this._finish(state, alive[0] || null)
      return
    }
    // 庄家按座位顺时针轮换到下一名存活玩家
    const seatOrder = state.seatOrder
    const currentSeat = state.players[state.dealerId]?.seat ?? -1
    let nextDealer = null
    for (let step = 1; step <= seatOrder.length; step++) {
      const seat = (currentSeat + step + seatOrder.length) % seatOrder.length
      const pid = seatOrder[seat]
      if (state.players[pid] && state.players[pid].alive) { nextDealer = pid; break }
    }
    if (nextDealer) state.dealerId = nextDealer
    this._startRound(state, now)
  },

  _finish(state, winnerId) {
    state.finished = true
    state.phase = 'finished'
    state.winnerId = winnerId || null
    pushReplay(state, 'finish', winnerId ? `${state.players[winnerId]?.playerName || winnerId} 获胜` : '游戏结束（无胜者）', { winnerId })
  },

  isFinished(state) {
    return state.finished === true
  },

  computeWinner(state) {
    return state.winnerId || null
  },

  getWinners(state) {
    return state.winnerId ? [state.winnerId] : []
  },

  getState(state, playerId) {
    const now = Date.now()
    const reveal = state.phase === 'reveal' || state.finished
    const seatPhase = state.phase === 'seat'
    const isDealer = playerId === state.dealerId
    const me = state.players[playerId]
    const currentSeatChooserId = state.seatPickOrder[state.seatPickIndex] || null
    const currentRotationActorId = state.rotationOrder[state.rotationIndex] || null
    const playerOrder = (seatPhase || !state.seatOrder.length)
      ? (state.participantOrder || Object.keys(state.players))
      : state.seatOrder

    const players = playerOrder.map(pid => {
      const p = state.players[pid]
      if (!p) return null
      const row = {
        playerId: pid,
        playerName: p.playerName,
        seat: p.seat,
        hp: p.hp,
        alive: p.alive,
        eliminated: !p.alive,
        isDealer: pid === state.dealerId,
        isMe: pid === playerId
      }
      // 分配完成后公开每名玩家获得的酒杯（不含毒性）
      if (state.assignment[pid] && state.phase !== 'assign') {
        const cup = state.cups.find(c => c.id === state.assignment[pid])
        if (cup) row.cup = publicCup(cup)
      }
      // 依次选择后立即公开
      row.rotation = state.rotations[pid] ?? null
      row.isCurrentActor = seatPhase ? pid === currentSeatChooserId : pid === currentRotationActorId
      return row
    }).filter(Boolean)

    const seats = Array.from({ length: (state.participantOrder || []).length }, (_, seat) => {
      const owner = Object.values(state.players).find(x => x.seat === seat)
      return {
        seat,
        playerId: owner ? owner.playerId : null,
        playerName: owner ? owner.playerName : '',
        isMe: !!(owner && owner.playerId === playerId)
      }
    })

    // 酒杯列表：毒酒位置仅庄家可见；结算后对所有人公开
    const showPoison = isDealer || reveal
    const cups = state.cups.map(c => {
      const base = publicCup(c)
      if (showPoison) base.poison = c.poison
      return base
    })

    const base = {
      status: state.status,
      started: state.started,
      finished: state.finished,
      round: state.round,
      phase: state.phase,
      dealerId: state.dealerId || null,
      dealerName: state.players[state.dealerId]?.playerName || '',
      secondsLeft: Math.max(0, Math.ceil((state.phaseEndsAt - now) / 1000)),
      aliveCount: Object.values(state.players).filter(p => p.alive).length,
      players,
      seats,
      seatPickOrder: [...(state.seatPickOrder || [])],
      seatPickOrderNames: (state.seatPickOrder || []).map(id => state.players[id]?.playerName || id),
      seatPickIndex: state.seatPickIndex || 0,
      currentSeatChooserId,
      cups,
      assignments: state.phase === 'assign' || seatPhase ? {} : { ...state.assignment },
      currentRotation: state.currentRotation || 0,
      rotationOrder: [...(state.rotationOrder || [])],
      rotationIndex: state.rotationIndex || 0,
      currentActorId: currentRotationActorId,
      rotationHistory: (state.rotationHistory || []).map(h => ({ ...h })),
      my: null,
      lastResult: reveal ? state.lastResult : null,
      winnerId: state.winnerId || null
    }

    if (me) {
      const myCupId = state.assignment[playerId]
      const myCup = myCupId ? state.cups.find(c => c.id === myCupId) : null
      base.my = {
        playerId,
        hp: me.hp,
        alive: me.alive,
        seat: me.seat,
        isDealer,
        canPickSeat: seatPhase && currentSeatChooserId === playerId,
        isMySeatTurn: seatPhase && currentSeatChooserId === playerId,
        canAssign: isDealer && state.phase === 'assign' && me.alive,
        canRotate: !isDealer && me.alive && state.phase === 'rotate' && currentRotationActorId === playerId,
        isMyTurn: state.phase === 'rotate' && currentRotationActorId === playerId,
        rotationChosen: state.rotations[playerId] != null,
        myRotation: state.rotations[playerId] ?? null,
        myCup: myCup ? publicCup(myCup) : null
      }
      if (isDealer && state.phase === 'assign') {
        base.dealerCups = state.cups.map(c => ({ ...publicCup(c), poison: c.poison }))
      }
    }
    return base
  },

  getAllStates(state) {
    const out = {}
    const order = (state.phase === 'seat' || !state.seatOrder.length)
      ? (state.participantOrder || Object.keys(state.players))
      : state.seatOrder
    for (const pid of order) {
      const p = state.players[pid]
      if (!p) continue
      const seatLabel = Number.isInteger(p.seat) ? `座位${p.seat + 1} ` : ''
      out[pid] = {
        score: p.hp,
        progress: p.hp,
        max: INITIAL_HP,
        done: !p.alive || state.finished,
        label: p.alive ? `${seatLabel}❤️ ${p.hp}` : '已淘汰',
        alive: p.alive,
        hp: p.hp,
        seat: p.seat,
        isDealer: pid === state.dealerId
      }
    }
    return out
  },

  checkTarget() {
    return false
  },

  describeEvent(state, playerId, action) {
    const p = state.players[playerId]
    const name = p ? p.playerName : playerId
    if (!action) return null
    if (action.type === 'pick_seat') return { text: `${name} 选择了座位 ${Number(action.seat) + 1}`, data: { seat: action.seat } }
    if (action.type === 'assign') return { text: `${name} 完成了酒杯分配`, data: null }
    if (action.type === 'rotate') {
      return {
        text: `${name} 旋转 ${action.rotation} 格`,
        data: { rotation: action.rotation, currentRotation: state.currentRotation || 0 }
      }
    }
    return null
  },

  getReplaySnapshot(state) {
    const players = {}
    const order = (state.phase === 'seat' || !state.seatOrder.length)
      ? (state.participantOrder || Object.keys(state.players))
      : state.seatOrder
    for (const pid of order) {
      const p = state.players[pid]
      if (!p) continue
      const cup = state.assignment[pid] ? state.cups.find(c => c.id === state.assignment[pid]) : null
      players[pid] = {
        座位: Number.isInteger(p.seat) ? p.seat + 1 : '—',
        生命: p.hp,
        存活: !!p.alive,
        庄家: pid === state.dealerId ? '是' : '',
        分配的酒杯: cup ? `${cup.emoji}${cup.name}${cup.poison ? '（毒）' : ''}` : '—',
        转盘选择: state.rotations[pid] == null ? '—' : state.rotations[pid]
      }
    }
    const summary = {
      轮次: state.round || 0,
      阶段: state.phase,
      庄家: state.players[state.dealerId]?.playerName || '—',
      存活人数: Object.values(state.players).filter(p => p.alive).length,
      选座顺序: (state.seatPickOrder || []).map(id => state.players[id]?.playerName || id).join(' → ') || '—',
      当前选座者: state.players[state.seatPickOrder[state.seatPickIndex]]?.playerName || '—',
      转盘当前累计: `${state.currentRotation || 0} 格`,
      行动顺序: (state.rotationOrder || []).map(id => state.players[id]?.playerName || id).join(' → ') || '—',
      当前行动者: state.players[state.rotationOrder[state.rotationIndex]]?.playerName || '—',
      本轮回合: state.cups.map(c => `${c.emoji}${c.name}${c.poison ? '☠️' : ''}`).join('、')
    }
    if (state.lastResult) {
      summary['上轮累计旋转'] = `${state.lastResult.totalRotation} 格`
      summary['上轮结果'] = state.lastResult.rows.map(r => `${r.playerName}${r.poison ? '☠️' : '✅'}`).join('、')
    }
    return { type: 'poison-drink', summary, players }
  },

  takeReplayEvents(state) {
    const evs = state._replayEvents || []
    state._replayEvents = []
    return evs
  }
})
