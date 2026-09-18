namespace TimeCoreDomain {
export interface AdbActionControllerAction {
  id: string;
  devs: string[];
  [key: string]: unknown;
}

export type AdbActionControllerField = 'name' | 'enabled' | 'lead' | 'offset' | 'script' | 'x' | 'y' | 'count' | 'gap';

export type AdbActionControllerEvent =
  | { kind: 'field'; action: AdbActionControllerAction; field: AdbActionControllerField; value: string | boolean }
  | { kind: 'device-toggle'; action: AdbActionControllerAction; serial: string }
  | { kind: 'remove'; action: AdbActionControllerAction }
  | { kind: 'fire'; action: AdbActionControllerAction }
  | { kind: 'screenshot'; action: AdbActionControllerAction }
  | { kind: 'open-picker'; action: AdbActionControllerAction };

export interface AdbActionControllerCatalog {
  remove(action: AdbActionControllerAction): boolean;
}

export interface AdbActionControllerOptions {
  catalog: AdbActionControllerCatalog;
  save(): void;
  render(): void;
  onFire(action: AdbActionControllerAction): void;
  onScreenshot(action: AdbActionControllerAction): void;
  onOpenPicker(action: AdbActionControllerAction): void;
}

export interface AdbActionController {
  handle(event: AdbActionControllerEvent): void;
}

function updateField(action: AdbActionControllerAction, field: AdbActionControllerField, value: string | boolean): void {
  if (field === 'name') action.name = String(value);
  else if (field === 'enabled') action.on = !!value;
  else if (field === 'lead') action.lead = value === '' ? '' : +value;
  else if (field === 'offset') action.offsetMs = value === '' ? 0 : Math.max(0, +value || 0);
  else if (field === 'script') action.script = String(value);
  else if (field === 'x') action.x = value === '' ? '' : +value;
  else if (field === 'y') action.y = value === '' ? '' : +value;
  else if (field === 'count') action.n = +value || 5;
  else if (field === 'gap') action.gap = +value || 400;
}

export function createAdbActionController(options: AdbActionControllerOptions): AdbActionController {
  function handle(event: AdbActionControllerEvent): void {
    const action = event.action;
    if (event.kind === 'field') {
      updateField(action, event.field, event.value);
      options.save();
      return;
    }
    if (event.kind === 'device-toggle') {
      action.devs = action.devs.includes(event.serial)
        ? action.devs.filter(serial => serial !== event.serial)
        : action.devs.concat(event.serial);
      options.save();
      return;
    }
    if (event.kind === 'remove') {
      options.catalog.remove(action);
      options.save();
      options.render();
    } else if (event.kind === 'fire') {
      options.onFire(action);
    } else if (event.kind === 'screenshot') {
      options.onScreenshot(action);
    } else if (event.kind === 'open-picker') {
      options.onOpenPicker(action);
    }
  }

  return { handle };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
