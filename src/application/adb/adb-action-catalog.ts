namespace TimeCoreDomain {
export interface AdbActionCatalogOptions {
  idFactory?: (kind: string) => string;
}

export interface AdbActionCatalog {
  /** 返回兼容旧 UI/调试接口的可变列表；动作规则仍由本 Module 管理。 */
  list(): AdbAction[];
  enabled(): AdbAction[];
  replace(raw: unknown): AdbAction[];
  add(type: string): AdbAction;
  seed(): AdbAction;
  resetToSeed(): AdbAction[];
  remove(actionOrId: AdbAction | string): boolean;
  removeDevice(serial: string): boolean;
  serialize(): AdbAction[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneAction(action: AdbAction): AdbAction {
  return { ...action, devs: action.devs.slice() };
}

function normalizeType(type: string): string {
  return type === 'tap' || type === 'wake' || type === 'adv' ? type : 'adv';
}

function normalizeAction(value: unknown, idFactory: (kind: string) => string): AdbAction | null {
  if (!isRecord(value)) return null;
  const rawType = typeof value.type === 'string' ? value.type : 'adv';
  const action: AdbAction = {
    ...value,
    id: typeof value.id === 'string' && value.id ? value.id : idFactory('load'),
    type: rawType,
    devs: Array.isArray(value.devs) ? value.devs.filter((serial): serial is string => typeof serial === 'string') : []
  };
  // 清理旧版测试动作，避免它重新出现在用户动作列表中。
  if (action.type === 'adv' && typeof action.script === 'string' && /getprop\s+ro\.product\.model/.test(action.script)) return null;
  return action;
}

function normalizeActions(raw: unknown, idFactory: (kind: string) => string): AdbAction[] {
  const source = Array.isArray(raw) ? raw : [];
  return source.map(value => normalizeAction(value, idFactory)).filter((action): action is AdbAction => !!action);
}

function defaultIdFactory(kind: string): string {
  return 'a' + Date.now() + '-' + kind + '-' + Math.floor(Math.random() * 1000);
}

export function createAdbActionCatalog(raw: unknown = [], options: AdbActionCatalogOptions = {}): AdbActionCatalog {
  const idFactory = options.idFactory || defaultIdFactory;
  let actions = normalizeActions(raw, idFactory);

  function list(): AdbAction[] { return actions; }
  function enabled(): AdbAction[] { return actions.filter(action => !!action.on); }

  function replace(next: unknown): AdbAction[] {
    actions = normalizeActions(next, idFactory);
    return actions;
  }

  function create(type: string): AdbAction {
    const base: AdbAction = {
      id: idFactory('action'),
      name: '',
      lead: '',
      devs: [],
      on: true,
      type: normalizeType(type)
    };
    if (base.type === 'tap') Object.assign(base, { name: '连点', x: '', y: '', n: 5, gap: 400 });
    else if (base.type === 'wake') Object.assign(base, { name: '亮屏连点', x: '', y: '', n: 3, gap: 500 });
    else Object.assign(base, { name: '自定义脚本', script: 'input tap {X} {Y}' });
    return base;
  }

  function add(type: string): AdbAction {
    const action = create(type);
    actions.push(action);
    return action;
  }

  function createSeed(): AdbAction {
    return {
      id: idFactory('seed'),
      type: 'tap',
      name: '连点示例 · 右下 (864,2280)',
      x: 864,
      y: 2280,
      n: 5,
      gap: 400,
      lead: '',
      devs: [],
      on: false
    };
  }

  function resetToSeed(): AdbAction[] {
    actions = [createSeed()];
    return actions;
  }

  function seed(): AdbAction {
    const action = createSeed();
    actions.push(action);
    return action;
  }

  function remove(actionOrId: AdbAction | string): boolean {
    const index = actions.findIndex(action => typeof actionOrId === 'string' ? action.id === actionOrId : action === actionOrId);
    if (index < 0) return false;
    actions.splice(index, 1);
    return true;
  }

  function removeDevice(serial: string): boolean {
    let changed = false;
    for (const action of actions) {
      const next = action.devs.filter(deviceSerial => deviceSerial !== serial);
      if (next.length !== action.devs.length) {
        action.devs = next;
        changed = true;
      }
    }
    return changed;
  }

  function serialize(): AdbAction[] {
    return actions.map(action => {
      const snapshot = cloneAction(action);
      delete snapshot._shot;
      return snapshot;
    });
  }

  return { list, enabled, replace, add, seed, resetToSeed, remove, removeDevice, serialize };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
