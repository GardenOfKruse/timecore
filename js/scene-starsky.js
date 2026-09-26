/* 远景星野 + 流星（v1.29.0 自 scene3d.js 拆出）：320 颗错相闪烁远星 + 随机/到点流星。
 * 工厂：SceneStarsky.create(scene, glowTexture) → { stars, starMat, tick, spawnMeteor, boost, hasStars, hasMeteor, meteorActive }。
 * quality 由调用方逐帧传入（自适应降档时随机流星停发）。 */
(function () {
  function create(scene, glowTexture) {
    let stars = null, starMat = null;
    let meteor = null, meteorT = -1, meteorNext = 18 + Math.random() * 20;
    const meteorFrom = new THREE.Vector3(), meteorDir = new THREE.Vector3();

    const starVert = `
    attribute float aPhase; attribute float aSize;
    varying float vA; uniform float uTime;
    void main(){
      vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.5 + fract(aPhase) * 0.9) + aPhase * 6.2831));
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (420.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`;
    const starFrag = `
    precision mediump float; varying float vA; uniform vec3 uColor; uniform float uBoost;
    void main(){ float d = length(gl_PointCoord - vec2(0.5)); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(uColor * uBoost, a * vA); }`;

    function buildStars() {
      const N = 320, pos = new Float32Array(N * 3), ph = new Float32Array(N), sz = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const az = Math.random() * Math.PI * 2, el = Math.random() * 1.6 - 0.4, r = 22 + Math.random() * 22;
        pos[i * 3] = Math.cos(el) * Math.sin(az) * r;
        pos[i * 3 + 1] = Math.sin(el) * r * 0.7 + 2;
        pos[i * 3 + 2] = Math.cos(el) * Math.cos(az) * r;
        ph[i] = Math.random() * 10; sz[i] = 0.8 + Math.random() * 1.6;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
      starMat = new THREE.ShaderMaterial({
        vertexShader: starVert, fragmentShader: starFrag,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xcfe6ff) }, uBoost: { value: 1 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      stars = new THREE.Points(geo, starMat);
      scene.add(stars);
    }

    function buildMeteor() {
      meteor = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(64), color: 0xbfe0ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      meteor.scale.set(2.2, 0.14, 1);
      meteor.visible = false;
      scene.add(meteor);
    }

    function spawnMeteor() {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 4;
      meteorFrom.set(Math.sin(a) * r * 0.9, 2.5 + Math.random() * 3.5, -4 - Math.random() * 3);
      meteorDir.set(Math.cos(a) * (Math.random() < 0.5 ? 1 : -1), -0.25 - Math.random() * 0.3, 0).normalize();
      meteor.position.copy(meteorFrom);
      meteor.material.rotation = Math.atan2(meteorDir.y, meteorDir.x);
      meteorT = 0;
    }

    function updateMeteor(dt, quality) {
      if (!meteor) return;
      if (meteorT < 0) {
        meteor.visible = false;
        meteorNext -= dt;
        if (meteorNext <= 0 && quality > 0) { spawnMeteor(); meteorNext = 30 + Math.random() * 60; }
        return;
      }
      meteor.visible = true;
      meteorT += dt;
      const p = meteorT / 0.9;
      if (p >= 1) { meteorT = -1; meteor.visible = false; return; }
      meteor.position.copy(meteorFrom).addScaledVector(meteorDir, meteorT * 16);
      meteor.material.opacity = Math.sin(Math.PI * p) * 0.75;
    }

    buildStars();
    buildMeteor();

    return {
      stars, starMat, meteor,
      tick(dt, t, quality) {
        if (starMat) {
          starMat.uniforms.uTime.value = t;
          starMat.uniforms.uBoost.value += (1 - starMat.uniforms.uBoost.value) * (1 - Math.exp(-dt * 1.8));   // 增亮后缓慢回落
        }
        updateMeteor(dt, quality);
      },
      spawnMeteor,
      boost(quality) {   // 到点流星雨：星野瞬时增亮后回落 + 三颗流星错峰齐落
        if (starMat) starMat.uniforms.uBoost.value = 2.2;
        for (let i = 0; i < 3; i++) setTimeout(() => { if (quality > 0 && meteor) spawnMeteor(); }, 120 + i * 200);
      },
      hasStars() { return !!stars && stars.visible; },
      hasMeteor() { return !!meteor; },
      meteorActive() { return meteorT >= 0; }
    };
  }

  window.SceneStarsky = { create };
})();
