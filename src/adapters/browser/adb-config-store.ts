namespace TimeCoreDomain {
export interface AdbConfigStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AdbConfigRecord {
  [key: string]: unknown;
}

export interface AdbConfigStoreOptions {
  defaults?: AdbConfigRecord;
  key?: string;
  storage?: AdbConfigStorage;
}

export interface AdbConfigStore {
  load(): AdbConfigRecord;
  save(config: AdbConfigRecord, actionSnapshot: readonly AdbConfigRecord[]): void;
}

function runtimeStorage(): AdbConfigStorage {
  const scope = globalThis as typeof globalThis & { localStorage?: AdbConfigStorage };
  if (!scope.localStorage) throw new Error('AdbConfigStore requires localStorage');
  return scope.localStorage;
}

function cloneDefaults(defaults: AdbConfigRecord): AdbConfigRecord {
  return JSON.parse(JSON.stringify(defaults)) as AdbConfigRecord;
}

function parsedObject(raw: string | null): AdbConfigRecord {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as AdbConfigRecord : {};
  } catch (_) {
    return {};
  }
}

export function createAdbConfigStore(options: AdbConfigStoreOptions = {}): AdbConfigStore {
  const storage = options.storage || runtimeStorage();
  const key = options.key || 'tc.adb.v1';
  const defaults = options.defaults || {};

  function load(): AdbConfigRecord {
    return Object.assign(cloneDefaults(defaults), parsedObject(storage.getItem(key)));
  }

  function save(config: AdbConfigRecord, actionSnapshot: readonly AdbConfigRecord[]): void {
    const payload = Object.assign({}, config, { actions: actionSnapshot });
    storage.setItem(key, JSON.stringify(payload, (name, value) => name === '_shot' ? undefined : value));
  }

  return { load, save };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
