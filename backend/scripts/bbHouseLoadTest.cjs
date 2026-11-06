/**
 * Big Brother House 并发压测脚本
 *
 * 场景：N 个临时房客账号同时
 *   1) 登录并连接 /bigbrother-house
 *   2) 在同一房间内并发聊天（测发送->广播端到端延迟）
 *   3) 并发切换房间（管理员强制移动，触发服务端权威切换 / presence / monitor 广播）
 *   4) 结束后删除临时账号
 *
 * 用法（在仓库根目录）：
 *   $env:NODE_PATH="frontend/node_modules"
 *   node backend/scripts/bbHouseLoadTest.cjs
 *
 * 可用环境变量：
 *   BB_BASE_URL     默认 https://wil-bigbrother-game.site
 *   BB_ADMIN_USER   默认 admin
 *   BB_ADMIN_PASS   默认 ADMIN2026
 *   BB_LOAD_N       默认 20
 *   BB_CHAT_ROUNDS  默认 3
 *   BB_CHAT_GAP_MS  默认 300
 *   BB_SWITCH_ROUNDS 默认 3
 *   BB_ROOM_A       默认 prehouse   (admin_only，隔离，无真实玩家)
 *   BB_ROOM_B       默认 juryhouse  (admin_only，隔离，无真实玩家)
 *   BB_PREFIX       临时账号前缀，默认 bbq20
 *   BB_KEEP_ACCOUNTS 设为 1 则不删除临时账号
 *
 * 注意：聊天记录 / 位置历史会残留在隔离房间（服务端暂无按用户删除接口），
 * 账号本身会被删除。请仅在确认可接受的维护窗口运行。
 */
const { io } = require('socket.io-client')

const BASE = (process.env.BB_BASE_URL || 'https://wil-bigbrother-game.site').replace(/\/$/, '')
const ADMIN_USER = process.env.BB_ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.BB_ADMIN_PASS || 'ADMIN2026'
const N = Number(process.env.BB_LOAD_N || 20)
const CHAT_ROUNDS = Number(process.env.BB_CHAT_ROUNDS || 3)
const CHAT_GAP_MS = Number(process.env.BB_CHAT_GAP_MS || 300)
const SWITCH_ROUNDS = Number(process.env.BB_SWITCH_ROUNDS || 3)
const ROOM_A = process.env.BB_ROOM_A || 'prehouse'
const ROOM_B = process.env.BB_ROOM_B || 'juryhouse'
const PREFIX = process.env.BB_PREFIX || 'bbq20'
const KEEP_ACCOUNTS = process.env.BB_KEEP_ACCOUNTS === '1'

const API = `${BASE}/api/bigbrother`
const SOCKET_URL = `${BASE}/bigbrother-house`

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function api(path, { method = 'GET', token, body, timeout = 20000 } = {}) {
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), timeout)
  const t0 = performance.now()
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { /* non-json */ }
    return { ok: res.ok, status: res.status, json, text, ms: performance.now() - t0 }
  } catch (e) {
    return { ok: false, status: 0, error: e.name, ms: performance.now() - t0 }
  } finally {
    clearTimeout(to)
  }
}

function pct(arr, q) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}
function stats(arr) {
  if (!arr.length) return { n: 0 }
  const s = [...arr].sort((a, b) => a - b)
  const sum = s.reduce((a, b) => a + b, 0)
  return {
    n: s.length,
    min: +s[0].toFixed(1),
    p50: +pct(s, 0.5).toFixed(1),
    p95: +pct(s, 0.95).toFixed(1),
    p99: +pct(s, 0.99).toFixed(1),
    max: +s[s.length - 1].toFixed(1),
    avg: +(sum / s.length).toFixed(1)
  }
}

async function adminLogin() {
  const r = await api('/auth/admin/login', { method: 'POST', body: { username: ADMIN_USER, password: ADMIN_PASS } })
  if (!r.ok || !r.json?.token) throw new Error(`管理员登录失败: ${r.status} ${r.text || r.error || ''}`)
  return r.json.token
}

async function listGuests(adminToken) {
  const r = await api('/houseguests?page=1&pageSize=100', { token: adminToken })
  if (!r.ok) throw new Error(`获取房客列表失败: ${r.status}`)
  return r.json?.data?.list || []
}

async function deleteGuest(adminToken, id) {
  return api(`/houseguests/${id}`, { method: 'DELETE', token: adminToken })
}

async function createGuest(adminToken, name, username, password) {
  const r = await api('/houseguests', {
    method: 'POST', token: adminToken,
    body: { name, username, password, role: 'houseguest' }
  })
  if (!r.ok || !r.json?.data?.id) throw new Error(`创建账号 ${username} 失败: ${r.status} ${r.text || r.error || ''}`)
  return r.json.data
}

async function guestLogin(username, password) {
  const r = await api('/auth/login', { method: 'POST', body: { username, password } })
  if (!r.ok || !r.json?.token) throw new Error(`房客 ${username} 登录失败: ${r.status} ${r.text || r.error || ''}`)
  return r.json.token
}

async function movePlayer(adminToken, playerId, targetRoomId) {
  return api('/house/admin/move-player', { method: 'POST', token: adminToken, body: { playerId, targetRoomId } })
}

function connectGuest(token, index) {
  return new Promise((resolve) => {
    const rec = {
      index,
      socket: null,
      connected: false,
      connectMs: null,
      historyMs: null,
      roomId: null,
      forceMoved: [],
      errors: [],
      disconnects: 0,
      handlers: {}
    }
    const t0 = performance.now()
    const s = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 15000
    })
    rec.socket = s

    s.on('connect', () => {
      rec.connected = true
      rec.connectMs = performance.now() - t0
      resolve(rec)
    })
    s.on('connect_error', (e) => {
      rec.errors.push(`connect_error:${e?.message || e}`)
      if (!rec.connected) resolve(rec)
    })
    s.on('disconnect', () => { rec.disconnects++ })
    s.on('house:history', (d) => {
      if (d?.roomId) rec.roomId = d.roomId
      if (rec.historyMs == null) rec.historyMs = performance.now() - t0
    })
    s.on('house:force-moved', (d) => {
      rec.forceMoved.push({ at: performance.now(), targetRoomId: d?.targetRoomId })
      if (d?.targetRoomId) rec.roomId = d.targetRoomId
    })
    s.on('house:error', (d) => rec.errors.push(`house_error:${d?.error || ''}`))
    s.on('house:new-message', (d) => rec.handlers.onMessage?.(d))
  })
}

function waitFor(predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now()
    const tick = () => {
      if (predicate()) return resolve(performance.now() - t0)
      if (performance.now() - t0 > timeoutMs) return reject(new Error(`超时等待: ${label}`))
      setTimeout(tick, 25)
    }
    tick()
  })
}

async function main() {
  console.log('=== Big Brother House 并发压测 ===')
  console.log(`目标: ${BASE}`)
  console.log(`并发用户: ${N} | 聊天轮次: ${CHAT_ROUNDS} | 切换轮次: ${SWITCH_ROUNDS} | 隔离房间: ${ROOM_A} <-> ${ROOM_B}`)
  console.log('')

  const adminToken = await adminLogin()
  console.log('[1/7] 管理员登录成功')

  // 预清理同名测试账号
  const existing = await listGuests(adminToken)
  const stale = existing.filter(g => String(g.username || '').startsWith(PREFIX))
  for (const g of stale) {
    await deleteGuest(adminToken, g.id)
  }
  if (stale.length) console.log(`      清理历史测试账号 ${stale.length} 个`)

  // 创建账号
  const password = `Lt${Math.random().toString(36).slice(2, 10)}`
  const guests = []
  for (let i = 0; i < N; i++) {
    const idx = String(i + 1).padStart(2, '0')
    const username = `${PREFIX}${idx}`
    const g = await createGuest(adminToken, `压测${idx}`, username, password)
    guests.push({ ...g, username, password })
  }
  console.log(`[2/7] 已创建 ${guests.length} 个临时房客`)

  // 放入隔离房间 A（创建位置记录，避免进入真实玩家所在的客厅）
  let moved = 0
  for (const g of guests) {
    const r = await movePlayer(adminToken, g.id, ROOM_A)
    if (r.ok) moved++
  }
  console.log(`[3/7] 已将 ${moved}/${guests.length} 个房客放入隔离房间 ${ROOM_A}`)

  // 逐个登录拿 token 并连接 socket
  const recs = []
  for (let i = 0; i < guests.length; i++) {
    const g = guests[i]
    const token = await guestLogin(g.username, g.password)
    const rec = await connectGuest(token, i)
    recs.push(rec)
    await sleep(50)
  }

  // 等待所有连接 + 收到 history
  try {
    await waitFor(() => recs.every(r => r.connected), 20000, `${N} 个 socket 全部连接`)
    await waitFor(() => recs.every(r => r.historyMs != null), 20000, `${N} 个 socket 收到 house:history`)
  } catch (e) {
    console.warn(`      ${e.message}`)
  }
  const connectedCount = recs.filter(r => r.connected).length
  console.log(`[4/7] socket 连接 ${connectedCount}/${N} | 连接耗时 p50=${stats(recs.map(r => r.connectMs).filter(v => v != null)).p50}ms p95=${stats(recs.map(r => r.connectMs).filter(v => v != null)).p95}ms | history p95=${stats(recs.map(r => r.historyMs).filter(v => v != null)).p95}ms`)

  // ===== 聊天压测 =====
  const msgInfo = new Map() // content -> { sendAt, received:Set, lat:[] }
  let chatSent = 0
  for (const rec of recs) {
    rec.handlers.onMessage = (d) => {
      const msg = d?.message
      if (!msg || !msg.content) return
      const info = msgInfo.get(msg.content)
      if (!info) return
      if (info.received.has(rec.index)) return
      info.received.add(rec.index)
      info.lat.push(performance.now() - info.sendAt)
    }
  }

  for (let round = 1; round <= CHAT_ROUNDS; round++) {
    const contents = []
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i]
      if (!rec.connected || !rec.roomId) continue
      const content = `${PREFIX}-r${round}-u${i}-${Math.random().toString(36).slice(2, 6)}`
      msgInfo.set(content, { sendAt: performance.now(), received: new Set(), lat: [] })
      contents.push(content)
      rec.socket.emit('house:send-message', { roomId: rec.roomId, content })
      chatSent++
    }
    // 等待本轮消息被广播（最多 8 秒）
    try {
      await waitFor(() => contents.every(c => (msgInfo.get(c)?.received.size || 0) >= recs.length), 8000, `聊天第 ${round} 轮广播`)
    } catch (e) { /* 统计里体现丢包 */ }
    await sleep(CHAT_GAP_MS)
  }

  const allChatLat = []
  let delivered = 0
  for (const info of msgInfo.values()) {
    allChatLat.push(...info.lat)
    delivered += info.received.size
  }
  const expected = chatSent * recs.length
  const chatStats = stats(allChatLat)
  console.log(`[5/7] 聊天: 发送 ${chatSent} 条 | 预期投递 ${expected} | 实收 ${delivered} (${expected ? (delivered / expected * 100).toFixed(1) : 0}%) | 端到端延迟 p50=${chatStats.p50}ms p95=${chatStats.p95}ms p99=${chatStats.p99}ms max=${chatStats.max}ms`)

  // ===== 切换房间压测 =====
  const switchReports = []
  let currentRoom = ROOM_A
  for (let round = 1; round <= SWITCH_ROUNDS; round++) {
    const target = currentRoom === ROOM_A ? ROOM_B : ROOM_A
    // 清空上一轮记录
    for (const rec of recs) rec.forceMoved = []
    const start = performance.now()

    const results = await Promise.all(guests.map(g => movePlayer(adminToken, g.id, target)))
    const restOk = results.filter(r => r.ok).length
    const restMs = results.map(r => r.ms)

    try {
      await waitFor(() => recs.every(r => r.forceMoved.some(f => f.targetRoomId === target)), 15000, `切换第 ${round} 轮 force-moved`)
    } catch (e) { /* 记录 */ }
    const wall = performance.now() - start

    const pushLat = recs
      .map(r => {
        const f = r.forceMoved.find(x => x.targetRoomId === target)
        return f ? f.at - start : null
      })
      .filter(v => v != null)

    const pushStats = stats(pushLat)
    switchReports.push({ round, target, restOk, rest: stats(restMs), wall: +wall.toFixed(1), push: pushStats, reached: pushLat.length })
    console.log(`[6/7] 切换 #${round} -> ${target}: REST成功 ${restOk}/${N} (p95 ${stats(restMs).p95}ms) | 全部客户端收到 force-moved 用时 ${wall.toFixed(0)}ms | 推送延迟 p50=${pushStats.p50}ms p95=${pushStats.p95}ms | 覆盖 ${pushLat.length}/${N}`)
    currentRoom = target
    await sleep(400)
  }

  // ===== 汇总 =====
  console.log('')
  console.log('=== 汇总 ===')
  console.log('连接统计:', JSON.stringify(stats(recs.map(r => r.connectMs).filter(v => v != null))))
  console.log('聊天延迟:', JSON.stringify(chatStats), `投递率 ${expected ? (delivered / expected * 100).toFixed(1) : 0}%`)
  for (const s of switchReports) {
    console.log(`切换#${s.round}(${s.target}):`, `REST`, JSON.stringify(s.rest), `| 推送`, JSON.stringify(s.push), `| 覆盖 ${s.reached}/${N}`)
  }
  const totalDisc = recs.reduce((a, r) => a + r.disconnects, 0)
  const allErrors = recs.flatMap(r => r.errors)
  console.log(`断线次数: ${totalDisc} | 客户端错误: ${allErrors.length}`)
  if (allErrors.length) console.log('错误样本:', allErrors.slice(0, 8))

  // ===== 清理 =====
  for (const rec of recs) {
    try { rec.socket.disconnect() } catch { /* ignore */ }
  }
  if (KEEP_ACCOUNTS) {
    console.log('BB_KEEP_ACCOUNTS=1，保留临时账号:', guests.map(g => g.username).join(', '))
  } else {
    let deleted = 0
    for (const g of guests) {
      const r = await deleteGuest(adminToken, g.id)
      if (r.ok) deleted++
    }
    console.log(`[7/7] 已删除临时账号 ${deleted}/${guests.length}`)
  }
  console.log('完成。注意：隔离房间的聊天/位置历史仍会保留（服务端无按用户删除接口）。')
}

main().catch(e => {
  console.error('压测失败:', e)
  process.exit(1)
})
