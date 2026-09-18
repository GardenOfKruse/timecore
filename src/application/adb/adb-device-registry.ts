namespace TimeCoreDomain {
export interface AdbDeviceRecord {
  serial: string;
  state?: string;
  model?: string;
  name?: string;
  on?: boolean;
  L?: number | null;
  W?: number;
  H?: number;
  TI?: number;
  probedAt?: number;
  test?: boolean;
}

export interface AdbSavedDevice {
  name?: string;
  on?: boolean;
}

export type AdbDevicePatch = Partial<Omit<AdbDeviceRecord, 'serial'>>;

export interface AdbDeviceRegistryWork {
  nameSerials: readonly string[];
  screenSizeSerials: readonly string[];
  probeSerials: readonly string[];
}

export interface AdbDeviceRegistrySnapshot {
  devices: AdbDeviceRecord[];
  saved: Record<string, AdbSavedDevice>;
  signature: string;
}

export interface AdbDeviceRegistryReconcileResult {
  snapshot: AdbDeviceRegistrySnapshot;
  work: AdbDeviceRegistryWork;
  seen: string[];
}

export interface AdbDeviceRegistry {
  reconcile(stdout: string, nowEpoch: number): AdbDeviceRegistryReconcileResult;
  update(serial: string, patch: AdbDevicePatch): AdbDeviceRecord | null;
  upsert(record: AdbDeviceRecord): AdbDeviceRecord;
  remove(serial: string): boolean;
  get(serial: string): AdbDeviceRecord | null;
  snapshot(): AdbDeviceRegistrySnapshot;
}

export interface AdbDeviceRegistryOptions {
  saved?: Record<string, AdbSavedDevice>;
  staleAfterMs?: number;
}

function cloneRecord(record: AdbDeviceRecord): AdbDeviceRecord {
  return { ...record };
}

function cloneSaved(saved: Record<string, AdbSavedDevice>): Record<string, AdbSavedDevice> {
  const output: Record<string, AdbSavedDevice> = {};
  for (const [serial, value] of Object.entries(saved)) output[serial] = { ...value };
  return output;
}

function parseLine(line: string): { serial: string; state: string; model?: string } | null {
  const match = line.match(/^(\S+)\s+(device|offline|unauthorized)/);
  if (!match) return null;
  const model = (line.match(/model:(\S+)/) || [])[1];
  return { serial: match[1], state: match[2], model };
}

function signature(devices: Map<string, AdbDeviceRecord>): string {
  return [...devices.values()]
    .map(d => [d.serial, d.state, d.on, d.name, d.L, d.W, d.H].join(':'))
    .join('|');
}

export function createAdbDeviceRegistry(options: AdbDeviceRegistryOptions = {}): AdbDeviceRegistry {
  const devices = new Map<string, AdbDeviceRecord>();
  const saved = cloneSaved(options.saved || {});
  const staleAfterMs = options.staleAfterMs == null ? 60000 : Math.max(0, options.staleAfterMs);

  function savedFor(serial: string): AdbSavedDevice {
    if (!saved[serial]) saved[serial] = {};
    return saved[serial];
  }

  function snapshot(): AdbDeviceRegistrySnapshot {
    return {
      devices: [...devices.values()].map(cloneRecord),
      saved: cloneSaved(saved),
      signature: signature(devices)
    };
  }

  function reconcile(stdout: string, nowEpoch: number): AdbDeviceRegistryReconcileResult {
    if (!Number.isFinite(nowEpoch)) throw new RangeError('nowEpoch must be an absolute epoch value');
    const seen = new Set<string>();
    const nameSerials: string[] = [];
    const screenSizeSerials: string[] = [];
    const probeSerials: string[] = [];
    const nameSet = new Set<string>();
    const screenSet = new Set<string>();
    const probeSet = new Set<string>();

    for (const line of String(stdout || '').split('\n')) {
      const parsed = parseLine(line);
      if (!parsed) continue;
      seen.add(parsed.serial);
      const record = devices.get(parsed.serial) || { serial: parsed.serial };
      record.state = parsed.state;
      if (parsed.model) record.model = parsed.model;
      const preference = savedFor(parsed.serial);
      if (preference.name) record.name = preference.name;
      else if (!nameSet.has(parsed.serial)) { nameSet.add(parsed.serial); nameSerials.push(parsed.serial); }
      record.on = preference.on != null ? preference.on : true;
      preference.on = record.on;
      devices.set(parsed.serial, record);

      if (parsed.state === 'device') {
        if (!record.W && !screenSet.has(parsed.serial)) {
          screenSet.add(parsed.serial);
          screenSizeSerials.push(parsed.serial);
        }
        const stale = record.L == null || !record.probedAt || nowEpoch - record.probedAt > staleAfterMs;
        if (stale && !probeSet.has(parsed.serial)) {
          probeSet.add(parsed.serial);
          probeSerials.push(parsed.serial);
        }
      }
    }

    for (const [serial, record] of devices) {
      if (!seen.has(serial) && !record.test) devices.delete(serial);
    }

    const next = snapshot();
    return {
      snapshot: next,
      work: { nameSerials, screenSizeSerials, probeSerials },
      seen: [...seen]
    };
  }

  function update(serial: string, patch: AdbDevicePatch): AdbDeviceRecord | null {
    const record = devices.get(serial);
    if (!record) {
      const preference = savedFor(serial);
      if (patch.name !== undefined) preference.name = patch.name;
      if (patch.on !== undefined) preference.on = patch.on;
      return null;
    }
    Object.assign(record, patch);
    const preference = savedFor(serial);
    if (patch.name !== undefined) preference.name = record.name;
    if (patch.on !== undefined) preference.on = record.on;
    return cloneRecord(record);
  }

  function upsert(record: AdbDeviceRecord): AdbDeviceRecord {
    if (!record || !record.serial) throw new TypeError('device serial is required');
    const current = devices.get(record.serial) || { serial: record.serial };
    Object.assign(current, record);
    const preference = savedFor(record.serial);
    if (current.name) preference.name = current.name;
    if (current.on != null) preference.on = current.on;
    devices.set(record.serial, current);
    return cloneRecord(current);
  }

  function remove(serial: string): boolean {
    const existed = devices.delete(serial);
    delete saved[serial];
    return existed;
  }

  return {
    reconcile,
    update,
    upsert,
    remove,
    get: serial => {
      const record = devices.get(serial);
      return record ? cloneRecord(record) : null;
    },
    snapshot
  };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
