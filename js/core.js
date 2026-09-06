/* TimeCore 基础：命名空间、事件总线、工具函数 */
window.TC = { version: '1.0.0' };

TC.bus = (function () {
  const map = new Map();
  return {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => map.get(evt).delete(fn);
    },
    emit(evt, data) {
      const s = map.get(evt);
      if (!s) return;
      for (const fn of Array.from(s)) {
        try { fn(data); } catch (err) { console.error('[bus]', evt, err); }
      }
    }
  };
})();

TC.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
TC.fx = { zero: Math.min(2, Math.max(0, parseInt(localStorage.getItem('tc.zerofx'), 10) || 2)) };
TC.lerp = (a, b, k) => a + (b - a) * k;
TC.pad = (n, w) => String(n).padStart(w, '0');
TC.$ = (id) => document.getElementById(id);
