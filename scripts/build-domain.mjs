/* 领域运行时构建：把 src/ 的 TypeScript 模块逐个编译为浏览器可加载的平铺产物。
 * 每个模块一张 tsconfig 的旧方案收敛为本清单 + 统一编译参数（等价于原 tsconfig.runtime.*.json：
 * target ES2020 / module None / strict / skipLibCheck / outFile 指定输出）。 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const FLAGS = ['--target', 'ES2020', '--module', 'none', '--moduleResolution', 'node', '--strict', '--skipLibCheck', '--forceConsistentCasingInFileNames'];

// [输出产物, 源文件列表]；入口 import 的依赖会被 tsc 自动跟随并按依赖序内联
const MODULES = [
  ['js/generated/adb-action-controller.js', ['src/application/adb/adb-action-controller.ts']],
  ['js/generated/adb-action-view.js', ['src/application/adb/adb-action-contract.ts', 'src/adapters/browser/adb-action-view.ts']],
  ['js/generated/adb-action-catalog.js', ['src/application/adb/adb-action-contract.ts', 'src/application/adb/adb-action-catalog.ts']],
  ['js/generated/adb-availability-controller.js', ['src/application/adb/adb-availability-controller.ts']],
  ['js/generated/adb-config-store.js', ['src/adapters/browser/adb-config-store.ts']],
  ['js/generated/adb-connection-controller.js', ['src/application/adb/adb-connection-controller.ts']],
  ['js/generated/adb-device-registry.js', ['src/application/adb/adb-device-registry.ts']],
  ['js/generated/adb-device-view.js', ['src/adapters/browser/adb-device-view.ts']],
  ['js/generated/adb-executor.js', ['src/adapters/electron/adb-executor.ts']],
  ['js/generated/adb-fire-controller.js', ['src/application/adb/adb-fire-controller.ts']],
  ['js/generated/adb-emission-gate.js', ['src/domain/adb/adb-emission-gate.ts']],
  ['js/generated/adb-guide-view.js', ['src/adapters/browser/adb-guide-view.ts']],
  ['js/generated/adb-lifecycle-controller.js', ['src/application/adb/adb-lifecycle-controller.ts']],
  ['js/generated/adb-scan-controller.js', ['src/application/adb/adb-scan-controller.ts']],
  ['js/generated/adb-scan-coordinator.js', ['src/application/adb/adb-scan-coordinator.ts']],
  ['js/generated/adb-schedule-coordinator.js', ['src/application/adb/adb-schedule-coordinator.ts']],
  ['js/generated/adb-screenshot-controller.js', ['src/application/adb/adb-screenshot-controller.ts']],
  ['js/generated/adb-screenshot-picker-view.js', ['src/adapters/browser/adb-screenshot-picker-view.ts']],
  ['js/generated/adb-script-builder.js', ['src/domain/adb/adb-script-builder.ts']],
  ['js/generated/audio-schedule-coordinator.js', ['src/application/audio/audio-schedule-coordinator.ts']],
  ['js/generated/audio-output.js', ['src/adapters/browser/audio-output.ts']],
  ['js/generated/audio-schedule-planner.js', ['src/domain/audio/audio-schedule-planner.ts']],
  ['js/generated/beat-stats.js', ['src/domain/beats/beat-stats.ts']],
  ['js/generated/beat-judge.js', ['src/domain/beats/beat-judge.ts']],
  ['js/generated/camera-motion-model.js', ['src/domain/scene/camera-motion-model.ts']],
  ['js/generated/clock-motion-model.js', ['src/domain/clock/clock-motion-model.ts']],
  ['js/generated/clock-view.js', ['src/adapters/browser/clock-view.ts']],
  ['js/generated/clock-model.js', ['src/domain/clock/clock-model.ts']],
  ['js/generated/countdown-engine.js', ['src/domain/countdown/countdown-engine.ts']],
  ['js/generated/day-progress-model.js', ['src/domain/scene/day-progress-model.ts']],
  ['js/generated/daypart-theme.js', ['src/domain/audio/daypart-theme.ts']],
  ['js/generated/electron-bridge.js', ['src/adapters/electron/electron-bridge.ts']],
  ['js/generated/hour-crossing.js', ['src/domain/clock/hour-crossing.ts']],
  ['js/generated/moon-phase.js', ['src/domain/scene/moon-phase.ts']],
  ['electron/preload.js', ['src/adapters/electron/electron-bridge.ts', 'src/adapters/electron/preload-entry.ts']],
  ['js/generated/runtime-loop.js', ['src/adapters/browser/runtime-loop.ts']],
  ['js/generated/time-sync-policy.js', ['src/domain/clock/time-sync-policy.ts']],
  ['js/generated/time-sync-sampler.js', ['src/adapters/browser/time-sync-sampler.ts']],
  ['js/generated/action-timeline.js', ['src/domain/timeline/action-timeline.ts']],
  ['js/generated/window-bounds-model.js', ['src/domain/window/window-bounds-model.ts']],
  ['js/generated/window-command-model.js', ['src/domain/window/window-command-model.ts']],
  ['js/generated/window-controller.js', ['src/application/window/window-controller.ts']],
];

let failed = 0;
for (const [out, files] of MODULES) {
  const r = spawnSync(process.execPath, [TSC, ...files, ...FLAGS, '--outFile', path.join(ROOT, out)], { cwd: ROOT, stdio: 'pipe' });
  if (r.status !== 0) {
    failed++;
    console.error('[FAIL] ' + out + '\n' + r.stdout.toString() + r.stderr.toString());
  }
}
if (failed) {
  console.error(failed + '/' + MODULES.length + ' module(s) failed');
  process.exit(1);
}
console.log('build-domain: ' + MODULES.length + ' artifacts OK');
