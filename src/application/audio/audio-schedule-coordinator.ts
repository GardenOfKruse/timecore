namespace TimeCoreDomain {
export interface AudioScheduleCoordinatorInput {
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

export interface AudioSchedulePlannerPortEntry {
  key: string;
  kind: string;
  epoch: number;
  beatIndex?: number;
  fireKey?: string;
}

export interface AudioSchedulePlannerPort {
  planCountdown(input: AudioScheduleCoordinatorInput): AudioSchedulePlannerPortEntry[];
  planFreeRun(nowEpoch: number, leadMs?: number): AudioSchedulePlannerPortEntry;
}

export interface AudioScheduledEntry extends AudioSchedulePlannerPortEntry {
  audioTime: number;
}

export interface AudioScheduleCoordinator {
  anchor(epoch: number, audioTime: number): void;
  reanchorIfDue(epoch: number, readAudioTime: () => number): boolean;
  planCountdown(input: AudioScheduleCoordinatorInput): AudioScheduledEntry[];
  planFreeRun(nowEpoch: number): AudioScheduledEntry | null;
  clearScheduled(): void;
  hasFireKey(targetEpoch: number): boolean;
  scheduledSize(): number;
}

export interface AudioScheduleCoordinatorOptions {
  reanchorMs?: number;
  maxScheduled?: number;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

export function createAudioScheduleCoordinator(
  planner: AudioSchedulePlannerPort,
  options: AudioScheduleCoordinatorOptions = {}
): AudioScheduleCoordinator {
  const reanchorMs = options.reanchorMs == null ? 30000 : options.reanchorMs;
  const maxScheduled = options.maxScheduled == null ? 4000 : options.maxScheduled;
  const scheduled = new Set<string>();
  let anchorValue: { epoch: number; audioTime: number } | null = null;

  function anchor(epoch: number, audioTime: number): void {
    if (!finite(epoch) || !finite(audioTime)) throw new RangeError('audio anchor must be finite');
    anchorValue = { epoch, audioTime };
  }

  function reanchorIfDue(epoch: number, readAudioTime: () => number): boolean {
    if (!anchorValue || epoch - anchorValue.epoch <= reanchorMs) return false;
    anchor(epoch, readAudioTime());
    return true;
  }

  function audioTimeFor(epoch: number): number {
    if (!anchorValue) throw new Error('audio schedule is not anchored');
    return anchorValue.audioTime + (epoch - anchorValue.epoch) / 1000;
  }

  function accept(entry: AudioSchedulePlannerPortEntry): AudioScheduledEntry {
    const scheduledEntry = { ...entry, audioTime: audioTimeFor(entry.epoch) };
    scheduled.add(entry.key);
    if (entry.fireKey) scheduled.add(entry.fireKey);
    return scheduledEntry;
  }

  function trim(): void {
    if (scheduled.size > maxScheduled) scheduled.clear();
  }

  function planCountdown(input: AudioScheduleCoordinatorInput): AudioScheduledEntry[] {
    const output: AudioScheduledEntry[] = [];
    for (const entry of planner.planCountdown(input)) {
      if (scheduled.has(entry.key)) continue;
      output.push(accept(entry));
    }
    trim();
    return output;
  }

  function planFreeRun(nowEpoch: number): AudioScheduledEntry | null {
    const entry = planner.planFreeRun(nowEpoch);
    if (scheduled.has(entry.key)) return null;
    const output = accept(entry);
    trim();
    return output;
  }

  return {
    anchor,
    reanchorIfDue,
    planCountdown,
    planFreeRun,
    clearScheduled: () => scheduled.clear(),
    hasFireKey: targetEpoch => scheduled.has('fire:' + targetEpoch),
    scheduledSize: () => scheduled.size
  };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
