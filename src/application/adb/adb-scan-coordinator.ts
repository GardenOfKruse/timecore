namespace TimeCoreDomain {
export interface AdbScanDevice {
  serial: string;
  model?: string;
  [key: string]: unknown;
}

export interface AdbScanSnapshot {
  signature: string;
  [key: string]: unknown;
}

export interface AdbScanWork {
  nameSerials: readonly string[];
  screenSizeSerials: readonly string[];
  probeSerials: readonly string[];
}

export interface AdbScanReconcileResult {
  snapshot: AdbScanSnapshot;
  work: AdbScanWork;
  seen: string[];
}

export interface AdbScanRegistry {
  reconcile(stdout: string, nowEpoch: number): AdbScanReconcileResult;
  get(serial: string): AdbScanDevice | null;
  update(serial: string, patch: { name: string }): AdbScanDevice | null;
}

export interface AdbScanTasks {
  resolveName(serial: string, device: AdbScanDevice): Promise<string>;
  measureScreenSize(serial: string, device: AdbScanDevice): void | Promise<void>;
  probe(serial: string, device: AdbScanDevice, silent: boolean): void | Promise<void>;
}

export interface AdbScanCoordinatorInput {
  stdout: string;
  nowEpoch: number;
  previousSignature: string;
  silent: boolean;
}

export interface AdbScanRunResult extends AdbScanReconcileResult {
  changed: boolean;
  nameCount: number;
}

export interface AdbScanCoordinator {
  run(input: AdbScanCoordinatorInput): Promise<AdbScanRunResult>;
}

export interface AdbScanCoordinatorOptions {
  registry: AdbScanRegistry;
  tasks: AdbScanTasks;
}

export function createAdbScanCoordinator(options: AdbScanCoordinatorOptions): AdbScanCoordinator {
  const registry = options.registry;
  const tasks = options.tasks;

  async function run(input: AdbScanCoordinatorInput): Promise<AdbScanRunResult> {
    const result = registry.reconcile(input.stdout, input.nowEpoch);
    const nameJobs = result.work.nameSerials.map(async serial => {
      const device = registry.get(serial);
      if (!device) return;
      const name = await tasks.resolveName(serial, device);
      const current = registry.get(serial) || device;
      registry.update(serial, { name: name || current.model || serial.slice(-4) });
    });

    result.work.screenSizeSerials.forEach(serial => {
      const device = registry.get(serial);
      if (device) void tasks.measureScreenSize(serial, device);
    });
    result.work.probeSerials.forEach(serial => {
      const device = registry.get(serial);
      if (device) void tasks.probe(serial, device, input.silent);
    });

    await Promise.all(nameJobs);
    return {
      ...result,
      changed: result.snapshot.signature !== input.previousSignature,
      nameCount: nameJobs.length
    };
  }

  return { run };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
