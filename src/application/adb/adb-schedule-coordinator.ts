namespace TimeCoreDomain {
export interface AdbScheduleLane {
  actionId: string;
  deviceId: string;
  offsetMs?: number;
  wakeMs?: number;
}

export interface AdbScheduleEntry {
  actionId: string;
  deviceId: string;
  nodeEpoch: number;
  triggerEpoch: number;
  fireEpoch: number;
  spawnEpoch: number;
}

export interface AdbSchedulePlan {
  entries: readonly AdbScheduleEntry[];
}

export interface AdbSchedulePlanner {
  plan(nodeEpoch: number, nowEpoch: number, lanes: readonly AdbScheduleLane[]): AdbSchedulePlan;
}

export interface AdbScheduleGate {
  arm(nodeEpoch: number): void;
  claim(actionId: string, deviceId: string, nodeEpoch: number): boolean;
  reset(): void;
  size(): number;
}

export interface AdbScheduleTimerPort {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

export interface AdbScheduleCoordinatorInput {
  nodeEpoch: number;
  nowEpoch: number;
  lanes: readonly AdbScheduleLane[];
  onFire: (entry: AdbScheduleEntry) => void;
}

export interface AdbScheduleState {
  armed: boolean;
  planned: number;
  pending: number;
  spawned: number;
}

export interface AdbScheduleCoordinator {
  arm(input: AdbScheduleCoordinatorInput): AdbScheduleState;
  clear(): void;
  reset(): void;
  state(): AdbScheduleState;
}

export interface AdbScheduleCoordinatorOptions {
  planner: AdbSchedulePlanner;
  gate: AdbScheduleGate;
  timer?: AdbScheduleTimerPort;
}

function assertEpoch(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(name + ' must be an absolute epoch value');
}

function browserTimer(): AdbScheduleTimerPort {
  return {
    set: (callback, delayMs) => setTimeout(callback, Math.max(0, delayMs)),
    clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>)
  };
}

export function createAdbScheduleCoordinator(options: AdbScheduleCoordinatorOptions): AdbScheduleCoordinator {
  const timer = options.timer || browserTimer();
  const handles = new Set<unknown>();
  let generation = 0;
  let planned = 0;
  let armed = false;

  function copyState(): AdbScheduleState {
    return { armed, planned, pending: handles.size, spawned: options.gate.size() };
  }

  function clear(): void {
    generation++;
    for (const handle of handles) timer.clear(handle);
    handles.clear();
    armed = false;
    planned = 0;
  }

  function reset(): void {
    clear();
    options.gate.reset();
  }

  function arm(input: AdbScheduleCoordinatorInput): AdbScheduleState {
    assertEpoch(input.nodeEpoch, 'nodeEpoch');
    assertEpoch(input.nowEpoch, 'nowEpoch');
    clear();
    options.gate.arm(input.nodeEpoch);
    const plan = options.planner.plan(input.nodeEpoch, input.nowEpoch, input.lanes);
    const token = generation;
    for (const entry of plan.entries) {
      let handle: unknown;
      const callback = () => {
        if (token !== generation) return;
        if (handles.has(handle)) handles.delete(handle);
        if (options.gate.claim(entry.actionId, entry.deviceId, entry.nodeEpoch)) input.onFire(entry);
      };
      handle = timer.set(callback, Math.max(0, entry.spawnEpoch - input.nowEpoch));
      handles.add(handle);
    }
    planned = plan.entries.length;
    armed = planned > 0;
    return copyState();
  }

  return { arm, clear, reset, state: copyState };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
