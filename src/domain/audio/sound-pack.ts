namespace TimeCoreDomain {
  export type SoundWave = 'sine' | 'square' | 'triangle' | 'sawtooth';

  // 音色参数：wave 振荡器类型；bright 频率倍率；decay 时长倍率；peak 音量倍率。
  // 默认包 classic 必须全为 1——保证未选择主题时行为与 v1.11 逐参数一致。
  export interface SoundTimbre {
    wave: SoundWave;
    bright: number;
    decay: number;
    peak: number;
  }

  export interface SoundPack {
    key: string;
    label: string;
    tick: SoundTimbre;   // 软节拍提示
    beep: SoundTimbre;   // 3/2/1 递升提示
    hit: SoundTimbre;    // 击拍命中音
    miss: SoundTimbre;   // 击拍 MISS 音
    fire: SoundTimbre;   // 到点琶音音色（音高音阶仍由昼夜主题决定，bright 不作用于音阶）
  }

  function timbre(wave: SoundWave, bright: number, decay: number, peak: number): SoundTimbre {
    return { wave, bright, decay, peak };
  }

  export const SOUND_PACKS: readonly SoundPack[] = [
    {
      key: 'classic', label: '硅晶',
      tick: timbre('square', 1, 1, 1),
      beep: timbre('triangle', 1, 1, 1),
      hit: timbre('sine', 1, 1, 1),
      miss: timbre('sawtooth', 1, 1, 1),
      fire: timbre('triangle', 1, 1, 1)
    },
    {
      key: 'bell', label: '钟琴',
      tick: timbre('sine', 1.2, 1.6, 0.9),
      beep: timbre('sine', 1, 1.5, 0.9),
      hit: timbre('sine', 1.1, 1.5, 0.9),
      miss: timbre('triangle', 0.8, 1.2, 0.9),
      fire: timbre('sine', 1, 1.4, 0.95)
    },
    {
      key: 'wood', label: '木质',
      tick: timbre('triangle', 0.5, 0.45, 1.1),
      beep: timbre('triangle', 0.6, 0.5, 1.1),
      hit: timbre('triangle', 0.7, 0.5, 1.1),
      miss: timbre('triangle', 0.5, 0.5, 1.1),
      fire: timbre('triangle', 1, 0.7, 1.1)
    },
    {
      key: 'pixel', label: '芯片',
      tick: timbre('square', 1, 0.6, 0.8),
      beep: timbre('square', 1, 0.6, 0.8),
      hit: timbre('square', 1, 0.6, 0.8),
      miss: timbre('sawtooth', 1, 0.6, 0.8),
      fire: timbre('square', 1, 0.6, 0.8)
    }
  ];

  const FALLBACK = SOUND_PACKS[0];

  // 按 key 取音效包；未知 key（损坏的 localStorage 等）回退默认包
  export function soundPack(key: unknown): SoundPack {
    const k = typeof key === 'string' ? key : '';
    return SOUND_PACKS.find(p => p.key === k) || FALLBACK;
  }
}
(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
