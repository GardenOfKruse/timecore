namespace TimeCoreDomain {
export type TimeSyncPolicyStatus = 'synced' | 'stale' | 'failed';

export interface TimeSyncPolicySample {
  offset: number;
  rtt: number;
  src: string;
}

export interface TimeSyncPolicyDecision {
  status: TimeSyncPolicyStatus;
  chosen: TimeSyncPolicySample | null;
  targetOffset: number | null;
  retryDelayMs: number;
}

export interface TimeSyncPolicyOptions {
  singleSourceMaxRttMs?: number;
  disagreementMs?: number;
  disagreementRttMs?: number;
  freshWindowMs?: number;
  syncedRetryMs?: number;
  fallbackRetryMs?: number;
}

export interface TimeSyncPolicy {
  decide(
    samples: readonly TimeSyncPolicySample[],
    nowEpoch: number,
    lastSyncEpoch: number
  ): TimeSyncPolicyDecision;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

export function createTimeSyncPolicy(options: TimeSyncPolicyOptions = {}): TimeSyncPolicy {
  const singleSourceMaxRttMs = options.singleSourceMaxRttMs == null ? 350 : options.singleSourceMaxRttMs;
  const disagreementMs = options.disagreementMs == null ? 400 : options.disagreementMs;
  const disagreementRttMs = options.disagreementRttMs == null ? 400 : options.disagreementRttMs;
  const freshWindowMs = options.freshWindowMs == null ? 30 * 60000 : options.freshWindowMs;
  const syncedRetryMs = options.syncedRetryMs == null ? 5 * 60000 : options.syncedRetryMs;
  const fallbackRetryMs = options.fallbackRetryMs == null ? 60 * 1000 : options.fallbackRetryMs;

  function decide(
    samples: readonly TimeSyncPolicySample[],
    nowEpoch: number,
    lastSyncEpoch: number
  ): TimeSyncPolicyDecision {
    const valid = samples.filter(sample => finite(sample.offset) && finite(sample.rtt));
    const ordered = valid.slice().sort((a, b) => a.rtt - b.rtt);
    let chosen: TimeSyncPolicySample | null = null;

    if (ordered.length >= 2) {
      chosen = ordered[0];
      if (Math.abs(ordered[0].offset - ordered[1].offset) > disagreementMs && ordered[0].rtt > disagreementRttMs) {
        chosen = null;
      }
    } else if (ordered.length === 1 && ordered[0].rtt < singleSourceMaxRttMs) {
      chosen = ordered[0];
    }

    if (chosen) {
      return {
        status: 'synced',
        chosen,
        targetOffset: Math.round(chosen.offset),
        retryDelayMs: syncedRetryMs
      };
    }

    if (lastSyncEpoch && nowEpoch - lastSyncEpoch < freshWindowMs) {
      return { status: 'stale', chosen: null, targetOffset: null, retryDelayMs: fallbackRetryMs };
    }
    return { status: 'failed', chosen: null, targetOffset: 0, retryDelayMs: fallbackRetryMs };
  }

  return { decide };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
