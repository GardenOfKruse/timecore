namespace TimeCoreDomain {
export interface WindowStateSnapshot {
  clock: boolean;
  top: boolean;
  fs: boolean;
}

export type WindowCommandIntent =
  | { type: 'toggle-top' }
  | { type: 'set-opacity'; value: number }
  | { type: 'minimize' }
  | { type: 'toggle-fullscreen' }
  | { type: 'size'; preset: string }
  | { type: 'move-begin' }
  | { type: 'move-end' }
  | { type: 'set-left-button'; held: boolean }
  | { type: 'zoom-clock'; delta: number; buttons: number }
  | { type: 'open'; url: string }
  | { type: 'close' };

export interface WindowCommandModel {
  route(command: unknown, arg?: unknown): WindowCommandIntent | null;
  snapshot(state: Partial<WindowStateSnapshot>): WindowStateSnapshot;
}

function numberOr(value: unknown, fallback: number): number {
  const number = Number(value);
  return number || fallback;
}

function opacity(value: unknown): number {
  return Math.min(1, Math.max(0.3, numberOr(value, 1)));
}

function zoomInput(value: unknown): { delta: number; buttons: number } {
  const isObject = value !== null && typeof value === 'object';
  return {
    delta: numberOr(isObject ? (value as { delta?: unknown }).delta : value, 0),
    buttons: isObject ? numberOr((value as { buttons?: unknown }).buttons, 0) : 0
  };
}

function sizePreset(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  const preset = (value as { preset?: unknown }).preset;
  return typeof preset === 'string' ? preset : null;
}

function externalUrl(value: unknown): string | null {
  const url = String(value || '');
  return /^https:\/\/github\.com\/GardenOfKruse\/timecore/.test(url) ? url : null;
}

function route(command: unknown, arg?: unknown): WindowCommandIntent | null {
  switch (command) {
    case 'top': return { type: 'toggle-top' };
    case 'opacity': return { type: 'set-opacity', value: opacity(arg) };
    case 'minimize': return { type: 'minimize' };
    case 'fullscreen': return { type: 'toggle-fullscreen' };
    case 'size': {
      const preset = sizePreset(arg);
      return preset === null ? null : { type: 'size', preset };
    }
    case 'move-begin': return { type: 'move-begin' };
    case 'move-end': return { type: 'move-end' };
    case 'clock-button': return { type: 'set-left-button', held: Boolean(arg) };
    case 'clock-zoom': {
      const input = zoomInput(arg);
      return { type: 'zoom-clock', delta: input.delta, buttons: input.buttons };
    }
    case 'open': {
      const url = externalUrl(arg);
      return url === null ? null : { type: 'open', url };
    }
    case 'close': return { type: 'close' };
    default: return null;
  }
}

function snapshot(state: Partial<WindowStateSnapshot>): WindowStateSnapshot {
  return { clock: Boolean(state.clock), top: Boolean(state.top), fs: Boolean(state.fs) };
}

export function createWindowCommandModel(): WindowCommandModel {
  return { route, snapshot };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
