namespace TimeCoreDomain {
export type AudioScheduleKind = 'tick' | 'beep' | 'fire';

export interface CountdownAudioScheduleInput {
  armed: boolean;
  fired: boolean;
  targetEpoch: number;
  nowEpoch: number;
  lookaheadMs: number;
  softLead: number;
  tickOn: boolean;
  metroFull: boolean;
  freerun: boolean;
}

export interface AudioScheduleEntry {
  key: string;
  kind: AudioScheduleKind;
  epoch: number;
  beatIndex?: number;
  fireKey?: string;
}

export interface AudioSchedulePlanner {
  planCountdown(input: CountdownAudioScheduleInput): AudioScheduleEntry[];
  planFreeRun(nowEpoch: number, leadMs?: number): AudioScheduleEntry;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(name + ' must be an epoch value');
}

function planCountdown(input: CountdownAudioScheduleInput): AudioScheduleEntry[] {
  if (!input.armed || input.fired) return [];
  assertFinite(input.targetEpoch, 'targetEpoch');
  assertFinite(input.nowEpoch, 'nowEpoch');
  assertFinite(input.lookaheadMs, 'lookaheadMs');

  const kMin = Math.max(0, Math.ceil((input.targetEpoch - (input.nowEpoch + input.lookaheadMs)) / 1000));
  const kMax = Math.floor((input.targetEpoch - (input.nowEpoch - 40)) / 1000);
  const entries: AudioScheduleEntry[] = [];
  for (let k = kMin; k <= kMax; k++) {
    const key = 'cd' + input.targetEpoch + ':' + k;
    const epoch = input.targetEpoch - k * 1000;
    if (k === 0) {
      entries.push({ key, kind: 'fire', epoch, beatIndex: 0, fireKey: 'fire:' + input.targetEpoch });
    } else if (k <= 3) {
      entries.push({ key, kind: 'beep', epoch, beatIndex: k });
    } else if (k <= input.softLead && input.tickOn) {
      entries.push({ key, kind: 'tick', epoch, beatIndex: k });
    } else if (input.tickOn && input.metroFull && input.freerun) {
      entries.push({ key, kind: 'tick', epoch, beatIndex: k });
    }
  }
  return entries;
}

function planFreeRun(nowEpoch: number, leadMs = 180): AudioScheduleEntry {
  assertFinite(nowEpoch, 'nowEpoch');
  assertFinite(leadMs, 'leadMs');
  const epoch = Math.ceil((nowEpoch + leadMs) / 1000) * 1000;
  return { key: 'fr' + epoch, kind: 'tick', epoch };
}

export function createAudioSchedulePlanner(): AudioSchedulePlanner {
  return { planCountdown, planFreeRun };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
