namespace TimeCoreDomain {
export type ClockMotionPhase = 'IDLE' | 'NORMAL' | 'WARMUP' | 'SURGE' | 'PULSE' | 'ZERO';
export type ClockMotionMode = 'inactive' | 'static' | 'heartbeat' | 'release';

export interface ClockMotionProfile {
  duration: number;
  peak: number;
  second: number;
  scale: number;
  dip: number;
}

export interface ClockMotionEnvironment {
  clockMode: boolean;
  reduced: boolean;
  supported: boolean;
}

export interface ClockMotionPlan {
  phase: ClockMotionPhase;
  mode: ClockMotionMode;
  staticOpacity: number | null;
  profile: ClockMotionProfile | null;
}

export interface ClockMotionModel {
  normalizePhase(value: unknown): ClockMotionPhase;
  plan(value: unknown, environment: ClockMotionEnvironment): ClockMotionPlan;
}

const PROFILES: Readonly<Record<'NORMAL' | 'WARMUP' | 'SURGE' | 'PULSE', ClockMotionProfile>> = {
  // 一轻一重，中间留白；阶段只改变节奏和幅度，不叠加新的视觉对象。
  NORMAL: { duration: 2600, peak: 0.42, second: 0.25, scale: 1.004, dip: 0.988 },
  WARMUP: { duration: 1800, peak: 0.52, second: 0.31, scale: 1.005, dip: 0.984 },
  SURGE:  { duration: 1100, peak: 0.64, second: 0.39, scale: 1.006, dip: 0.980 },
  PULSE:  { duration:  620, peak: 0.76, second: 0.48, scale: 1.007, dip: 0.974 }
};

const PHASES: ReadonlySet<string> = new Set(['IDLE', 'NORMAL', 'WARMUP', 'SURGE', 'PULSE', 'ZERO']);

function normalizePhase(value: unknown): ClockMotionPhase {
  const phase = String(value || 'IDLE').toUpperCase();
  return PHASES.has(phase) ? phase as ClockMotionPhase : 'IDLE';
}

function cloneProfile(profile: ClockMotionProfile): ClockMotionProfile {
  return { ...profile };
}

function plan(value: unknown, environment: ClockMotionEnvironment): ClockMotionPlan {
  const phase = normalizePhase(value);
  if (!environment.clockMode || phase === 'IDLE') {
    return { phase, mode: 'inactive', staticOpacity: null, profile: null };
  }

  if (environment.reduced || !environment.supported) {
    return {
      phase,
      mode: 'static',
      staticOpacity: phase === 'ZERO' ? 0.58 : 0.24,
      profile: null
    };
  }

  if (phase === 'ZERO') {
    return { phase, mode: 'release', staticOpacity: null, profile: null };
  }

  return {
    phase,
    mode: 'heartbeat',
    staticOpacity: null,
    profile: cloneProfile(PROFILES[phase === 'NORMAL' || phase === 'WARMUP' || phase === 'SURGE' || phase === 'PULSE' ? phase : 'NORMAL'])
  };
}

export function createClockMotionModel(): ClockMotionModel {
  return { normalizePhase, plan };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
