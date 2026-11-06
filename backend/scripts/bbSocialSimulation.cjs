/**
 * Big Brother House 社交场景模拟
 *
 * 模拟真实社交：
 *   1) 20 人分散在多个公共房间，各组内部聊天
 *   2) 全员移动到后院聚集，集体聊天
 *   3) 一部分人离开后院去别的房间，再聊天
 *
 * 同时校验管理员聊天记录里的「N 人看到」是否与发送时房间人数一致。
 *
 * 用法（仓库根目录）：
 *   $env:NODE_PATH="frontend/node_modules"
 *   $env:BB_ADMIN_USER="wil"; $env:BB_ADMIN_PASS="***"
 *   node backend/scripts/bbSocialSimulation.cjs
 *
 * 可选环境变量：
 *   BB_BASE_URL      默认 https://wil-bigbrother-game.site
 *   BB_LOAD_N        默认 20
 *   BB_PREFIX        默认 bbsocial
 *   BB_KEEP_ACCOUNTS 设为 1 则保留测试账号（便于在管理端查看“N 人看到”）
 *
 * 说明：删除测试账号后，管理员聊天记录里的“N 人看到”会变成 0
 * （统计只包含仍存在的房客），这是正常现象，不是消息可见性失效。
 */
const { io } = require('socket.io-client')

const BASE = (process.env.BB_BASE_URL || 'https://wil-bigbrother-game.site').replace(/\/$/, '')
const ADMIN_USER = process.env.BB_ADMIN_USER || 'wil'
const ADMIN_PASS = process.env.BB_ADMIN_PASS || ''
const N = Number(process.env.BB_LOAD_N || 20)
const PREFIX = process.env.BB_PREFIX || 'bbsocial'
const KEEP_ACCOUNTS = process.env.BB_KEEP_ACCOUNTS === '1'

const API = `${BASE}/api/bigbrother`
const SOCKET_URL = `${BASE}/bigbrother-house`

// 避开真实玩家所在的 living_room / dining_room
const SAFE_ROOMS = ['kitchen', 'gym', 'bedroom_a', 'bedroom_b', 'backyard']

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
    try { json = text ? JSON.parse(text) : null } catch { /* ignore */ }
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
  const r = await api('/houseguests?page=1&pageSize=200', { token: adminToken })
  if (!r.ok) throw new Error(`获取房客列表失败: ${r.status}`)
  return r.json?.data?.list || []
}

async function createGuest(adminToken, name, username, password) {
  const r = await api('/houseguests', {
    method: 'POST', token: adminToken,
    body: { name, username, password, role: 'houseguest' }
  })
  if (!r.ok || !r.json?.data?.id) throw new Error(`创建 ${username} 失败: ${r.status} ${r.text || ''}`)
  return r.json.data
}

async function deleteGuest(adminToken, id) {
  return api(`/houseguests/${id}`, { method: 'DELETE', token: adminToken })
}

async function guestLogin(username, password) {
  const r = await api('/auth/login', { method: 'POST', body: { username, password } })
  if (!r.ok || !r.json?.token) throw new Error(`房客 ${username} 登录失败: ${r.status}`)
  return r.json.token
}

async function movePlayer(adminToken, playerId, targetRoomId) {
  return api('/house/admin/move-player', { method: 'POST', token: adminToken, body: { playerId, targetRoomId } })
}

function connectGuest(token, index) {
  return new Promise((resolve) => {
    const rec = { index, socket: null, connected: false, roomId: null, errors: [], onMessage: null }
    const s = io(SOCKET_URL, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 15000 })
    rec.socket = s
    s.on('connect', () => { rec.connected = true; resolve(rec) })
    s.on('connect_error', (e) => { rec.errors.push(String(e?.message || e)); if (!rec.connected) resolve(rec) })
    s.on('house:error', (d) => rec.errors.push(String(d?.error || '')))
    s.on('house:history', (d) => { if (d?.roomId) rec.roomId = d.roomId })
    s.on('house:force-moved', (d) => { if (d?.targetRoomId) rec.roomId = d.targetRoomId })
    s.on('house:new-message', (d) => rec.onMessage?.(d))
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

function roomCounts(recs) {
  const counts = {}
  for (const r of recs) {
    if (!r.connected || !r.roomId) continue
    counts[r.roomId] = (counts[r.roomId] || 0) + 1
  }
  return counts
}

async function main() {
  if (!ADMIN_PASS) throw new Error('请通过 BB_ADMIN_PASS 提供管理员密码')
  console.log('=== Big Brother House 社交场景模拟 ===')
  console.log(`目标: ${BASE}`)
  console.log(`人数: ${N} | 房间: ${SAFE_ROOMS.join(' / ')}`)
  console.log('')

  const adminToken = await adminLogin()
  console.log('[1/8] 管理员登录成功')

  const existing = await listGuests(adminToken)
  const stale = existing.filter(g => String(g.username || '').startsWith(PREFIX))
  for (const g of stale) await deleteGuest(adminToken, g.id)
  if (stale.length) console.log(`      清理历史测试账号 ${stale.length} 个`)

  const password = `Soc${Math.random().toString(36).slice(2, 10)}`
  const guests = []
  for (let i = 0; i < N; i++) {
    const idx = String(i + 1).padStart(2, '0')
    const g = await createGuest(adminToken, `社交${idx}`, `${PREFIX}${idx}`, password)
    guests.push({ ...g, username: `${PREFIX}${idx}`, password })
  }
  console.log(`[2/8] 已创建 ${guests.length} 个临时房客`)

  // ===== 初始分组：分散在多个房间 =====
  const initialPlan = []
  const initialRooms = ['kitchen', 'gym', 'bedroom_a', 'bedroom_b']
  const split = [6, 5, 5, 4] // 20 人
  let gi = 0
  for (let r = 0; r < initialRooms.length; r++) {
    for (let k = 0; k < split[r] && gi < guests.length; k++, gi++) {
      initialPlan.push({ guest: guests[gi], room: initialRooms[r] })
    }
  }
  for (const p of initialPlan) {
    const r = await movePlayer(adminToken, p.guest.id, p.room)
    if (!r.ok) console.warn(`      移动 ${p.guest.username} 到 ${p.room} 失败: ${r.status}`)
  }
  console.log('[3/8] 已分散到:', ['kitchen', 'gym', 'bedroom_a', 'bedroom_b'].map((room, i) => `${room}=${split[i]}`).join(', '))

  // 连接 socket
  const recs = []
  for (let i = 0; i < guests.length; i++) {
    const token = await guestLogin(guests[i].username, guests[i].password)
    recs.push(await connectGuest(token, i))
    await sleep(40)
  }
  try {
    await waitFor(() => recs.every(r => r.connected && r.roomId), 20000, '全部连接并进入房间')
  } catch (e) { console.warn('      ' + e.message) }
  console.log(`[4/8] socket 连接 ${recs.filter(r => r.connected).length}/${N}`)

  // ===== 记录发送与接收 =====
  const msgInfo = new Map() // content -> { sendAt, expectedRoom, expectedSeen, received:Set, lat:[] }
  for (const rec of recs) {
    rec.onMessage = (d) => {
      const msg = d?.message
      if (!msg?.content) return
      const info = msgInfo.get(msg.content)
      if (!info || info.received.has(rec.index)) return
      info.received.add(rec.index)
      info.lat.push(performance.now() - info.sendAt)
    }
  }

  const phases = []
  let seq = 0

  async function chatPhase(name, label) {
    const counts = roomCounts(recs)
    const contents = []
    // 同一房间的人几乎同时发言（0-150ms 抖动），模拟真实对话
    for (const rec of recs) {
      if (!rec.connected || !rec.roomId) continue
      const content = `${PREFIX}-${name}-${seq++}-u${rec.index}`
      const info = {
        content,
        sendAt: performance.now(),
        roomId: rec.roomId,
        expectedSeen: counts[rec.roomId] || 0,
        received: new Set(),
        lat: [],
        sender: rec.index
      }
      msgInfo.set(content, info)
      contents.push(content)
      setTimeout(() => rec.socket.emit('house:send-message', { roomId: rec.roomId, content }), Math.floor(Math.random() * 150))
    }
    try {
      await waitFor(() => contents.every(c => msgInfo.get(c)?.received.size >= (msgInfo.get(c)?.expectedSeen || 0)), 10000, `${label} 广播`)
    } catch { /* 统计里体现 */ }
    await sleep(250)
    return { contents, counts }
  }

  // Phase A：分组聊天
  const a = await chatPhase('A', '分组聊天')
  phases.push({ name: 'A 分组聊天', contents: a.contents, description: '分散在各房间内部聊天' })
  console.log('[5/8] 阶段 A 分组聊天完成:', Object.entries(a.counts).map(([r, c]) => `${r}=${c}`).join(', '))

  // Phase B：全员聚集后院
  const moveStart = performance.now()
  const moveResults = await Promise.all(guests.map(g => movePlayer(adminToken, g.id, 'backyard')))
  try { await waitFor(() => recs.every(r => r.roomId === 'backyard'), 15000, '全员到达后院') } catch (e) { console.warn('      ' + e.message) }
  console.log(`[6/8] 全员聚集后院: 移动成功 ${moveResults.filter(r => r.ok).length}/${N}，用时 ${(performance.now() - moveStart).toFixed(0)}ms`)

  const b = await chatPhase('B', '聚集聊天')
  phases.push({ name: 'B 后院聚集', contents: b.contents, description: '20 人集中在后院聊天' })
  console.log('      阶段 B 后院人数:', b.counts.backyard)

  // Phase C：一半人离开
  const leavers = guests.slice(10)
  const cMoveStart = performance.now()
  const cMoveResults = await Promise.all(leavers.map((g, i) => movePlayer(adminToken, g.id, i % 2 === 0 ? 'kitchen' : 'gym')))
  try { await waitFor(() => recs.slice(10).every(r => r.roomId !== 'backyard'), 15000, '部分人离开后院') } catch (e) { console.warn('      ' + e.message) }
  console.log(`[7/8] 10 人离开后院: 移动成功 ${cMoveResults.filter(r => r.ok).length}/10，用时 ${(performance.now() - cMoveStart).toFixed(0)}ms`)

  const c = await chatPhase('C', '分散聊天')
  const cCounts = roomCounts(recs)
  phases.push({ name: 'C 部分离开', contents: c.contents, description: '10 人留在后院，10 人前往厨房/健身房' })
  console.log('      阶段 C 房间人数:', Object.entries(cCounts).map(([r, c2]) => `${r}=${c2}`).join(', '))

  // ===== 查询管理员聊天记录，核对「N 人看到」 =====
  const logs = await api('/house/admin/chat-logs', { token: adminToken })
  if (!logs.ok) throw new Error(`获取聊天记录失败: ${logs.status}`)
  const seenMap = new Map()
  for (const m of (logs.json?.data?.messages || [])) {
    seenMap.set(m.content, Array.isArray(m.seenBy) ? m.seenBy.length : 0)
  }

  console.log('')
  console.log('=== 「N 人看到」核对（发送时房间人数 vs 实际统计） ===')
  for (const ph of phases) {
    const rows = ph.contents.map(c2 => {
      const info = msgInfo.get(c2)
      return { room: info?.roomId, expected: info?.expectedSeen, actual: seenMap.get(c2) }
    }).filter(r => r.expected != null)
    const mismatches = rows.filter(r => r.actual !== r.expected)
    const expectedAvg = rows.length ? (rows.reduce((s, r) => s + r.expected, 0) / rows.length).toFixed(1) : '0'
    const actualAvg = rows.length ? (rows.reduce((s, r) => s + r.actual, 0) / rows.length).toFixed(1) : '0'
    console.log(`${ph.name}: 消息 ${rows.length} 条 | 期望看到人数均值 ${expectedAvg} | 实际 ${actualAvg} | 不一致 ${mismatches.length}`)
    if (mismatches.length) {
      console.log('  不一致样本:', mismatches.slice(0, 5).map(m => `${m.room} 期望${m.expected}/实际${m.actual}`).join(', '))
    }
  }

  // ===== 延迟汇总 =====
  const allLat = []
  for (const info of msgInfo.values()) allLat.push(...info.lat)
  console.log('')
  console.log('=== 聊天延迟（发送 -> 同房间其他人在线收到） ===')
  console.log(JSON.stringify(stats(allLat)))

  const totalDisc = recs.length - recs.filter(r => r.connected).length
  const allErrors = recs.flatMap(r => r.errors)
  console.log(`连接失败/断开: ${totalDisc} | 客户端错误: ${allErrors.length}`)
  if (allErrors.length) console.log('错误样本:', allErrors.slice(0, 6))

  // ===== 清理 =====
  for (const rec of recs) { try { rec.socket.disconnect() } catch { /* ignore */ } }
  if (KEEP_ACCOUNTS) {
    console.log('')
    console.log('BB_KEEP_ACCOUNTS=1：临时账号已保留，可在管理端查看「N 人看到」。')
    console.log('账号列表:', guests.map(g => g.username).join(', '))
    console.log('查看完后请清理：node backend/scripts/bbCleanLoadTestData.cjs "社交"')
  } else {
    let deleted = 0
    for (const g of guests) { const r = await deleteGuest(adminToken, g.id); if (r.ok) deleted++ }
    console.log('')
    console.log(`[8/8] 已删除临时账号 ${deleted}/${guests.length}`)
    console.log('提示：删除账号后，管理端这些消息的「N 人看到」会显示 0，因为统计只包含仍存在的房客。')
  }
}

main().catch(e => { console.error('模拟失败:', e); process.exit(1) })
