/* 图标缩放：源 PNG → 256×256 高质量降采样 → 封装 ICO（CDP 借用 Electron 渲染进程画布） */
import http from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';
const PORT = process.argv[2] || 9223;
const SRC = process.argv[3] || 'build/icon-source.png';

const b64 = readFileSync(SRC).toString('base64');
http.get(`http://127.0.0.1:${PORT}/json`, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', async () => {
    const t = JSON.parse(d).find(x => x.url.includes('index.html'));
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    let seq = 0; const pend = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) {
        const p = pend.get(m.id); pend.delete(m.id);
        if (m.result && m.result.exceptionDetails) p.reject(new Error('page err: ' + JSON.stringify(m.result.exceptionDetails.exception || {}).slice(0, 150)));
        else p.resolve(m.result && m.result.result ? m.result.result.value : undefined);
      }
    };
    await new Promise(r => { ws.onopen = r; });
    const q = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      return r.result && r.result.result ? r.result.result.value : undefined;
    };
    function call(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++seq; pend.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => { if (pend.has(id)) { pend.delete(id); reject(new Error('cdp timeout ' + method)); } }, 30000);
      });
    }
    const out = await q(`(async () => {
      const img = new Image();
      img.src = 'data:image/png;base64,${b64}';
      await img.decode();
      const S = 256;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, S, S);
      return c.toDataURL('image/png').split(',')[1];
    })()`);
    writeFileSync('build/icon-source.png', Buffer.from(out, 'base64'));
    console.log('已缩放: build/icon-source.png →', out.length, 'b64 chars');
    process.exit(0);
  });
});
