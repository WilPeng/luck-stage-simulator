/**
 * 弹珠得分 (Marble Score)
 *
 * 规则：
 *  - 每局开始时随机生成一张不规则区域地图（Voronoi 区域），每个区域分值互不相同且本局固定；
 *  - 选手发射弹珠时有两个因素：
 *      方向：地图上的方向箭头围绕正上方左右摆动；
 *      力度：地图外的蓄力条来回起伏，决定弹珠飞出的距离；
 *    两者分别以不同周期、不同幅度持续变化，选手需要在合适的瞬间点击发射；
 *  - 落点所在区域的分值即为本次得分（不在图内提前展示落点）。
 *
 * 模式：
 *  - elimination：每轮所有存活选手同时发射一次，本轮最低分淘汰 1 人，直到剩下最后一人；
 *  - single：随机顺序轮流发射，每人仅 1 次机会，最高分者获胜（同分按落点精度判定）；
 *  - points-all：若干轮，每轮所有选手同时发射，累计得分最高者获胜；
 *  - points-turn：若干轮，每轮选手按随机顺序逐个发射，累计得分最高者获胜；
 *  - pk：随机 2 人 PK，低分者淘汰；获胜者从剩余选手中选择 2 人进行下一场，直到剩下 1 人。
 */
const { registerGame } = require('./index')

const MAP_W = 100
const MAP_H = 100
const ORIGIN = { x: 50, y: 100 } // 发射点在底边中点
const MIN_DIST = 5
const MAX_DIST = 88
const MAX_ANGLE = 33 // 箭头最大摆动角度（度）

const PLAYER_COLORS = [
  '#ff6b6b', '#4ecdc4', '#ffd166', '#a78bfa', '#60a5fa',
  '#f472b6', '#34d399', '#fb923c', '#e879f9', '#38bdf8',
  '#facc15', '#f87171', '#2dd4bf', '#c084fc', '#fbbf24',
  '#93c5fd', '#f9a8d4', '#6ee7b7', '#fdba74', '#d8b4fe'
]

function clamp(v, min, max, dflt) {
  const n = Number(v)
  if (!Number.isFinite(n)) return dflt
  return Math.max(min, Math.min(max, n))
}

function rand(min, max) {
  return min + Math.random() * (max - min)
}

function round1(v) {
  return Math.round(v * 10) / 10
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ---------- 地图：Voronoi 不规则区域 ----------

// 保留 nx*x + ny*y <= c 的一侧
function clipHalfPlane(poly, nx, ny, c) {
  const EPS = 1e-9
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const fa = nx * a.x + ny * a.y - c
    const fb = nx * b.x + ny * b.y - c
    if (fa <= EPS) out.push(a)
    if ((fa > EPS && fb < -EPS) || (fa < -EPS && fb > EPS)) {
      const t = fa / (fa - fb)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

function pushDistinct(poly, p) {
  if (!poly.length) {
    poly.push(p)
    return
  }
  const last = poly[poly.length - 1]
  if (Math.abs(last.x - p.x) > 1e-7 || Math.abs(last.y - p.y) > 1e-7) poly.push(p)
}

function cleanPolygon(poly) {
  const out = []
  for (const p of poly) {
    pushDistinct(out, { x: round1(p.x), y: round1(p.y) })
  }
  if (out.length > 1) {
    const first = out[0]
    const last = out[out.length - 1]
    if (Math.abs(first.x - last.x) < 1e-7 && Math.abs(first.y - last.y) < 1e-7) out.pop()
  }
  return out
}

function voronoiCell(seed, seeds) {
  let poly = [
    { x: 0, y: 0 }, { x: MAP_W, y: 0 },
    { x: MAP_W, y: MAP_H }, { x: 0, y: MAP_H }
  ]
  for (const other of seeds) {
    if (other === seed) continue
    const nx = other.x - seed.x
    const ny = other.y - seed.y
    const c = (other.x * other.x + other.y * other.y - seed.x * seed.x - seed.y * seed.y) / 2
    poly = clipHalfPlane(poly, nx, ny, c)
    if (poly.length === 0) break
  }
  return cleanPolygon(poly)
}

function cellColor(score, maxScore) {
  const minScore = 10
  const span = Math.max(1, (maxScore || 100) - minScore)
  const t = Math.max(0, Math.min(1, (score - minScore) / span))
  const hue = 255 - t * 200
  const sat = 62 + t * 18
  const light = 56 - t * 8
  return `hsl(${Math.round(hue)}, ${Math.round(sat)}%, ${Math.round(light)}%)`
}

function generateMap(cellCount, retry = 0) {
  const parsed = Math.round(Number(cellCount))
  const n = Math.max(3, Number.isFinite(parsed) ? parsed : 10)
  const seeds = []
  let attempts = 0
  // 区域越多，种子间距越小；数量不设上限
  const minGap = Math.max(1.2, Math.min(14, Math.sqrt(4000 / n) * 0.9))
  const useGap = n <= 80
  const maxAttempts = Math.max(n * 120, 600)

  while (seeds.length < n && attempts < maxAttempts) {
    attempts++
    const angle = rand((-MAX_ANGLE + 2) * Math.PI / 180, (MAX_ANGLE - 2) * Math.PI / 180)
    const r = Math.sqrt(Math.random())
    const dist = MIN_DIST + 5 + r * (MAX_DIST - MIN_DIST - 9)
    const x = ORIGIN.x + Math.sin(angle) * dist
    const y = ORIGIN.y - Math.cos(angle) * dist
    if (x < 3 || x > MAP_W - 3 || y < 4 || y > MAP_H - 8) continue
    if (useGap && seeds.some(s => Math.hypot(s.x - x, s.y - y) < minGap)) continue
    seeds.push({ x, y, dist })
  }

  // 兜底补点：保证达到管理员设置的区域数量
  let guard = 0
  while (seeds.length < n && guard++ < n * 8 + 1000) {
    const angle = rand((-MAX_ANGLE + 2) * Math.PI / 180, (MAX_ANGLE - 2) * Math.PI / 180)
    const r = Math.sqrt(Math.random())
    const dist = MIN_DIST + 5 + r * (MAX_DIST - MIN_DIST - 9)
    const x = ORIGIN.x + Math.sin(angle) * dist
    const y = ORIGIN.y - Math.cos(angle) * dist
    if (x < 1 || x > MAP_W - 1 || y < 1 || y > MAP_H - 1) continue
    if (useGap && guard < n * 2 && seeds.some(s => Math.hypot(s.x - x, s.y - y) < minGap * 0.6)) continue
    seeds.push({ x, y, dist })
  }

  // 按距离远近分配互不相同的分值：越远越高分
  const ranked = [...seeds].sort((a, b) => a.dist - b.dist)
  const scoreMap = new Map(ranked.map((s, i) => [s, (i + 1) * 10]))
  const maxScore = Math.max(10, seeds.length * 10)

  const cells = seeds.map((seed, idx) => {
    const score = scoreMap.get(seed) || 10
    return {
      id: idx + 1,
      score,
      color: cellColor(score, maxScore),
      seed: { x: round1(seed.x), y: round1(seed.y) },
      points: voronoiCell(seed, seeds)
    }
  })

  // 极少数情况下 Voronoi 可能产生退化区域，重新生成整张地图
  if (cells.some(c => c.points.length < 3) && retry < 4) {
    return generateMap(cellCount, retry + 1)
  }

  return {
    width: MAP_W,
    height: MAP_H,
    origin: { x: ORIGIN.x, y: ORIGIN.y },
    minDistance: MIN_DIST,
    maxDistance: MAX_DIST,
    maxAngle: MAX_ANGLE,
    cells
  }
}

function findCell(map, x, y) {
  if (!map || x < 0 || x > map.width || y < 0 || y > map.height) return null
  let best = null
  let bestD = Infinity
  for (const cell of map.cells) {
    const dx = cell.seed.x - x
    const dy = cell.seed.y - y
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = cell
    }
  }
  return best
}

// ---------- 摆动参数 ----------

function makeOscillator() {
  // 方向与力度的变化周期、幅度都随机，并确保两者周期有明显差异
  const dirPeriod = rand(3000, 4600)
  let powPeriod = rand(1700, 2600)
  let guard = 0
  while (Math.abs(powPeriod - dirPeriod) < 700 && guard++ < 30) {
    powPeriod = rand(1700, 2600)
  }
  return {
    dirAmp: rand(24, MAX_ANGLE),
    dirPeriod,
    dirPhase: Math.random() * Math.PI * 2,
    powAmp: rand(0.86, 1),
    powPeriod,
    powPhase: Math.random() * Math.PI * 2
  }
}

function computeShot(map, osc, t) {
  const tt = Math.max(0, Number(t) || 0)
  const angle = osc.dirAmp * Math.sin((2 * Math.PI * tt) / osc.dirPeriod + osc.dirPhase)
  const powerRaw = 0.5 + 0.5 * osc.powAmp * Math.sin((2 * Math.PI * tt) / osc.powPeriod + osc.powPhase)
  const power = Math.max(0, Math.min(1, powerRaw))
  const rad = angle * Math.PI / 180
  const dist = map.minDistance + power * (map.maxDistance - map.minDistance)
  const x = map.origin.x + Math.sin(rad) * dist
  const y = map.origin.y - Math.cos(rad) * dist
  const cell = findCell(map, x, y)
  return {
    angle: round1(angle),
    power: Math.round(power * 100),
    powerRaw: Math.round(power * 1000) / 1000,
    x: round1(x),
    y: round1(y),
    score: cell ? cell.score : 0,
    cellId: cell ? cell.id : null
  }
}

function publicThrow(shot) {
  if (!shot) return null
  return {
    playerId: shot.playerId,
    playerName: shot.playerName,
    color: shot.color,
    seat: shot.seat,
    round: shot.round,
    angle: shot.angle,
    power: shot.power,
    x: shot.x,
    y: shot.y,
    score: shot.score,
    cellId: shot.cellId,
    at: shot.at
  }
}

const MODE_LABELS = {
  elimination: '淘汰模式',
  single: '单轮模式',
  'points-all': '多轮积分 · 同时发射',
  'points-turn': '多轮积分 · 轮流发射',
  pk: '随机PK淘汰'
}

const MODE_DESCRIPTIONS = {
  elimination: '随机地图固定不变。每轮所有存活选手同时发射，最低分淘汰 1 人（并列最低随机淘汰其中 1 人），直到最后一人。',
  single: '随机地图固定不变。随机顺序轮流发射，每人 1 次机会，最高分获胜；若最高分并列，落点更接近区域中心者胜。',
  'points-all': '随机地图固定不变。共进行若干轮，每轮所有选手同时发射，得分累计；总积分最高者获胜。',
  'points-turn': '随机地图固定不变。共进行若干轮，每轮选手按随机顺序逐个发射，得分累计；总积分最高者获胜。',
  pk: '随机选出 2 人进行弹珠 PK，低分者淘汰；获胜者从剩余选手中挑选 2 人进行下一场 PK，直到剩下最后 1 人。'
}

function hitDistance(map, shot) {
  if (!map || !shot) return Infinity
  const cell = map.cells.find(c => c.id === shot.cellId)
  if (!cell) return Infinity
  return Math.hypot(shot.x - cell.seed.x, shot.y - cell.seed.y)
}

registerGame({
  id: 'marble-score',
  name: '弹珠得分',
  icon: '🎱',
  description: '随机生成每个区域分值互不相同的不规则地图，方向箭头与蓄力条以不同周期摆动，点击发射弹珠；支持淘汰、单轮、多轮积分、轮流积分与随机PK淘汰五种模式',
  category: 'skill',
  playerCount: { min: 2, max: 20 },
  duration: 3600,
  needsServerTick: true,
  serverTickMs: 300,
  broadcastState: true,

  init(participants, _pool, options = {}) {
    const allowedModes = ['elimination', 'single', 'points-all', 'points-turn', 'pk']
    const mode = allowedModes.includes(options.mode) ? options.mode : 'elimination'
    const opts = {
      mode,
      aimTime: clamp(options.aimTime, 5, 60, 12),
      resultTime: clamp(options.resultTime, 1, 15, 4),
      cellCount: Math.max(3, Math.round(Number(options.cellCount) || 10)),
      roundCount: Math.round(clamp(options.roundCount, 1, 99, 5)),
      pickTime: clamp(options.pickTime, 5, 180, 15)
    }
    const map = generateMap(opts.cellCount)
    const players = {}
    const names = {}
    const scores = {}
    participants.forEach((p, i) => {
      players[p.playerId] = {
        playerId: p.playerId,
        playerName: p.playerName || p.playerId,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        seat: i + 1,
        alive: true,
        totalScore: 0,
        lastScore: null,
        throwCount: 0,
        eliminatedRound: null
      }
      names[p.playerId] = p.playerName || p.playerId
      scores[p.playerId] = 0
    })
    const order = shuffle(participants.map(p => p.playerId))
    return {
      status: 'ready',
      started: false,
      finished: false,
      winnerId: null,
      winners: [],
      mode,
      opts,
      map,
      players,
      names,
      scores,
      order,
      roundOrder: [],
      turnIndex: 0,
      turnId: null,
      round: 0,
      phase: 'idle',
      phaseStartAt: 0,
      phaseEndsAt: 0,
      roundThrows: {},
      allThrows: [],
      lastThrow: null,
      lastEliminated: [],
      winnerPending: null,
      tieBreak: null,
      history: [],
      osc: {},
      pkPair: [],
      pickerId: null,
      pkMatchWinnerId: null,
      _replayEvents: []
    }
  },

  tick(state) {
    if (state.status !== 'playing' || state.finished) return
    const now = Date.now()

    if (!state.started) {
      state.started = true
      this._startMode(state, now)
      return
    }

    if (now < state.phaseEndsAt) return

    if (state.phase === 'pick') {
      this._autoPickPair(state, now)
      return
    }

    if (state.phase === 'aim') {
      this._autoLaunch(state, now)
      return
    }

    if (state.phase === 'result') {
      this._afterResult(state, now)
    }
  },

  _startMode(state, now) {
    if (state.mode === 'elimination') return this._startEliminationRound(state, now)
    if (state.mode === 'single') return this._startSingleTurn(state, now, 0)
    if (state.mode === 'points-all') return this._startPointsAllRound(state, now)
    if (state.mode === 'points-turn') return this._startPointsTurnRound(state, now)
    if (state.mode === 'pk') {
      const alive = this._aliveIds(state)
      const pair = shuffle([...alive]).slice(0, 2)
      return this._startPkMatch(state, pair, now)
    }
  },

  _afterResult(state, now) {
    if (state.finished) return

    if (state.mode === 'elimination') {
      if (state.winnerPending) this._finish(state, [state.winnerPending])
      else this._startEliminationRound(state, now)
      return
    }

    if (state.mode === 'single') {
      if (state.turnIndex + 1 >= state.order.length) this._finishTopScore(state, { single: true })
      else this._startSingleTurn(state, now, state.turnIndex + 1)
      return
    }

    if (state.mode === 'points-all') {
      if (state.round >= state.opts.roundCount) this._finishTopScore(state)
      else this._startPointsAllRound(state, now)
      return
    }

    if (state.mode === 'points-turn') {
      if (state.turnIndex + 1 < state.roundOrder.length) {
        this._startPointsTurn(state, now, state.turnIndex + 1)
      } else {
        this._recordPointsRoundHistory(state)
        if (state.round >= state.opts.roundCount) this._finishTopScore(state)
        else this._startPointsTurnRound(state, now)
      }
      return
    }

    if (state.mode === 'pk') {
      const alive = this._aliveIds(state)
      if (alive.length <= 1) {
        state.tieBreak = null
        this._finish(state, alive)
      } else {
        state.phase = 'pick'
        state.phaseStartAt = now
        state.phaseEndsAt = now + state.opts.pickTime * 1000
        state.pickerId = state.pkMatchWinnerId && alive.includes(state.pkMatchWinnerId)
          ? state.pkMatchWinnerId
          : alive[0]
        state.turnId = state.pickerId
        state.osc = {}
        state._replayEvents.push({
          type: 'turn',
          text: `${state.players[state.pickerId]?.playerName || state.pickerId} 请选择下一组 PK 选手`,
          data: { pickerId: state.pickerId, alive }
        })
      }
    }
  },

  handleAction(state, playerId, action) {
    if (!state.players[playerId]) return { updated: false }
    if (!action) return { updated: false }
    if (state.finished || !state.started) return { updated: false }

    if (action.type === 'pick_pair') {
      if (state.phase !== 'pick') return { updated: false }
      if (state.pickerId !== playerId) {
        return { updated: false, result: { error: '还没有轮到你选择对决' } }
      }
      const pair = Array.isArray(action.pair) ? [...new Set(action.pair)] : []
      if (pair.length !== 2) return { updated: false, result: { error: '请选择 2 名选手' } }
      const alive = this._aliveIds(state)
      if (!pair.every(pid => alive.includes(pid) && state.players[pid])) {
        return { updated: false, result: { error: '只能选择仍在场上的选手' } }
      }
      this._startPkMatch(state, pair, Date.now())
      return { updated: true, finished: false, result: { pair } }
    }

    if (action.type !== 'launch') return { updated: false }
    if (state.phase !== 'aim') return { updated: false }
    if (state.phaseEndsAt && Date.now() > state.phaseEndsAt) {
      return { updated: false, result: { error: '本轮发射时间已到' } }
    }

    const ps = state.players[playerId]
    if (!ps.alive) return { updated: false, result: { error: '你已被淘汰，暂时无法发射' } }
    if ((state.mode === 'single' || state.mode === 'points-turn') && state.turnId !== playerId) {
      const current = state.turnId ? state.players[state.turnId]?.playerName : ''
      return { updated: false, result: { error: `还未轮到你，当前轮到 ${current || '其他选手'}` } }
    }
    if (state.mode === 'pk' && !state.pkPair.includes(playerId)) {
      return { updated: false, result: { error: '本场 PK 没有你，请等待下一场' } }
    }
    if (state.roundThrows[playerId]) {
      return { updated: false, result: { error: '本轮你已经发射过了' } }
    }

    const shot = this._recordThrow(state, playerId, Date.now(), { silent: true })
    this._afterAllThrows(state, Date.now())

    return {
      updated: true,
      finished: state.finished,
      winner: state.finished ? state.winnerId : undefined,
      result: {
        ...publicThrow(shot),
        myTurn: this._canAct(state, playerId)
      }
    }
  },

  _aliveIds(state) {
    return state.order.filter(pid => state.players[pid] && state.players[pid].alive)
  },

  _canAct(state, playerId) {
    if (!state || state.finished || state.phase !== 'aim') return false
    const ps = state.players[playerId]
    if (!ps || !ps.alive) return false
    if (state.roundThrows[playerId]) return false
    if (state.mode === 'single' || state.mode === 'points-turn') return state.turnId === playerId
    if (state.mode === 'pk') return state.pkPair.includes(playerId)
    return true
  },

  _startEliminationRound(state, now) {
    const alive = this._aliveIds(state)
    if (alive.length <= 1) {
      this._finish(state, alive)
      return
    }
    state.round += 1
    state.phase = 'aim'
    state.phaseStartAt = now
    state.phaseEndsAt = now + state.opts.aimTime * 1000
    state.roundThrows = {}
    state.lastThrow = null
    state.lastEliminated = []
    state.winnerPending = null
    state.osc = {}
    for (const pid of alive) state.osc[pid] = makeOscillator()

    state._replayEvents.push({
      type: 'round',
      text: `第 ${state.round} 轮开始，${alive.length} 名选手发射弹珠`,
      data: { round: state.round, alive, mode: state.mode }
    })
  },

  _startSingleTurn(state, now, index) {
    if (index >= state.order.length) {
      this._finishTopScore(state, { single: true })
      return
    }
    const pid = state.order[index]
    state.turnIndex = index
    state.turnId = pid
    state.round = index + 1
    state.phase = 'aim'
    state.phaseStartAt = now
    state.phaseEndsAt = now + state.opts.aimTime * 1000
    state.roundThrows = {}
    state.lastThrow = null
    state.lastEliminated = []
    state.winnerPending = null
    state.osc = { [pid]: makeOscillator() }

    state._replayEvents.push({
      type: 'round',
      text: `第 ${index + 1} 位：${state.names[pid] || pid} 开始发射`,
      data: { round: state.round, playerId: pid, order: state.order }
    })
  },

  _startPointsAllRound(state, now) {
    state.round += 1
    state.phase = 'aim'
    state.phaseStartAt = now
    state.phaseEndsAt = now + state.opts.aimTime * 1000
    state.roundThrows = {}
    state.lastThrow = null
    state.lastEliminated = []
    state.winnerPending = null
    state.tieBreak = null
    state.turnId = null
    state.osc = {}
    for (const pid of state.order) state.osc[pid] = makeOscillator()

    state._replayEvents.push({
      type: 'round',
      text: `积分赛第 ${state.round}/${state.opts.roundCount} 轮开始，所有选手同时发射`,
      data: { round: state.round, roundCount: state.opts.roundCount, mode: state.mode }
    })
  },

  _startPointsTurnRound(state, now) {
    state.round += 1
    state.roundOrder = shuffle([...state.order])
    state.roundThrows = {}
    state.lastThrow = null
    state.lastEliminated = []
    state.winnerPending = null
    state.tieBreak = null
    state.turnIndex = 0
    state._replayEvents.push({
      type: 'round',
      text: `积分赛第 ${state.round}/${state.opts.roundCount} 轮开始，选手依次发射`,
      data: { round: state.round, roundCount: state.opts.roundCount, order: state.roundOrder }
    })
    this._startPointsTurn(state, now, 0)
  },

  _startPointsTurn(state, now, index) {
    if (index >= state.roundOrder.length) return
    const pid = state.roundOrder[index]
    state.turnIndex = index
    state.turnId = pid
    state.phase = 'aim'
    state.phaseStartAt = now
    state.phaseEndsAt = now + state.opts.aimTime * 1000
    state.lastThrow = null
    state.osc = { [pid]: makeOscillator() }

    state._replayEvents.push({
      type: 'turn',
      text: `第 ${state.round} 轮 · 轮到 ${state.names[pid] || pid} 发射`,
      data: { round: state.round, playerId: pid, turnIndex: index }
    })
  },

  _startPkMatch(state, pair, now) {
    state.round += 1
    state.pkPair = [...pair]
    state.pickerId = null
    state.turnId = null
    state.phase = 'aim'
    state.phaseStartAt = now
    state.phaseEndsAt = now + state.opts.aimTime * 1000
    state.roundThrows = {}
    state.lastThrow = null
    state.lastEliminated = []
    state.winnerPending = null
    state.tieBreak = null
    state.osc = {}
    for (const pid of pair) state.osc[pid] = makeOscillator()

    state._replayEvents.push({
      type: 'round',
      text: `第 ${state.round} 场 PK：${pair.map(pid => state.names[pid] || pid).join(' vs ')}`,
      data: { round: state.round, pair, mode: state.mode }
    })
  },

  _autoPickPair(state, now) {
    if (state.phase !== 'pick') return
    const alive = this._aliveIds(state)
    if (alive.length < 2) {
      this._finish(state, alive)
      return
    }
    const shuffled = shuffle([...alive])
    const pair = [shuffled[0], shuffled[1]]
    state._replayEvents.push({
      type: 'turn',
      text: `超时未选择，自动指定 ${pair.map(pid => state.names[pid] || pid).join(' vs ')}`,
      data: { pair, auto: true }
    })
    this._startPkMatch(state, pair, now)
  },

  _recordThrow(state, playerId, at, opts = {}) {
    const ps = state.players[playerId]
    const osc = state.osc[playerId]
    const shot = computeShot(state.map, osc || makeOscillator(), (at || Date.now()) - state.phaseStartAt)
    shot.playerId = playerId
    shot.playerName = ps.playerName
    shot.color = ps.color
    shot.seat = ps.seat
    shot.round = state.round
    shot.at = at || Date.now()

    state.roundThrows[playerId] = shot
    state.allThrows.push(shot)
    ps.totalScore += shot.score
    ps.lastScore = shot.score
    ps.throwCount += 1
    state.scores[playerId] = ps.totalScore
    state.lastThrow = shot

    if (!opts.silent) {
      state._replayEvents.push({
        type: 'launch',
        text: `${ps.playerName} 发射：方向 ${shot.angle}°，力度 ${shot.power}%，落入 ${shot.score} 分区`,
        data: { shot: publicThrow(shot) }
      })
    }

    if (state.mode === 'single') {
      state.history.push({
        round: state.round,
        mode: 'single',
        throws: [publicThrow(shot)],
        eliminated: []
      })
    }

    return shot
  },

  _autoLaunch(state, now) {
    if (state.phase !== 'aim') return
    if (state.mode === 'single' || state.mode === 'points-turn') {
      if (state.turnId && !state.roundThrows[state.turnId]) {
        this._recordThrow(state, state.turnId, now)
      }
    } else if (state.mode === 'pk') {
      for (const pid of state.pkPair) {
        if (!state.roundThrows[pid]) this._recordThrow(state, pid, now)
      }
    } else if (state.mode === 'points-all') {
      for (const pid of state.order) {
        if (!state.roundThrows[pid]) this._recordThrow(state, pid, now)
      }
    } else {
      const alive = this._aliveIds(state)
      for (const pid of alive) {
        if (!state.roundThrows[pid]) this._recordThrow(state, pid, now)
      }
    }
    this._afterAllThrows(state, now)
  },

  _afterAllThrows(state, now) {
    if (state.finished || state.phase !== 'aim') return

    if (state.mode === 'elimination') {
      const alive = this._aliveIds(state)
      if (!alive.every(pid => state.roundThrows[pid])) return
      this._resolveEliminationRound(state, now)
      return
    }

    if (state.mode === 'points-all') {
      if (!state.order.every(pid => state.roundThrows[pid])) return
      this._resolvePointsRound(state, now)
      return
    }

    if (state.mode === 'pk') {
      if (!state.pkPair.every(pid => state.roundThrows[pid])) return
      this._resolvePkMatch(state, now)
      return
    }

    // 单轮 / 多轮轮流积分：本次发射结算后展示，再由 tick 切换到下一位
    state.phase = 'result'
    state.phaseEndsAt = now + state.opts.resultTime * 1000
  },

  _resolvePointsRound(state, now) {
    this._recordPointsRoundHistory(state)
    state.phase = 'result'
    state.phaseEndsAt = now + state.opts.resultTime * 1000
  },

  _recordPointsRoundHistory(state) {
    const order = state.mode === 'points-turn'
      ? (state.roundOrder.length ? state.roundOrder : state.order)
      : state.order
    const throws = order.map(pid => publicThrow(state.roundThrows[pid])).filter(Boolean)
    state.history.push({
      round: state.round,
      mode: state.mode,
      throws,
      eliminated: []
    })

    const scoreText = order
      .filter(pid => state.roundThrows[pid])
      .map(pid => `${state.players[pid].playerName} ${state.roundThrows[pid].score}`)
      .join('，')
    state._replayEvents.push({
      type: 'round',
      text: `第 ${state.round} 轮结算：${scoreText}`,
      data: {
        round: state.round,
        throws,
        totals: { ...state.scores }
      }
    })
  },

  _resolvePkMatch(state, now) {
    const [a, b] = state.pkPair
    const ta = state.roundThrows[a]
    const tb = state.roundThrows[b]
    if (!ta || !tb) return

    let loserId = null
    let winnerId = null
    let tieBreak = null

    if (ta.score > tb.score) {
      winnerId = a
      loserId = b
    } else if (tb.score > ta.score) {
      winnerId = b
      loserId = a
    } else {
      const da = hitDistance(state.map, ta)
      const db = hitDistance(state.map, tb)
      if (da < db) {
        winnerId = a
        loserId = b
      } else if (db < da) {
        winnerId = b
        loserId = a
      } else {
        winnerId = Math.random() < 0.5 ? a : b
        loserId = winnerId === a ? b : a
        tieBreak = { type: 'random', tied: [a, b], winnerId }
      }
      if (!tieBreak) {
        tieBreak = {
          type: 'distance',
          tied: [a, b],
          winnerId,
          distances: {
            [a]: Math.round(da * 10) / 10,
            [b]: Math.round(db * 10) / 10
          }
        }
      }
    }

    const loser = state.players[loserId]
    loser.alive = false
    loser.eliminatedRound = state.round
    state.lastEliminated = [loserId]
    state.pkMatchWinnerId = winnerId
    state.pkLastTieBreak = tieBreak
    state.tieBreak = tieBreak

    const entry = {
      round: state.round,
      mode: 'pk',
      pair: [a, b],
      throws: [publicThrow(ta), publicThrow(tb)],
      eliminated: [loserId],
      winnerId,
      tieBreak
    }
    state.history.push(entry)
    state._replayEvents.push({
      type: 'eliminate',
      text: `第 ${state.round} 场 PK：${state.players[winnerId].playerName} 胜出，${loser.playerName} 被淘汰`,
      data: {
        round: state.round,
        pair: [a, b],
        winnerId,
        eliminated: [loserId],
        tieBreak,
        throws: entry.throws
      }
    })

    state.phase = 'result'
    state.phaseEndsAt = now + state.opts.resultTime * 1000
  },

  _resolveEliminationRound(state, now) {
    const alive = this._aliveIds(state)
    const rows = alive.map(pid => ({
      playerId: pid,
      playerName: state.players[pid].playerName,
      score: state.roundThrows[pid] ? state.roundThrows[pid].score : 0
    }))
    const lowest = Math.min(...rows.map(r => r.score))
    const candidates = rows.filter(r => r.score === lowest)
    const loser = candidates[Math.floor(Math.random() * candidates.length)]
    const ps = state.players[loser.playerId]
    ps.alive = false
    ps.eliminatedRound = state.round
    state.lastEliminated = [loser.playerId]

    const entry = {
      round: state.round,
      mode: 'elimination',
      throws: alive.map(pid => publicThrow(state.roundThrows[pid])).filter(Boolean),
      eliminated: [loser.playerId],
      lowestScore: lowest,
      tie: candidates.length > 1
    }
    state.history.push(entry)

    const remaining = this._aliveIds(state)
    if (remaining.length <= 1) state.winnerPending = remaining[0] || null

    state._replayEvents.push({
      type: 'eliminate',
      text: `第 ${state.round} 轮结算：${loser.playerName} 以最低分 ${lowest} 分被淘汰${candidates.length > 1 ? '（并列最低，随机判定）' : ''}`,
      data: {
        round: state.round,
        eliminated: [loser.playerId],
        eliminatedName: loser.playerName,
        lowestScore: lowest,
        tie: candidates.length > 1,
        throws: entry.throws
      }
    })

    state.phase = 'result'
    state.phaseEndsAt = now + state.opts.resultTime * 1000

    if (remaining.length <= 1) {
      state._replayEvents.push({
        type: 'finish',
        text: `仅剩 ${state.players[remaining[0]]?.playerName || '—'}，即将获得胜利`,
        data: { winnerId: remaining[0] || null }
      })
    }
  },

  _finishTopScore(state, opts = {}) {
    const single = !!opts.single
    let best = -Infinity
    for (const pid of state.order) {
      best = Math.max(best, state.scores[pid] || 0)
    }
    let winners = state.order.filter(pid => (state.scores[pid] || 0) === best)
    let tieBreak = null

    if (winners.length > 1) {
      const lastHistory = state.history[state.history.length - 1]
      const lastRoundScores = new Map()
      for (const t of (lastHistory?.throws || [])) lastRoundScores.set(t.playerId, t.score)

      const ranked = winners.map(pid => {
        const throws = state.allThrows.filter(t => t.playerId === pid)
        const precision = throws.length
          ? throws.reduce((sum, t) => sum + hitDistance(state.map, t), 0)
          : Infinity
        const lastAt = throws.length ? throws[throws.length - 1].at : Infinity
        return {
          pid,
          lastRoundScore: single ? (state.scores[pid] || 0) : (lastRoundScores.get(pid) ?? 0),
          precision,
          lastAt
        }
      }).sort((a, b) =>
        (b.lastRoundScore - a.lastRoundScore) ||
        (a.precision - b.precision) ||
        (a.lastAt - b.lastAt)
      )

      winners = [ranked[0].pid]
      tieBreak = {
        type: single ? 'distance' : 'points',
        tied: ranked.map(r => r.pid),
        winnerId: ranked[0].pid,
        lastRoundScores: Object.fromEntries(ranked.map(r => [r.pid, r.lastRoundScore])),
        precisions: Object.fromEntries(ranked.map(r => [r.pid, Math.round(r.precision * 10) / 10]))
      }
    }

    state.tieBreak = tieBreak
    this._finish(state, winners)
  },

  _finish(state, winnerIds) {
    if (state.finished) return
    const winners = (winnerIds || []).filter(pid => state.players[pid])
    state.finished = true
    state.phase = 'finished'
    state.winnerId = winners[0] || null
    state.winners = winners
    state.winnerPending = null

    const names = winners.map(pid => state.players[pid].playerName)
    let tieNote = ''
    if (state.tieBreak && state.tieBreak.winnerId === state.winnerId) {
      if (state.tieBreak.type === 'distance') {
        tieNote = `（最高分并列，${state.players[state.tieBreak.winnerId]?.playerName || ''} 落点更接近区域中心）`
      } else if (state.tieBreak.type === 'points') {
        tieNote = `（总积分并列，按最后一轮得分与落点精度判定）`
      } else if (state.tieBreak.type === 'random') {
        tieNote = '（同分，随机判定）'
      }
    }
    state._replayEvents.push({
      type: 'finish',
      text: names.length
        ? `游戏结束，胜者：${names.join('、')}${tieNote}`
        : '游戏结束，无胜者',
      data: { winnerId: state.winnerId, winners, tieBreak: state.tieBreak || null }
    })
  },

  isFinished(state) {
    return state.finished === true
  },

  getWinners(state) {
    if (state.finished) return state.winners || []
    return []
  },

  computeWinner(state) {
    return state.winnerId || null
  },

  getState(state, playerId) {
    const pid = playerId || ''
    const now = Date.now()
    const players = state.order.map((id, idx) => {
      const ps = state.players[id]
      const shot = state.roundThrows[id]
      return {
        playerId: id,
        playerName: ps.playerName,
        color: ps.color,
        seat: ps.seat || (idx + 1),
        alive: !!ps.alive,
        score: state.scores[id] || 0,
        lastScore: ps.lastScore,
        roundScore: shot ? shot.score : null,
        throws: ps.throwCount,
        eliminatedRound: ps.eliminatedRound
      }
    })

    return {
      status: state.status,
      started: state.started,
      finished: state.finished,
      mode: state.mode,
      modeLabel: MODE_LABELS[state.mode] || state.mode,
      now,
      phase: state.phase,
      round: state.round,
      roundCount: state.opts.roundCount,
      phaseStartAt: state.phaseStartAt,
      phaseEndsAt: state.phaseEndsAt,
      aimTime: state.opts.aimTime,
      resultTime: state.opts.resultTime,
      pickTime: state.opts.pickTime,
      map: state.map,
      players,
      order: state.order,
      roundOrder: state.roundOrder,
      turnId: state.turnId,
      turnIndex: state.turnIndex,
      pkPair: state.pkPair || [],
      pickerId: state.pickerId || null,
      isPicker: state.phase === 'pick' && state.pickerId === pid,
      pkMatchWinnerId: state.pkMatchWinnerId || null,
      myTurn: this._canAct(state, pid),
      myAlive: !!(state.players[pid] && state.players[pid].alive),
      myThrownThisRound: !!state.roundThrows[pid],
      osc: this._canAct(state, pid) ? (state.osc[pid] || null) : null,
      roundThrows: Object.values(state.roundThrows).map(publicThrow).filter(Boolean),
      lastThrow: publicThrow(state.lastThrow),
      lastEliminated: state.lastEliminated || [],
      history: state.history.slice(-80),
      scores: state.scores,
      winnerId: state.winnerId,
      winners: state.winners,
      tieBreak: state.tieBreak || null
    }
  },

  getAllStates(state) {
    const result = {}
    const maxCell = Math.max(10, ...(state.map.cells || []).map(c => c.score))
    const isPoints = state.mode === 'points-all' || state.mode === 'points-turn'
    const maxScore = isPoints ? maxCell * state.opts.roundCount : maxCell
    for (const pid of state.order) {
      const ps = state.players[pid]
      const shot = state.roundThrows[pid]
      const score = state.scores[pid] || 0
      let label = `${score} 分`
      if (state.mode === 'elimination') {
        label = ps.alive
          ? `本轮 ${shot ? shot.score : '—'} 分 · 累计 ${score}`
          : `第 ${ps.eliminatedRound || '?'} 轮淘汰`
      } else if (state.mode === 'points-all' || state.mode === 'points-turn') {
        label = `本轮 ${shot ? shot.score : '—'} 分 · 累计 ${score}`
      } else if (state.mode === 'pk') {
        label = ps.alive
          ? `本场 ${shot ? shot.score : '—'} 分 · 累计 ${score}`
          : `第 ${ps.eliminatedRound || '?'} 场淘汰`
      }
      result[pid] = {
        seat: ps.seat,
        color: ps.color,
        score,
        progress: Math.max(0, Math.min(maxScore, score)),
        max: maxScore,
        done: (state.mode === 'elimination' || state.mode === 'pk') ? !ps.alive : false,
        label
      }
    }
    return result
  },

  checkTarget() {
    return false
  },

  describeEvent(state, playerId, action, result) {
    if (!action) return null
    const name = state.names[playerId] || playerId
    if (action.type === 'pick_pair') {
      const pair = (result && result.pair) || action.pair || []
      return {
        text: `${name} 选择 ${pair.map(pid => state.names[pid] || pid).join(' 与 ')} 进行 PK`,
        data: { pickerId: playerId, pair }
      }
    }
    if (action.type !== 'launch') return null
    const r = result || {}
    return {
      text: `${name} 发射 → ${r.score != null ? r.score : 0} 分（方向 ${r.angle != null ? r.angle : '—'}°，力度 ${r.power != null ? r.power : '—'}%）`,
      data: {
        angle: r.angle,
        power: r.power,
        score: r.score,
        x: r.x,
        y: r.y,
        cellId: r.cellId
      }
    }
  },

  takeReplayEvents(state) {
    const evs = state._replayEvents || []
    state._replayEvents = []
    return evs
  },

  getReplayMeta(state) {
    const winners = state.winners || []
    const players = state.order.map(pid => {
      const ps = state.players[pid]
      const isAlive = !!ps.alive
      let status = '完成'
      if (state.mode === 'elimination' || state.mode === 'pk') status = isAlive ? '存活' : '淘汰'
      if (winners.includes(pid)) status = '获胜'
      return {
        playerId: pid,
        playerName: ps.playerName,
        seat: ps.seat,
        score: state.scores[pid] || 0,
        color: ps.color,
        status,
        details: [
          { label: '总得分', value: state.scores[pid] || 0 },
          { label: '发射次数', value: ps.throwCount || 0 },
          ...((state.mode === 'elimination' || state.mode === 'pk') && !isAlive
            ? [{ label: state.mode === 'pk' ? '淘汰场次' : '淘汰轮次', value: `第 ${ps.eliminatedRound || '?'} ${state.mode === 'pk' ? '场' : '轮'}` }]
            : [])
        ]
      }
    })

    return {
      type: 'marble-score',
      title: '弹珠得分',
      mode: state.mode,
      modeLabel: MODE_LABELS[state.mode] || state.mode,
      description: MODE_DESCRIPTIONS[state.mode] || '',
      map: state.map,
      summary: [
        { label: '模式', value: MODE_LABELS[state.mode] || state.mode },
        { label: '区域数', value: (state.map.cells || []).length },
        ...(state.mode === 'points-all' || state.mode === 'points-turn'
          ? [{ label: '轮数', value: state.opts.roundCount }]
          : []),
        { label: '回合数', value: state.history.length }
      ],
      players,
      order: state.order.map((pid, i) => ({
        index: i + 1,
        seat: state.players[pid].seat || (i + 1),
        playerId: pid,
        playerName: state.names[pid] || pid,
        color: state.players[pid].color
      })),
      history: state.history,
      allThrows: state.allThrows.map(publicThrow),
      winnerId: state.winnerId,
      winners,
      tieBreak: state.tieBreak || null
    }
  },

  getReplaySnapshot(state) {
    const players = {}
    for (const pid of state.order) {
      const ps = state.players[pid]
      const shot = state.roundThrows[pid]
      players[pid] = {
        状态: (state.mode === 'elimination' || state.mode === 'pk') ? (ps.alive ? '存活' : '已淘汰') : '参赛中',
        本轮得分: shot ? shot.score : '—',
        累计得分: state.scores[pid] || 0,
        落点: shot ? `${shot.x}, ${shot.y}` : '—'
      }
    }
    return {
      type: 'marble-score',
      mode: state.mode,
      round: state.round,
      phase: state.phase,
      map: state.map,
      summary: {
        模式: MODE_LABELS[state.mode] || state.mode,
        轮次: state.round,
        阶段: state.phase === 'aim'
          ? '发射中'
          : (state.phase === 'result' ? '结算展示' : (state.phase === 'pick' ? '选择下一组对决' : '已结束')),
        存活人数: this._aliveIds(state).length,
        本轮已发射: Object.keys(state.roundThrows).length,
        ...(state.mode === 'pk'
          ? {
              当前对阵: (state.pkPair || []).map(pid => state.players[pid]?.playerName || pid).join(' vs ') || '—',
              选择者: state.pickerId ? (state.players[state.pickerId]?.playerName || state.pickerId) : '—'
            }
          : {})
      },
      players,
      throws: Object.values(state.roundThrows).map(publicThrow).filter(Boolean),
      lastEliminated: state.lastEliminated || [],
      winnerId: state.winnerId
    }
  }
})
