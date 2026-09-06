/* 全屏/选点事件诊断（CDP） */
import http from 'node:http';
import { writeFileSync } from 'node:fs';
const PORT = process.argv[2] || 9223;

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
        if (m.result && m.result.exceptionDetails) p.reject(new Error('page err: ' + JSON.stringify(m.result.exceptionDetails.exception || {}).slice(0, 120)));
        else p.resolve(m.result && m.result.result ? m.result.result.value : undefined);
      }
    };
    await new Promise(r => { ws.onopen = r; });
    const call = (method, params) => new Promise((resolve, reject) => {
      const id = ++seq; pend.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (pend.has(id)) { pend.delete(id); reject(new Error('cdp timeout ' + method)); } }, 30000);
    });
    const q = async expr => await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    const wait = ms => new Promise(r => setTimeout(r, ms));

    // 准备：截屏（设备在线走真实截屏，否则注入合成截图验证点击链路）
    const prep = await q(`(async () => {
      try {
        const dbg = TC.ADB.debug();
        const a = dbg.cfg.actions.find(x => x.type === 'tap');
        if (!a) return 'no tap action';
        const online = dbg.devices.find(x => x.state === 'device');
        if (online) {
          await TC.ADB.pickPoint(a);
          if (!a._shot) return 'screencap failed';
        } else {
          a._shot = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAACZGBsoAAAAAUlEQVR42mNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==';
          a.shotW = 1000; a.shotH = 2000;
        }
        TC.ADB.openPicker(a);
        return 'ok, fake=' + !online + ' hidden=' + document.getElementById('shot-picker').hidden;
      } catch (e) { return 'prep err: ' + e.message; }
    })()`);
    console.log('prep:', prep);
    await call('Page.bringToFront', {});
    await wait(400);

    const probe = await q(`(() => {
      const el = document.getElementById('sp-img');
      if (!el) return 'no sp-img';
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width * 0.72), y: Math.round(r.top + r.height * 0.24), w: Math.round(r.width), h: Math.round(r.height) };
    })()`);
    console.log('probe:', JSON.stringify(probe));
    if (!probe || typeof probe !== 'object') { console.log('probe 异常，终止'); process.exit(1); }

    const at = await q(`(() => {
      const e = document.elementFromPoint(${probe.x}, ${probe.y});
      return e ? (e.id || e.tagName) : 'null';
    })()`);
    console.log('遮挡检查 elementFromPoint:', at);

    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: probe.x, y: probe.y });
    await wait(250);
    console.log('受信移动后 mag:', await q(`document.getElementById('sp-mag').style.display`));

    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: probe.x, y: probe.y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: probe.x, y: probe.y, button: 'left', clickCount: 1 });
    await wait(250);
    console.log('受信点击后坐标:', await q(`(() => { const a = TC.ADB.debug().cfg.actions.find(x => x.type === 'tap'); return a.x + ',' + a.y; })()`));

    // 悬停放大镜视觉截图
    await call('Page.bringToFront', {});
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: probe.x, y: probe.y });
    await wait(200);
    console.log('悬停 mag:', await q(`document.getElementById('sp-mag').style.display`));
    const shot = await new Promise((resolve, reject) => {
      const id = ++seq;
      ws.send(JSON.stringify({ id, method: 'Page.captureScreenshot', params: { format: 'png' } }));
      const h = ev => { const m = JSON.parse(ev.data); if (m.id === id) { ws.removeEventListener('message', h); m.result ? resolve(m.result) : reject(new Error('no shot')); } };
      ws.addEventListener('message', h);
      setTimeout(() => reject(new Error('shot timeout')), 15000);
    });
    writeFileSync(new URL('../docs/adb-e2e.png', import.meta.url), Buffer.from(shot.data, 'base64'));
    console.log('截图: docs/adb-e2e.png');

    process.exit(0);
  });
});
