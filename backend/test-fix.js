const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const server = http.createServer(async (req, res) => {
  try {
    const { initStore, getCollection } = require('./src/config/db');
    const store = await initStore();
    const col = getCollection('LVPlayer');
    const players = await col.find({ gameId: 'lovevariety', avatar: { $ne: null, $ne: '' } }).toArray();

    if (players.length === 0) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '无头像' }));
    }

    console.log('找到选手:', players.length);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => { console.error('archive error:', err.message); });

    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="lv-avatars-backup.zip"'
    });
    archive.pipe(res);

    const uploadsBase = path.resolve(__dirname);
    let processed = 0;

    for (const player of players) {
      const avatar = player.avatar;
      if (!avatar) continue;
      try {
        let buf = null;
        let ext = 'jpg';
        if (typeof avatar === 'string' && avatar.startsWith('/uploads/')) {
          const fp = path.join(uploadsBase, avatar);
          if (fs.existsSync(fp)) {
            ext = path.extname(avatar).replace('.', '') || 'jpg';
            buf = fs.readFileSync(fp);
          }
        }
        if (buf) {
          archive.append(buf, { name: player.id + '.' + ext });
          processed++;
        }
      } catch (e) { console.error('skip:', player.id, e.message); }
    }

    archive.on('finish', () => {
      console.log('完成: ' + processed + '/' + players.length);
    });
    archive.finalize();
    await store.close();
  } catch (e) {
    console.error('错误:', e.message);
    console.error('堆栈:', e.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  }
});

server.listen(3001, () => {
  console.log('测试服务器启动在 3001');
  http.get('http://localhost:3001', (res) => {
    console.log('状态码:', res.statusCode);
    console.log('Content-Type:', res.headers['content-type']);
    let data = [];
    res.on('data', chunk => data.push(chunk));
    res.on('end', () => {
      const total = Buffer.concat(data).length;
      console.log('响应大小:', total, 'bytes');
      server.close();
      process.exit(0);
    });
  });
});
