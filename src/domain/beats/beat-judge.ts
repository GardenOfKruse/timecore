namespace TimeCoreDomain {
export type BeatLabel = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';
export type BeatMode = 'cd' | 'free';

export interface BeatJudgeInput {
  at: number;
  nodeEpoch: number;
  mode: BeatMode;
  forcedDeviation?: number;
}

export interface BeatRecord {
  label: BeatLabel;
  color: string;
  dev: number;
  combo: number;
  maxCombo: number;
  acc: number;
  mode: BeatMode;
  at: number;
}

export interface BeatCounts {
  PERFECT: number;
  GREAT: number;
  GOOD: number;
  MISS: number;
}

export interface BeatStats {
  combo: number;
  maxCombo: number;
  total: number;
  counts: BeatCounts;
  last: BeatRecord | null;
}

export interface BeatJudge {
  readonly colors: Readonly<Record<BeatLabel, string>>;
  labelFor(deviationMs: number): BeatLabel;
  judge(input: BeatJudgeInput): BeatRecord;
  stats(): BeatStats;
}

const COLORS: Readonly<Record<BeatLabel, string>> = {
  PERFECT: '#8ef7ff',
  GREAT: '#7dff9b',
  GOOD: '#ffd76a',
  MISS: '#ff5d7a'
};

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(name + ' must be an epoch value');
}

export function createBeatJudge(): BeatJudge {
  let combo = 0;
  let maxCombo = 0;
  let total = 0;
  const counts: BeatCounts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
  let last: BeatRecord | null = null;

  function labelFor(deviationMs: number): BeatLabel {
    const absolute = Math.abs(deviationMs);
    if (absolute <= 60) return 'PERFECT';
    if (absolute <= 140) return 'GREAT';
    if (absolute <= 300) return 'GOOD';
    return 'MISS';
  }

  function judge(input: BeatJudgeInput): BeatRecord {
    assertFinite(input.at, 'at');
    assertFinite(input.nodeEpoch, 'nodeEpoch');
    const deviation = input.forcedDeviation != null ? input.forcedDeviation : input.at - input.nodeEpoch;
    assertFinite(deviation, 'deviation');
    const label = labelFor(deviation);
    total++;
    counts[label]++;
    if (label === 'MISS') combo = 0;
    else {
      combo++;
      maxCombo = Math.max(maxCombo, combo);
    }
    const acc = total ? (counts.PERFECT + counts.GREAT) / total : 0;
    const record: BeatRecord = {
      label,
      color: COLORS[label],
      dev: Math.round(deviation),
      combo,
      maxCombo,
      acc,
      mode: input.mode,
      at: input.at
    };
    last = record;
    return record;
  }

  function stats(): BeatStats {
    return {
      combo,
      maxCombo,
      total,
      counts: { ...counts },
      last: last ? { ...last } : null
    };
  }

  return { colors: COLORS, labelFor, judge, stats };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
