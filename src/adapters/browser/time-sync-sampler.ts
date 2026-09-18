namespace TimeCoreDomain {
export interface TimeSourceDefinition {
  name: string;
  url: string;
  parse(payload: unknown): number;
}

export interface TimeSyncResponse {
  text(): Promise<string>;
}

export interface TimeSyncAbortController {
  signal: unknown;
  abort(): void;
}

export interface TimeSyncSamplerPlatform {
  now(): number;
  baselineEpoch: number;
  baselineMonotonicMs: number;
  fetch(url: string, init: { cache: 'no-store'; signal: unknown }): Promise<TimeSyncResponse>;
  createAbortController(): TimeSyncAbortController;
  setTimeout(listener: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface TimeSample {
  offset: number;
  rtt: number;
  src: string;
}

export interface TimeSyncSampler {
  sample(source: TimeSourceDefinition): Promise<TimeSample>;
  sampleMany(sources: readonly TimeSourceDefinition[], limit?: number): Promise<TimeSample[]>;
}

export interface TimeSyncSamplerOptions {
  timeoutMs?: number;
  maxRttMs?: number;
}

export function createTimeSyncSampler(
  platform: TimeSyncSamplerPlatform,
  options: TimeSyncSamplerOptions = {}
): TimeSyncSampler {
  const timeoutMs = options.timeoutMs == null ? 2500 : options.timeoutMs;
  const maxRttMs = options.maxRttMs == null ? 1800 : options.maxRttMs;

  async function sample(source: TimeSourceDefinition): Promise<TimeSample> {
    const controller = platform.createAbortController();
    const timeout = platform.setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = platform.now();
    try {
      const response = await platform.fetch(source.url, { cache: 'no-store', signal: controller.signal });
      const responseAt = platform.now();
      const serverEpoch = source.parse(JSON.parse(await response.text()));
      if (!Number.isFinite(serverEpoch)) throw new Error('bad payload');
      const rtt = responseAt - startedAt;
      if (rtt > maxRttMs) throw new Error('rtt too high');
      const localMid = platform.baselineEpoch + ((startedAt + responseAt) / 2 - platform.baselineMonotonicMs);
      return { offset: serverEpoch - localMid, rtt, src: source.name };
    } finally {
      platform.clearTimeout(timeout);
    }
  }

  async function sampleMany(sources: readonly TimeSourceDefinition[], limit = 3): Promise<TimeSample[]> {
    const results: TimeSample[] = [];
    const count = Math.max(0, Math.floor(limit));
    for (const source of sources) {
      if (results.length >= count) break;
      try { results.push(await sample(source)); } catch (_) { /* 单源失败不阻断多源校时 */ }
    }
    return results;
  }

  return { sample, sampleMany };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
