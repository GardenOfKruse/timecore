namespace TimeCoreDomain {
export interface CameraMotionState {
  yaw: number;
  targetYaw: number;
  pitch: number;
  targetPitch: number;
}

export interface CameraMotionModel {
  drag(deltaX: number, deltaY: number): CameraMotionState;
  update(dt: number): CameraMotionState;
  state(): CameraMotionState;
  reset(): CameraMotionState;
}

export interface CameraMotionOptions {
  yawSensitivity?: number;
  pitchSensitivity?: number;
  minPitch?: number;
  maxPitch?: number;
  smoothing?: number;
}

function copy(state: CameraMotionState): CameraMotionState {
  return {
    yaw: state.yaw,
    targetYaw: state.targetYaw,
    pitch: state.pitch,
    targetPitch: state.targetPitch
  };
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function createCameraMotionModel(options: CameraMotionOptions = {}): CameraMotionModel {
  const yawSensitivity = finiteOr(options.yawSensitivity, 0.009);
  const pitchSensitivity = finiteOr(options.pitchSensitivity, 0.007);
  const minPitch = finiteOr(options.minPitch, -1.15);
  const maxPitch = Math.max(minPitch, finiteOr(options.maxPitch, 1.15));
  const smoothing = Math.max(0, finiteOr(options.smoothing, 8));
  const stateValue: CameraMotionState = { yaw: 0, targetYaw: 0, pitch: 0, targetPitch: 0 };

  function clampPitch(value: number): number {
    return Math.max(minPitch, Math.min(maxPitch, value));
  }

  function drag(deltaX: number, deltaY: number): CameraMotionState {
    const dx = finiteOr(deltaX, 0);
    const dy = finiteOr(deltaY, 0);
    stateValue.targetYaw -= dx * yawSensitivity;
    stateValue.targetPitch = clampPitch(stateValue.targetPitch - dy * pitchSensitivity);
    return copy(stateValue);
  }

  function update(dt: number): CameraMotionState {
    const elapsed = Math.max(0, finiteOr(dt, 0));
    const factor = 1 - Math.exp(-elapsed * smoothing);
    stateValue.yaw += (stateValue.targetYaw - stateValue.yaw) * factor;
    stateValue.pitch += (stateValue.targetPitch - stateValue.pitch) * factor;
    return copy(stateValue);
  }

  function reset(): CameraMotionState {
    stateValue.yaw = 0;
    stateValue.targetYaw = 0;
    stateValue.pitch = 0;
    stateValue.targetPitch = 0;
    return copy(stateValue);
  }

  return {
    drag,
    update,
    state: () => copy(stateValue),
    reset
  };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
