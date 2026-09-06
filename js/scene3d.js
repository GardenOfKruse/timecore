/* 三维场景：悬浮时间核心
 * 玻璃环体 + 内核 + 能量环(shader) + 金属轨道 + 粒子 + 体积光 + 冲击波
 * 全部基于 r128 全局 THREE，无后处理依赖 */
(function () {
  let renderer, scene, camera, t = 0;
  let coreGroup, planet, clouds, atmo, atmoMat, flash, ringGroup, ringMat, tipGlow, warmRing, warmMat;
  let orbits = [], sats = [], points, pPos, pVel, pCount, pMat;
  let shafts = [], shocks = [], shockIdx = 0;
  let shake = 0, flashT = -1, warmO = 0, warmTgt = 0;
  let hue = parseInt(localStorage.getItem('tc.hue'), 10); if (!isFinite(hue)) hue = 192;
  let quality = 2;                      // 2 高 / 1 中 / 0 低
  let fpsAcc = 0, fpsN = 0, fpsTimer = 0;
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };

  const cur = { color: new THREE.Color(), intensity: 0.5, pSpeed: 1 };
  const tgt = { color: new THREE.Color(), intensity: 0.5, pSpeed: 1 };
  const FIXED_COL = { WARMUP: 0xffb347, SURGE: 0xff8c3b, PULSE: 0xff4d5e, ZERO: 0xffffff };
  const PHASE_INT = { IDLE: 0.35, NORMAL: 0.55, WARMUP: 0.85, SURGE: 1.05, PULSE: 1.25, ZERO: 1.5 };
  const PHASE_SPD = { IDLE: 0.6, NORMAL: 1, WARMUP: 1.35, SURGE: 2.4, PULSE: 2.9, ZERO: 2.9 };

  /* ---------- 能量环 shader ---------- */
  const ringVert = `
    varying vec2 vPos;
    void main(){ vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const ringFrag = `
    precision highp float;
    varying vec2 vPos;
    uniform float uInner, uOuter, uProgress, uIntensity, uTime, uTicks;
    uniform vec3 uColor;
    const float TAU = 6.283185307179586;
    void main(){
      float r = length(vPos);
      float rn = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
      float band = smoothstep(0.0, 0.22, rn) * (1.0 - smoothstep(0.78, 1.0, rn));
      band = pow(band, 1.25);
      float ang = atan(vPos.y, vPos.x);
      float s = mod(1.5707963 - ang, TAU);              // 顶部起、顺时针
      float edge = uProgress * TAU;
      float fill = 1.0 - step(edge, s);
      float tip = exp(-abs(s - edge) * 26.0);
      float f60 = fract(s / TAU * 60.0);
      float tick = (1.0 - smoothstep(0.0, 0.10, min(f60, 1.0 - f60))) * 0.10 * uTicks;
      float a = fill * (0.5 + 0.5 * band) + tip * 1.7 + (1.0 - fill) * 0.08 * band + tick * band;
      a *= band * uIntensity;
      gl_FragColor = vec4(uColor * (1.0 + tip * 1.8), a);
    }`;

  function ringMat3(inner, outer) {
    return new THREE.ShaderMaterial({
      vertexShader: ringVert, fragmentShader: ringFrag,
      uniforms: {
        uInner: { value: inner }, uOuter: { value: outer },
        uProgress: { value: 0 }, uIntensity: { value: 0.5 }, uTime: { value: 0 },
        uTicks: { value: 1 }, uColor: { value: new THREE.Color(0x39d7ff) }
      },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
  }

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

  /* ---------- 星球核心 ---------- */
  function buildCore() {
    coreGroup = new THREE.Group();

    const tex = planetTextures();
    planet = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 48, 32),
      new THREE.MeshStandardMaterial({ map: tex.map, roughness: 0.85, metalness: 0.05, envMapIntensity: 0.5 })
    );
    coreGroup.add(planet);

    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(0.845, 48, 32),
      new THREE.MeshStandardMaterial({ map: tex.clouds, transparent: true, opacity: 0.85, depthWrite: false, roughness: 1, metalness: 0 })
    );
    coreGroup.add(clouds);

    // 大气辉光：BackSide + 视角边缘增亮
    atmoMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vNv; void main(){ vNv = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vNv; uniform vec3 uColor; uniform float uOp;
        void main(){ float i = pow(max(0.0, 0.64 - dot(vNv, vec3(0.0, 0.0, 1.0))), 2.0); gl_FragColor = vec4(uColor, 1.0) * i * uOp; }`,
      uniforms: { uColor: { value: new THREE.Color(0x39d7ff) }, uOp: { value: 1.4 } },
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false
    });
    atmo = new THREE.Mesh(new THREE.SphereGeometry(1.0, 48, 32), atmoMat);
    atmo.renderOrder = 2;
    coreGroup.add(atmo);

    const gt = glowTexture(128);
    flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.scale.setScalar(7);
    coreGroup.add(flash);
    scene.add(coreGroup);
  }

  function buildRings() {
    ringGroup = new THREE.Group();
    ringGroup.rotation.x = -0.32;

    ringMat = ringMat3(2.05, 2.42);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.05, 2.42, 160, 1), ringMat);
    ringGroup.add(ring);

    tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(64), color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    tipGlow.scale.setScalar(0.55);
    ringGroup.add(tipGlow);

    warmMat = ringMat3(2.6, 2.82);
    warmMat.uniforms.uProgress.value = 1;
    warmMat.uniforms.uColor.value = new THREE.Color(0xffb347);
    warmMat.uniforms.uTicks.value = 0;
    warmRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.82, 120, 1), warmMat);
    warmRing.visible = false;
    ringGroup.add(warmRing);

    scene.add(ringGroup);
  }

  function buildOrbits() {
    const conf = [
      { r: 2.95, tube: 0.028, tilt: [1.15, 0.2, 0.0], speed: 0.24, col: 0x9fb6c9 },
      { r: 3.35, tube: 0.02, tilt: [0.4, -0.9, 0.35], speed: -0.16, col: 0x7d93a8 },
      { r: 3.75, tube: 0.016, tilt: [-0.5, 0.5, 1.0], speed: 0.10, col: 0x5f7285 }
    ];
    conf.forEach((c, i) => {
      const g = new THREE.Group();
      g.rotation.set(c.tilt[0], c.tilt[1], c.tilt[2]);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(c.r, c.tube, 8, 140),
        new THREE.MeshStandardMaterial({ color: c.col, metalness: 0.95, roughness: 0.28, envMapIntensity: 1.2 })
      );
      g.add(ring);
      for (let k = 0; k < 10; k++) {
        const stud = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.018, 0.018),
          new THREE.MeshStandardMaterial({ color: 0xcfe4f2, metalness: 0.9, roughness: 0.2 })
        );
        const a = k / 10 * Math.PI * 2;
        stud.position.set(Math.cos(a) * c.r, Math.sin(a) * c.r, 0);
        stud.rotation.z = a;
        g.add(stud);
      }
      let sat = null;
      if (i < 2) {
        sat = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 16, 12),
          new THREE.MeshStandardMaterial({ color: 0xe8f4ff, metalness: 0.85, roughness: 0.15, emissive: 0x223644, envMapIntensity: 1.5 })
        );
        g.add(sat);
      }
      scene.add(g);
      orbits.push({ g, speed: c.speed, r: c.r });
      if (sat) sats.push({ m: sat, r: c.r, off: i * 2.1 });
    });
  }

  function buildParticles() {
    pCount = [260, 520, 900][quality];
    pPos = new Float32Array(pCount * 3);
    pVel = new Float32Array(pCount * 3);
    const col = new Float32Array(pCount * 3);
    const c1 = new THREE.Color(0x54c8ff), c2 = new THREE.Color(0x8f6bff), c3 = new THREE.Color(0xffb066);
    for (let i = 0; i < pCount; i++) {
      respawn(i, true);
      const cc = Math.random() < 0.7 ? c1 : (Math.random() < 0.75 ? c2 : c3);
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    pMat = new THREE.PointsMaterial({
      size: 0.055, map: glowTexture(64), vertexColors: true, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    points = new THREE.Points(geo, pMat);
    scene.add(points);
  }

  function respawn(i, initR) {
    const r = initR ? 2.2 + Math.random() * 4.2 : 2.2 + Math.random() * 0.8;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const i3 = i * 3;
    pPos[i3] = r * Math.sin(ph) * Math.cos(th);
    pPos[i3 + 1] = r * Math.cos(ph) * 0.62;
    pPos[i3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const sp = 0.05 + Math.random() * 0.12;
    pVel[i3] = (Math.random() - 0.5) * sp;
    pVel[i3 + 1] = sp * (0.4 + Math.random() * 0.8);
    pVel[i3 + 2] = (Math.random() - 0.5) * sp;
  }

  function buildShafts() {
    const mat = () => new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uOp;
        void main(){ float y = abs(vUv.y * 2.0 - 1.0); float a = (1.0 - y) * (1.0 - y) * uOp; gl_FragColor = vec4(uColor, a); }`,
      uniforms: { uColor: { value: new THREE.Color(0x3fc6ff) }, uOp: { value: 0.05 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55 + i * 0.35, 1.7 + i * 0.5, 7, 40, 1, true), mat());
      m.renderOrder = 3;
      scene.add(m);
      shafts.push(m);
    }
  }

  function buildShocks() {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.02, 6, 90),
        new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.visible = false;
      ringGroup.add(m);
      shocks.push({ m, life: -1, dur: 0.6, to: 3.2 });
    }
  }

  function spawnShock(radius, color, strength, big) {
    const s = shocks[shockIdx++ % shocks.length];
    s.m.visible = true;
    s.m.scale.setScalar(radius);
    s.m.material.color.set(color);
    s.life = 0;
    s.dur = big ? 0.9 : 0.55;
    s.to = big ? 4.6 : 3.1;
    s.strength = strength;
  }

  function kickParticles(n, power) {
    const step = Math.max(1, Math.floor(pCount / n));
    for (let i = 0; i < pCount; i += step) {
      const i3 = i * 3;
      const len = Math.max(0.001, Math.sqrt(pPos[i3] ** 2 + pPos[i3 + 1] ** 2 + pPos[i3 + 2] ** 2));
      const pw = power * (0.5 + Math.random());
      pVel[i3] += pPos[i3] / len * pw;
      pVel[i3 + 1] += pPos[i3 + 1] / len * pw;
      pVel[i3 + 2] += pPos[i3 + 2] / len * pw;
    }
  }

  /* ---------- 事件 ---------- */
  function setPhase(ph) {
    tgt.intensity = PHASE_INT[ph] || 0.55;
    tgt.pSpeed = PHASE_SPD[ph] || 1;
    if (FIXED_COL[ph]) tgt.color.setHex(FIXED_COL[ph]);
    else { tgt.color.setHSL(hue / 360, 0.75, 0.6); }
    warmTgt = ph === 'WARMUP' ? 1 : 0;
    if (ph === 'PULSE') shake = Math.max(shake, 0.18);
  }

  function setHue(h) {
    hue = h;
    localStorage.setItem('tc.hue', String(h));
    const info = TC.Countdown.info();
    setPhase(info.phase);
  }

  function wireEvents() {
    TC.bus.on('phase', setPhase);
    TC.bus.on('tz', () => {});
    TC.bus.on('beat:judge', rec => {
      if (rec.label === 'MISS') { shake = Math.max(shake, 0.55); return; }
      const col = new THREE.Color(rec.color);
      spawnShock(rec.label === 'PERFECT' ? 2.15 : 2.0, col, 0.6);
      kickParticles(rec.label === 'PERFECT' ? 90 : 45, rec.label === 'PERFECT' ? 1.8 : 1.1);
      if (rec.label === 'PERFECT') shake = Math.max(shake, 0.12);
    });
    TC.bus.on('cd:zero', () => {
      const fx = (window.TC && TC.fx) ? TC.fx.zero : 2;
      flashT = 0;
      if (fx > 0) {
        spawnShock(2.1, new THREE.Color(0xffffff), 1.0, true);
        if (fx >= 2) spawnShock(1.6, new THREE.Color(0xffc46b), 0.8, true);
        kickParticles(fx >= 2 ? 240 : 120, fx >= 2 ? 3.4 : 2.2);
        shake = fx >= 2 ? 0.9 : 0.45;
      }
    });
  }

  /* ---------- 初始化 / 主渲染 ---------- */
  function init(canvas) {
    if (!window.THREE) { document.body.classList.add('no3d'); return false; }
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
    camera.position.set(0, 0.35, 7.4);

    try {
      const pm = new THREE.PMREMGenerator(renderer);
      pm.compileEquirectangularShader();
      scene.environment = pm.fromEquirectangular(envTexture()).texture;
    } catch (_) { /* 无环境贴图也能跑 */ }

    scene.add(new THREE.AmbientLight(0x3a4a66, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 0.7); key.position.set(3, 5, 4); scene.add(key);
    scene.userData.keyLight = key;
    const rim = new THREE.PointLight(0xff5d8f, 0.35, 30); rim.position.set(-5, -2, -3); scene.add(rim);

    buildCore(); buildRings(); buildOrbits(); buildParticles(); buildShafts(); buildShocks();
    setPhase('IDLE'); cur.color.copy(tgt.color);
    wireEvents();

    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', e => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    });
    onResize();
    return true;
  }

  function onResize() {
    if (!renderer) return;
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function applyQuality(q) {
    quality = q;
    if (q >= 2) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    else renderer.setPixelRatio(1);
    if (points) points.visible = q > 0;
  }

  function render(dt, ctx) {
    if (!renderer) return;
    t += dt;

    // 自适应画质：连续低于 40fps 逐级降档
    fpsAcc += dt; fpsN++; fpsTimer += dt;
    if (fpsTimer > 2) {
      const fps = fpsN / fpsAcc;
      if (fps < 40 && quality > 0) applyQuality(quality - 1);
      fpsAcc = 0; fpsN = 0; fpsTimer = 0;
    }

    const k = 1 - Math.exp(-dt * 3.2);
    cur.color.lerp(tgt.color, k);
    cur.intensity += (tgt.intensity - cur.intensity) * k;
    cur.pSpeed += (tgt.pSpeed - cur.pSpeed) * k;

    // 能量环
    ringMat.uniforms.uProgress.value = ctx.progress;
    ringMat.uniforms.uColor.value.copy(cur.color);
    ringMat.uniforms.uIntensity.value = cur.intensity * (1 + ctx.pulse * 0.55);
    ringMat.uniforms.uTime.value = t;
    const ang = Math.PI / 2 - ctx.progress * Math.PI * 2;
    tipGlow.position.set(Math.cos(ang) * 2.24, Math.sin(ang) * 2.24, 0.01);
    tipGlow.material.color.copy(cur.color);
    tipGlow.material.opacity = 0.55 + ctx.pulse * 0.45;

    // 预热外环
    warmO += (warmTgt - warmO) * (1 - Math.exp(-dt * 4));
    warmRing.visible = warmO > 0.02;
    warmMat.uniforms.uIntensity.value = warmO * (0.42 + 0.3 * Math.sin(t * 6.283));
    warmMat.uniforms.uColor.value.setHex(FIXED_COL.WARMUP);

    // 星球
    coreGroup.position.y = Math.sin(t * 0.8) * 0.12;
    planet.rotation.y = t * 0.12;
    clouds.rotation.y = t * 0.165;
    const ps = 1 + 0.028 * Math.sin(t * 2.1) + 0.055 * ctx.pulse;
    planet.scale.setScalar(ps);
    clouds.scale.setScalar(ps);
    atmo.scale.setScalar(ps);
    atmoMat.uniforms.uColor.value.copy(cur.color);
    atmoMat.uniforms.uOp.value = 0.9 + cur.intensity * 0.6 + ctx.pulse * 0.9;
    scene.userData.keyLight.intensity = 0.55 + cur.intensity * 0.25;

    // 轨道
    for (let i = 0; i < orbits.length; i++) {
      const o = orbits[i];
      o.g.rotation.z += dt * o.speed * (0.6 + cur.pSpeed * 0.5);
    }
    for (const s of sats) {
      const a = t * 0.5 * (0.6 + cur.pSpeed * 0.5) + s.off;
      s.m.position.set(Math.cos(a) * s.r, Math.sin(a) * s.r, 0);
    }

    // 粒子
    if (points && points.visible) {
      const spd = cur.pSpeed;
      for (let i = 0; i < pCount; i++) {
        const i3 = i * 3;
        pPos[i3] += pVel[i3] * dt * spd;
        pPos[i3 + 1] += pVel[i3 + 1] * dt * spd;
        pPos[i3 + 2] += pVel[i3 + 2] * dt * spd;
        // 阻尼回落 + 出界重生
        pVel[i3] *= (1 - dt * 0.4); pVel[i3 + 1] *= (1 - dt * 0.4); pVel[i3 + 2] *= (1 - dt * 0.4);
        const r2 = pPos[i3] ** 2 + pPos[i3 + 1] ** 2 + pPos[i3 + 2] ** 2;
        if (r2 > 49 || r2 < 0.05) respawn(i, false);
      }
      points.geometry.attributes.position.needsUpdate = true;
      points.rotation.y = t * 0.02;
      pMat.opacity = 0.5 + cur.intensity * 0.3;
    }

    // 体积光
    const sopt = 0.03 + cur.intensity * 0.045 + ctx.pulse * 0.05;
    for (let i = 0; i < shafts.length; i++) {
      shafts[i].material.uniforms.uOp.value = sopt;
      shafts[i].rotation.y = t * (0.05 + i * 0.03);
      shafts[i].material.uniforms.uColor.value.copy(cur.color);
    }

    // 冲击波
    for (const s of shocks) {
      if (s.life < 0) continue;
      s.life += dt;
      const p = s.life / s.dur;
      if (p >= 1) { s.life = -1; s.m.visible = false; continue; }
      s.m.scale.setScalar(1 + (s.to - 1) * (1 - Math.pow(1 - p, 2.2)));
      s.m.material.opacity = (1 - p) * 0.85 * s.strength;
      s.m.material.color.copy(cur.color);
    }

    // 到点白闪（强度随反馈档位）
    if (flashT >= 0) {
      flashT += dt;
      const p = flashT / 0.6;
      const fx = (window.TC && TC.fx) ? TC.fx.zero : 2;
      if (p >= 1) { flashT = -1; flash.material.opacity = 0; }
      else {
        flash.material.opacity = (1 - p) * [0.3, 0.6, 0.95][fx];
        flash.scale.setScalar(7 + p * 6);
        flash.material.color.copy(cur.color);
      }
    }

    // 相机：视差 + 震动
    mouse.sx += (mouse.x - mouse.sx) * (1 - Math.exp(-dt * 2.5));
    mouse.sy += (mouse.y - mouse.sy) * (1 - Math.exp(-dt * 2.5));
    shake *= Math.exp(-dt * 3.2);
    const sx = (Math.random() - 0.5) * shake * 0.09, sy = (Math.random() - 0.5) * shake * 0.09;
    camera.position.x = mouse.sx * 0.45 + sx;
    camera.position.y = 0.35 - mouse.sy * 0.3 + sy;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  TC.Scene = { init, render, setHue, get hue() { return hue; } };
})();
