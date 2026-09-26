/* 局域网伴侣页服务器（v1.30.0）：只读提供时钟+倒计时状态。
 * 安全属性：默认不启动；开关开启才监听；状态经 companion-protocol 白名单投影；
 * 端口冲突时按候选序列递增重试；所有路由只读。零外部依赖（node 内置 http/os）。 */
'use strict';
const http = require('http');
const os = require('os');

const PAGE = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TIMECORE 伴侣</title>
<style>
  html,body{margin:0;height:100%;background:#050a16;color:#dfe9f5;font-family:'Segoe UI',system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center}
  .phase{font-size:14px;letter-spacing:4px;opacity:.75;margin-bottom:10px;text-transform:uppercase}
  .rem{font-size:15vw;font-variant-numeric:tabular-nums;text-shadow:0 0 24px rgba(57,215,255,.35)}
  .clock{font-size:18px;opacity:.6;margin-top:14px;font-variant-numeric:tabular-nums}
  .meta{font-size:12px;opacity:.4;margin-top:26px}
  .pulse{animation:pulse .55s ease-out}
  @keyframes pulse{0%{transform:scale(1.06)}100%{transform:scale(1)}}
</style></head><body><div class="wrap">
  <div class="phase" id="ph">待机</div>
  <div class="rem" id="rem">--:--.---</div>
  <div class="clock" id="ck">--:--:--</div>
  <div class="meta">TIMECORE 伴侣 · 只读镜像 · 供局域网设备查看</div>
</div><script>
const PH = { IDLE:'待机', NORMAL:'运行', WARMUP:'预热', SURGE:'增强', PULSE:'脉冲', ZERO:'释放' };
let last = '';
const es = new EventSource('/events');
es.onmessage = ev => { try { render(JSON.parse(ev.data)); } catch (_) {} };
es.onerror = () => { document.getElementById('ph').textContent = '重连中…'; };
fetch('/state').then(r => r.json()).then(render).catch(() => {});
function render(s) {
  if (!s || typeof s.remainingMs !== 'number') return;
  const neg = s.remainingMs < 0 ? '-' : '';
  const m = Math.floor(Math.abs(s.remainingMs) / 60000), sec = Math.floor(Math.abs(s.remainingMs) / 1000) % 60;
  const ms = Math.floor(Math.abs(s.remainingMs) % 1000);
  const text = (m < 100 ? String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
  document.getElementById('rem').textContent = neg + text;
  document.getElementById('ph').textContent = PH[s.phase] || s.phase || '';
  const d = new Date(s.epoch || Date.now());
  document.getElementById('ck').textContent = d.toTimeString().slice(0, 8);
  if (s.fired && last !== 'fired') { const el = document.getElementById('rem'); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  last = s.fired ? 'fired' : '';
}
</script></body></html>`;

function lanAddresses() {
  const out = [];
  try {
    const nets = os.networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const net of list || []) {
        if (net.family === 'IPv4' && !net.internal) out.push(net.address);
      }
    }
  } catch (_) {}
  return out;
}

function createCompanionServer({ log } = {}) {
  let server = null;
  let port = 0;
  let state = { armed: false, phase: 'IDLE', remainingMs: 0, epoch: Date.now() };
  const sseClients = new Set();

  function broadcast(frame) {
    const payload = 'data: ' + JSON.stringify(frame) + '\n\n';
    for (const res of sseClients) {
      try { res.write(payload); } catch (_) { sseClients.delete(res); }
    }
  }

  function handler(req, res) {
    try {
      if (req.url === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write('data: ' + JSON.stringify(state) + '\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }
      if (req.url === '/state') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(PAGE);
    } catch (_) {
      try { res.writeHead(500); res.end(); } catch (_) {}
    }
  }

  return {
    start(basePort, host, attempts = 10) {
      return new Promise(resolve => {
        if (server) { resolve(port); return; }
        const candidates = [];
        for (let i = 0; i < attempts; i++) candidates.push(basePort + i);
        let idx = 0;
        const tryNext = () => {
          if (idx >= candidates.length) { resolve(0); return; }
          const candidate = candidates[idx++];
          const s = http.createServer(handler);
          s.on('error', () => { s.close(); tryNext(); });
          s.listen(candidate, host, () => {
            server = s;
            port = candidate;
            if (log) log('companion listening on ' + host + ':' + port);
            resolve(port);
          });
        };
        tryNext();
      });
    },
    stop() {
      for (const res of sseClients) { try { res.end(); } catch (_) {} }
      sseClients.clear();
      if (server) { try { server.close(); } catch (_) {} }
      server = null;
      port = 0;
    },
    setState(next) {
      state = next || state;
      broadcast(state);
    },
    info(lan) {
      return { on: !!server, port, lanUrl: (server && lan && lanAddresses()[0]) ? 'http://' + lanAddresses()[0] + ':' + port : null, url: server ? 'http://127.0.0.1:' + port : null, clients: sseClients.size };
    }
  };
}

module.exports = { createCompanionServer };
