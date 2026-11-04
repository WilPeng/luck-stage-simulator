'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('http')
const { Server } = require('socket.io')
const { initBBMinigameSocket } = require('../src/socket/bbMinigame')

test('17 Poker starts inside the existing admin minigame room system', async (t) => {
  const server = http.createServer()
  const io = new Server(server)
  initBBMinigameSocket(io)
  const ns = io.of('/bigbrother-minigame')

  t.after(() => {
    try { io.close() } catch {}
    try { server.close() } catch {}
  })

  const room = ns.createRoom('hoh', 'poker17', [
    { playerId: 'p1', playerName: '玩家A', avatar: '/uploads/bbavatars/a.png' },
    { playerId: 'p2', playerName: '玩家B', avatar: '/uploads/bbavatars/b.png' }
  ], null, { name: '17 Poker' })

  assert.equal(room.minigameId, 'poker17')
  assert.equal(room.participants.length, 2)
  assert.equal(room.participants[0].avatar, '/uploads/bbavatars/a.png')

  room.setConnected('p1', true)
  room.setConnected('p2', true)
  const startResult = await new Promise((resolve) => {
    ns.startGame(room.roomId, { countdownSeconds: 0 }, resolve)
  })
  assert.equal(startResult.success, true)
  await new Promise(resolve => setTimeout(resolve, 40))

  assert.equal(room.status, 'playing')
  assert.ok(room.gameState)
  assert.equal(room.gameState.phase, 'cut')
  assert.equal(room.gameState.players[0].avatar, '/uploads/bbavatars/a.png')
  assert.equal(room.gameState.players[1].avatar, '/uploads/bbavatars/b.png')

  room.cleanup()
  io.close()
  server.close()
})
