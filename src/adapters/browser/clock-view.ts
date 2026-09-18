namespace TimeCoreDomain {
interface ClockClassListPort {
  add(...tokens: string[]): void;
  remove(...tokens: string[]): void;
  contains(token: string): boolean;
}

interface ClockStylePort {
  [property: string]: string | undefined;
}

interface ClockAnimationPort {
  playState?: string;
  cancel(): void;
}

interface ClockElementPort {
  textContent: string;
  className: string;
  classList: ClockClassListPort;
  style: ClockStylePort;
  offsetWidth: number;
  appendChild(child: ClockElementPort): void;
  animate?: (keyframes: readonly Record<string, unknown>[], options: Record<string, unknown>) => ClockAnimationPort;
}

interface ClockMediaPort {
  readonly matches: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  addListener?: (listener: () => void) => void;
}

interface ClockWindowPort {
  matchMedia?: (query: string) => ClockMediaPort;
  getComputedStyle?: (element: ClockElementPort) => { opacity?: string; transform?: string };
}

interface ClockDocumentPort {
  body: ClockElementPort;
  getElementById(id: string): ClockElementPort | null;
  querySelector(selector: string): ClockElementPort | null;
  createElement(tagName: string): ClockElementPort;
  defaultView?: ClockWindowPort;
}

interface ClockViewMotionPort {
  normalizePhase(value: unknown): string;
  plan(value: unknown, environment: { clockMode: boolean; reduced: boolean; supported: boolean }): {
    phase: string;
    mode: string;
    staticOpacity: number | null;
    profile: { duration: number; peak: number; second: number; scale: number; dip: number } | null;
  };
}

export interface ClockViewFrame {
  hour: string;
  minute: string;
  second: string;
  millisecond: number;
  dateKey: string;
  dateText: string;
}

export interface ClockMotionDebug {
  phase: string;
  reduced: boolean;
  supported: boolean;
  animations: number;
  breathOpacity: string | null;
  hmsTransform: string | null;
}

export interface ClockView {
  mount(): void;
  render(frame: ClockViewFrame): void;
  resetTime(): void;
  setPhase(value: unknown): void;
  setClockMode(active: boolean): void;
  zeroPulse(): void;
  debugMotion(): ClockMotionDebug;
}

interface ClockViewOptions {
  document?: ClockDocumentPort;
  motion?: ClockViewMotionPort;
}

function runtimeDocument(): ClockDocumentPort {
  const scope = globalThis as typeof globalThis & { document?: ClockDocumentPort };
  if (!scope.document) throw new Error('ClockView requires a document');
  return scope.document;
}

function runtimeMotion(): ClockViewMotionPort {
  const scope = globalThis as typeof globalThis & {
    TimeCoreDomain: { createClockMotionModel(): ClockViewMotionPort };
  };
  return scope.TimeCoreDomain.createClockMotionModel();
}

export function createClockView(options: ClockViewOptions = {}): ClockView {
  const doc = options.document || runtimeDocument();
  const motionModel = options.motion || runtimeMotion();
  const pairs: Record<string, ClockElementPort> = {};
  let hms: ClockElementPort | null = null;
  let ms: ClockElementPort | null = null;
  let date: ClockElementPort | null = null;
  let ring: ClockElementPort | null = null;
  let breath: ClockElementPort | null = null;
  let panel: ClockElementPort | null = null;
  let media: ClockMediaPort | null = null;
  let mounted = false;
  let clockMode = false;
  let phase = 'IDLE';
  let reduced = false;
  let supported = false;
  let animations: ClockAnimationPort[] = [];
  let last = { h: '', m: '', s: '', day: '' };

  function cancelMotion(): void {
    for (const animation of animations) {
      try { animation.cancel(); } catch (_) { /* 动效已被浏览器回收 */ }
    }
    animations = [];
    if (breath) breath.style.opacity = '0';
    if (hms) {
      hms.style.transform = '';
      hms.style.opacity = '';
    }
  }

  function applyMotionPhase(value: unknown): void {
    phase = motionModel.normalizePhase(value);
    reduced = !!(media && media.matches);
    cancelMotion();
    // 动效严格限定在小时间窗口；正常窗口只保留阶段类供其他 UI 使用。
    const visualActive = clockMode && !!breath && !!hms;
    if (!visualActive || !breath || !hms) return;
    const breathElement = breath;
    const hmsElement = hms;

    const canAnimate = typeof breathElement.animate === 'function' && typeof hmsElement.animate === 'function';
    supported = canAnimate;
    const plan = motionModel.plan(phase, { clockMode: visualActive, reduced, supported: canAnimate });
    if (plan.mode === 'static') {
      breathElement.style.opacity = String(plan.staticOpacity);
      return;
    }

    hmsElement.style.transformOrigin = '50% 50%';
    if (plan.mode === 'release') {
      const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
      animations = [
        breathElement.animate!([
          { opacity: 0.08 }, { opacity: 0.88, offset: 0.28 }, { opacity: 0.24 }
        ], { duration: 560, easing, fill: 'both' }),
        hmsElement.animate!([
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(1.012)', opacity: 1, offset: 0.34 },
          { transform: 'scale(1)', opacity: 1 }
        ], { duration: 560, easing, fill: 'both' })
      ];
      return;
    }

    const profile = plan.profile;
    if (plan.mode !== 'heartbeat' || !profile) return;
    const linear = 'linear';
    animations = [
      breathElement.animate!([
        { opacity: 0.10, offset: 0 },
        { opacity: profile.peak, offset: 0.18 },
        { opacity: 0.16, offset: 0.25 },
        { opacity: profile.second, offset: 0.34 },
        { opacity: 0.10, offset: 0.46 },
        { opacity: 0.10, offset: 1 }
      ], { duration: profile.duration, iterations: Infinity, easing: linear }),
      hmsElement.animate!([
        { transform: 'scale(1)', opacity: 1, offset: 0 },
        { transform: 'scale(' + profile.scale + ')', opacity: 1, offset: 0.18 },
        { transform: 'scale(1)', opacity: profile.dip, offset: 0.25 },
        { transform: 'scale(' + (1 + (profile.scale - 1) * 0.45) + ')', opacity: 1, offset: 0.34 },
        { transform: 'scale(1)', opacity: 1, offset: 0.46 },
        { transform: 'scale(1)', opacity: 1, offset: 1 }
      ], { duration: profile.duration, iterations: Infinity, easing: linear })
    ];
  }

  function setPhase(value: unknown): void {
    const normalized = motionModel.normalizePhase(value);
    if (panel) {
      panel.classList.remove('clock-armed', 'clock-phase-normal', 'clock-phase-warmup', 'clock-phase-surge', 'clock-phase-pulse', 'clock-phase-zero');
      if (normalized !== 'IDLE') panel.classList.add('clock-armed', 'clock-phase-' + normalized.toLowerCase());
    }
    applyMotionPhase(normalized);
  }

  function mount(): void {
    if (mounted) return;
    mounted = true;
    hms = doc.getElementById('clock-hms');
    if (hms) {
      hms.textContent = '';
      for (const key of ['h', 'm', 's']) {
        if (key !== 'h') {
          const colon = doc.createElement('span');
          colon.className = 'd-colon';
          colon.textContent = ':';
          hms.appendChild(colon);
        }
        const pair = doc.createElement('span');
        pair.className = 'd-pair';
        pair.textContent = '--';
        hms.appendChild(pair);
        pairs[key] = pair;
      }
    }
    ms = doc.getElementById('clock-ms');
    date = doc.getElementById('clock-date');
    panel = doc.querySelector('.clock-panel');
    ring = doc.querySelector('.sec-ring rect');
    breath = doc.querySelector('.clock-breath');
    const view = doc.defaultView;
    media = view && view.matchMedia ? view.matchMedia('(prefers-reduced-motion: reduce)') : null;
    reduced = !!(media && media.matches);
    supported = !!(breath && hms && typeof breath.animate === 'function' && typeof hms.animate === 'function');
    if (media) {
      const onMotionPreference = () => applyMotionPhase(phase);
      if (media.addEventListener) media.addEventListener('change', onMotionPreference);
      else if (media.addListener) media.addListener(onMotionPreference);
    }
  }

  function render(frame: ClockViewFrame): void {
    const current: Record<'h' | 'm' | 's', string> = { h: frame.hour, m: frame.minute, s: frame.second };
    for (const key of ['h', 'm', 's'] as const) {
      if (current[key] === last[key]) continue;
      last[key] = current[key];
      const pair = pairs[key];
      if (!pair) continue;
      pair.textContent = current[key];
      pair.classList.remove('tick');
      void pair.offsetWidth;
      pair.classList.add('tick');
    }
    if (ms) {
      const value = ((frame.millisecond % 1000) + 1000) % 1000;
      ms.textContent = '.' + String(Math.floor(value)).padStart(3, '0');
    }
    if (ring) {
      const value = ((frame.millisecond % 1000) + 1000) % 1000;
      ring.style.strokeDashoffset = String(1000 - value);
    }
    if (frame.dateKey !== last.day) {
      last.day = frame.dateKey;
      if (date) date.textContent = frame.dateText;
    }
  }

  function resetTime(): void {
    last = { h: '', m: '', s: '', day: '' };
  }

  function setClockMode(active: boolean): void {
    clockMode = !!active;
    applyMotionPhase(phase);
  }

  function zeroPulse(): void {
    if (!clockMode || !panel) return;
    panel.classList.remove('zero-pulse');
    void panel.offsetWidth;
    panel.classList.add('zero-pulse');
  }

  function computed(element: ClockElementPort): { opacity?: string; transform?: string } {
    const getComputedStyle = doc.defaultView && doc.defaultView.getComputedStyle;
    if (getComputedStyle) return getComputedStyle(element);
    return element.style;
  }

  function debugMotion(): ClockMotionDebug {
    const active = animations.filter(animation => {
      try { return !!animation && animation.playState !== 'idle'; } catch (_) { return !!animation; }
    }).length;
    const breathStyle = breath ? computed(breath) : null;
    const hmsStyle = hms ? computed(hms) : null;
    return {
      phase,
      reduced,
      supported,
      animations: active,
      breathOpacity: breathStyle && breathStyle.opacity !== undefined ? breathStyle.opacity : null,
      hmsTransform: hmsStyle && hmsStyle.transform !== undefined ? hmsStyle.transform : null
    };
  }

  return { mount, render, resetTime, setPhase, setClockMode, zeroPulse, debugMotion };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
