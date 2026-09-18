namespace TimeCoreDomain {
export interface AdbEmissionGate {
  arm(nodeEpoch: number): void;
  claim(actionId: string, deviceId: string, nodeEpoch: number): boolean;
  reset(): void;
  size(): number;
}

function assertEpoch(value: number): void {
  if (!Number.isFinite(value)) throw new RangeError('nodeEpoch must be an absolute epoch value');
}

function emissionKey(actionId: string, deviceId: string, nodeEpoch: number): string {
  return String(actionId) + ':' + String(deviceId) + ':' + String(nodeEpoch);
}

export function createAdbEmissionGate(): AdbEmissionGate {
  let armedNode: number | null = null;
  const claimed = new Set<string>();

  function arm(nodeEpoch: number): void {
    assertEpoch(nodeEpoch);
    if (armedNode !== nodeEpoch) {
      claimed.clear();
      armedNode = nodeEpoch;
    }
  }

  function claim(actionId: string, deviceId: string, nodeEpoch: number): boolean {
    assertEpoch(nodeEpoch);
    if (armedNode == null) armedNode = nodeEpoch;
    const key = emissionKey(actionId, deviceId, nodeEpoch);
    if (claimed.has(key)) return false;
    claimed.add(key);
    return true;
  }

  function reset(): void {
    claimed.clear();
    armedNode = null;
  }

  return { arm, claim, reset, size: () => claimed.size };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
