namespace TimeCoreDomain {
export interface AdbScriptDevice {
  serial: string;
  W?: number;
  H?: number;
  TI?: number;
}

export interface AdbTapScriptAction {
  type: 'tap' | 'wake';
  x?: number | string;
  y?: number | string;
  shotW?: number;
  shotH?: number;
  n?: number | string;
  gap?: number | string;
}

export interface AdbAdvancedScriptAction {
  type: 'adv';
  script: string;
  x?: number | string;
  y?: number | string;
  shotW?: number;
  shotH?: number;
}

export type AdbScriptAction = AdbTapScriptAction | AdbAdvancedScriptAction;

export interface AdbScriptBuildOptions {
  compensate?: boolean;
}

export interface AdbScriptBuilder {
  build(action: AdbScriptAction, device: AdbScriptDevice, options?: AdbScriptBuildOptions): string;
}

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 2340;

function tapXY(action: AdbScriptAction, device: AdbScriptDevice): [number, number] {
  const width = device.W || DEFAULT_WIDTH;
  const height = device.H || DEFAULT_HEIGHT;
  let x = Number(action.x);
  let y = Number(action.y);
  if (!Number.isFinite(x) || action.x === '') x = Math.round(width / 2);
  if (!Number.isFinite(y) || action.y === '') y = Math.round(height / 2);
  if (action.shotW && device.W && device.W !== action.shotW) x = Math.round(x * device.W / action.shotW);
  if (action.shotH && device.H && device.H !== action.shotH) y = Math.round(y * device.H / action.shotH);
  return [x, y];
}

function build(action: AdbScriptAction, device: AdbScriptDevice, options: AdbScriptBuildOptions = {}): string {
  const [x, y] = tapXY(action, device);
  if (action.type === 'adv') {
    return action.script
      .replace(/\{serial\}/g, device.serial)
      .replace(/\{W\}/g, String(device.W || DEFAULT_WIDTH))
      .replace(/\{H\}/g, String(device.H || DEFAULT_HEIGHT))
      .replace(/\{X\}/g, String(x))
      .replace(/\{Y\}/g, String(y));
  }

  const n = Math.max(1, Math.min(200, Number(action.n) || 5));
  if (n <= 1) return `input tap ${x} ${y}`;

  const transportMs = Number(device.TI);
  const compensate = options.compensate === true && transportMs > 30;
  const requestedGap = Number(action.gap) || 400;
  const gap = Math.max(50, requestedGap - (compensate ? transportMs : 0)) / 1000;
  const loop = `for i in $(seq 1 ${n}); do input tap ${x} ${y}; if [ $i -lt ${n} ]; then sleep ${gap.toFixed(3)}; fi; done`;
  if (action.type === 'wake') {
    const width = device.W || DEFAULT_WIDTH;
    const height = device.H || DEFAULT_HEIGHT;
    return `input keyevent 224; sleep 0.6; input swipe ${Math.round(width / 2)} ${Math.round(height * 0.72)} ${Math.round(width / 2)} ${Math.round(height * 0.3)} 300; sleep 1; ` + loop;
  }
  return loop;
}

export function createAdbScriptBuilder(): AdbScriptBuilder {
  return { build };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
