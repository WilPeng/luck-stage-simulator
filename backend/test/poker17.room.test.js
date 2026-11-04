'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('http')
const { Server } = require('socket.io')
const { initBBMinigameSocket } = require('../src/socket/bbMinigame')

test('17 Poker room lifecycle: create, join, start and rematch', async (t) => {
  const server = http.createServer()
  const io = new Server(server)
  initBBMinigameSocket(io)
  const ns = io.of('/bigbrother-minigame')

  t.after(() => {
    try { io.close() } catch {}
    try { server.close() } catch {}
  })

  const room = ns.createPoker17Room({ playerId: 'p1', playerName: '玩家A' })
  assert.equal(room.status, 'waiting')
  assert.equal(room.hostId, 'p1')
  assert.equal(room.participants.length, 1)
  assert.equal(ns.listPoker17Rooms().length, 1)

  const joined = ns.joinPoker17Room(room.roomId, { playerId: 'p2', playerName: '玩家B' })
  assert.equal(joined.success, true)
  const summary = ns.getPoker17Room(room.roomId)
  assert.equal(summary.participants.length, 2)
  assert.equal(summary.maxPlayers, 2)
  assert.equal(summary.hostId, 'p1')

  room.setConnected('p1', true)
  room.setConnected('p2', true)
  const startResult = await new Promise((resolve) => {
    ns.startPoker17Room(room.roomId, 'p1', 0, resolve)
  })
  assert.equal(startResult.success, true)
  await new Promise(resolve => setTimeout(resolve, 40))
  assert.equal(room.status, 'playing')
  assert.ok(room.gameState)
  assert.equal(room.gameState.phase, 'cut')

  // Avoid writing to MongoDB in this unit test; emulate a finished room.
  room.cleanup()
  room.status = 'finished'

  const rematch = ns.rematchPoker17Room(room.roomId, 'p1')
  assert.equal(rematch.success, true)
  assert.ok(rematch.data.roomId)
  assert.equal(rematch.data.participants.length, 2)
  assert.equal(rematch.data.hostId, 'p1')

  rematch.room.cleanup()
  io.close()
  server.close()
})
