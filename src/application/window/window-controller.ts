namespace TimeCoreDomain {
export interface WindowControllerState {
  clock: boolean;
  fs: boolean;
  top: boolean;
  ver: string | null;
}

export interface WindowTransport {
  send(command: string, arg?: unknown): void;
  get(): Promise<unknown>;
  onState?: (listener: (state: unknown) => void) => (() => void);
}

export interface WindowController {
  state(): WindowControllerState;
  subscribe(listener: (state: WindowControllerState) => void): () => void;
  refresh(): Promise<WindowControllerState>;
  connect(pollMs?: number): () => void;
  toggleTop(): void;
  setOpacity(value: number): void;
  minimize(): void;
  toggleFullscreen(): void;
  setSize(preset: string): void;
  beginMove(): void;
  endMove(): void;
  setLeftButton(held: boolean): void;
  zoom(delta: number, buttons: number): void;
  open(url: string): void;
  close(): void;
}

const INITIAL_STATE: WindowControllerState = { clock: false, fs: false, top: false, ver: null };

function copyState(state: WindowControllerState): WindowControllerState {
  return { clock: state.clock, fs: state.fs, top: state.top, ver: state.ver };
}

function normalize(raw: unknown, previous: WindowControllerState): WindowControllerState {
  const source = raw !== null && typeof raw === 'object' ? raw as {
    clock?: unknown;
    fs?: unknown;
    top?: unknown;
    ver?: unknown;
  } : {};
  return {
    clock: Boolean(source.clock),
    fs: Boolean(source.fs),
    top: Boolean(source.top),
    ver: typeof source.ver === 'string' ? source.ver : previous.ver
  };
}

function sameState(a: WindowControllerState, b: WindowControllerState): boolean {
  return a.clock === b.clock && a.fs === b.fs && a.top === b.top && a.ver === b.ver;
}

export function createWindowController(transport: WindowTransport): WindowController {
  let current = copyState(INITIAL_STATE);
  const listeners = new Set<(state: WindowControllerState) => void>();
  let detachPush: (() => void) | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;

  function apply(raw: unknown): WindowControllerState {
    const next = normalize(raw, current);
    if (sameState(next, current)) return copyState(current);
    current = next;
    const nextCopy = copyState(current);
    for (const listener of listeners) listener(nextCopy);
    return nextCopy;
  }

  function refresh(): Promise<WindowControllerState> {
    return transport.get().then(apply);
  }

  function stopConnection(): void {
    if (detachPush) { detachPush(); detachPush = null; }
    if (poll) { clearInterval(poll); poll = null; }
  }

  function connect(pollMs = 800): () => void {
    stopConnection();
    if (transport.onState) detachPush = transport.onState(apply);
    if (Number.isFinite(pollMs) && pollMs > 0) {
      poll = setInterval(() => { void refresh().catch(() => {}); }, pollMs);
    }
    void refresh().catch(() => {});
    return stopConnection;
  }

  function send(command: string, arg?: unknown): void {
    transport.send(command, arg);
  }

  return {
    state: () => copyState(current),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    connect,
    toggleTop: () => send('top'),
    setOpacity: value => send('opacity', value),
    minimize: () => send('minimize'),
    toggleFullscreen: () => send('fullscreen'),
    setSize: preset => send('size', { preset }),
    beginMove: () => send('move-begin'),
    endMove: () => send('move-end'),
    setLeftButton: held => send('clock-button', held),
    zoom: (delta, buttons) => send('clock-zoom', { delta, buttons }),
    open: url => send('open', url),
    close: () => send('close')
  };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
