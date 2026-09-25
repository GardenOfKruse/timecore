/* 场景纹理工厂（v1.25.0 自 scene3d.js 拆出）：辉光贴图 / 环境贴图 / 程序化星球与云层纹理。
 * 零共享可变状态的纯工厂；由 scene3d.js 在挂载前调用。 */
(function () {
  const ST = {};
function glowTexture(size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function envTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#0a1226'); gr.addColorStop(0.5, '#050a16'); gr.addColorStop(1, '#02040a');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  const blob = (x, y, r, col) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  blob(60, 30, 40, 'rgba(180,230,255,0.9)');
  blob(200, 45, 30, 'rgba(120,190,255,0.55)');
  blob(130, 100, 46, 'rgba(90,60,160,0.5)');
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/* ---------- 程序化星球纹理（噪声大陆 + 云层） ---------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 横向可平铺的值噪声 fbm（GW×GH 网格，双线性 + smoothstep）
function makeFbm(GW, GH, seed) {
  const rnd = mulberry32(seed);
  const grid = new Float32Array(GW * GH);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const sm = t => t * t * (3 - 2 * t);
  function noise(u, v) {                    // u,v ∈ [0,1)
    const fx = u * GW, fy = v * GH;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = sm(fx - x0), ty = sm(fy - y0);
    const x1 = (x0 + 1) % GW, y1 = (y0 + 1) % GH;
    const a = grid[y0 % GH * GW + x0 % GW], b = grid[y0 % GH * GW + x1];
    const c = grid[y1 % GH * GW + x0 % GW], d2 = grid[y1 % GH * GW + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d2) * tx * ty;
  }
  return function (u, v, oct) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += noise((u * f) % 1, (v * f) % 1) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return s / norm;
  };
}

function planetTextures() {
  const W = 1024, H = 512;
  const land = document.createElement('canvas'); land.width = W; land.height = H;
  const lc = land.getContext('2d');
  const img = lc.createImageData(W, H);
  const fbm = makeFbm(8, 4, 7), fbm2 = makeFbm(16, 8, 23), fbm3 = makeFbm(32, 16, 91);
  for (let y = 0; y < H; y++) {
    const lat = Math.abs(y / H - 0.5) * 2;               // 0 赤道 → 1 极地
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const n = fbm(u, v, 5) * 0.75 + fbm2(u, v, 3) * 0.25;
      const detail = fbm3(u, v, 3);
      let r, g, b;
      const ice = lat > 0.78 + detail * 0.12;
      if (n > 0.545) {                                   // 陆地
        const h = (n - 0.545) / 0.3;
        r = 46 + h * 90 + detail * 40;
        g = 128 + h * 70 - detail * 30;
        b = 96 + h * 30 - detail * 20;
        if (h > 0.75) { r = 200 + detail * 40; g = 205 + detail * 40; b = 200; }   // 山峰雪线
      } else if (n > 0.515) {                            // 浅海
        r = 40 + detail * 30; g = 130 + detail * 40; b = 160 + detail * 40;
      } else {                                           // 深海
        const d2 = n / 0.515;
        r = 8 + d2 * 22; g = 40 + d2 * 60; b = 78 + d2 * 70;
      }
      if (ice) { const w = Math.min(1, (lat - 0.78) / 0.1 + detail * 0.4); r = r * (1 - w) + 235 * w; g = g * (1 - w) + 242 * w; b = b * (1 - w) + 250 * w; }
      const o = (y * W + x) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  lc.putImageData(img, 0, 0);

  const cl = document.createElement('canvas'); cl.width = W; cl.height = H;
  const cc = cl.getContext('2d');
  const cimg = cc.createImageData(W, H);
  const cfbm = makeFbm(10, 5, 555);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = cfbm(x / W, y / H, 5);
      const a = Math.max(0, Math.min(1, (n - 0.52) / 0.2));
      const o = (y * W + x) * 4;
      cimg.data[o] = 255; cimg.data[o + 1] = 255; cimg.data[o + 2] = 255; cimg.data[o + 3] = Math.round(a * 215);
    }
  }
  cc.putImageData(cimg, 0, 0);

  const tex1 = new THREE.CanvasTexture(land); tex1.wrapS = THREE.RepeatWrapping;
  const tex2 = new THREE.CanvasTexture(cl); tex2.wrapS = THREE.RepeatWrapping;
  return { map: tex1, clouds: tex2 };
}
  ST.glowTexture = glowTexture;
  ST.envTexture = envTexture;
  ST.planetTextures = planetTextures;
  window.SceneTextures = ST;
})();
