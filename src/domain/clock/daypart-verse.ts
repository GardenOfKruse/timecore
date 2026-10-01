namespace TimeCoreDomain {
  export interface DaypartVerse {
    daypart: 'night' | 'morning' | 'day' | 'evening';
    text: string;    // 公有领域古诗一句
    source: string;  // 出处
  }

  /** 晨昏四幕诗库（与 daypart-theme 同边界 5/11/17/23；夜/晨/昼/暮各 3 句，全公有领域）。 */
  export const DAYPART_VERSES: Readonly<Record<DaypartVerse['daypart'], readonly { text: string; source: string }[]>> = {
    night: [
      { text: '月落乌啼霜满天', source: '张继《枫桥夜泊》' },
      { text: '星垂平野阔', source: '杜甫《旅夜书怀》' },
      { text: '夜阑卧听风吹雨', source: '陆游《十一月四日风雨大作》' }
    ],
    morning: [
      { text: '日出江花红胜火', source: '白居易《忆江南》' },
      { text: '春眠不觉晓', source: '孟浩然《春晓》' },
      { text: '晨兴理荒秽', source: '陶渊明《归园田居》' }
    ],
    day: [
      { text: '接天莲叶无穷碧', source: '杨万里《晓出净慈寺送林子方》' },
      { text: '绿树阴浓夏日长', source: '高骈《山亭夏日》' },
      { text: '日长睡起无情思', source: '杨万里《闲居初夏午睡起》' }
    ],
    evening: [
      { text: '夕阳无限好', source: '李商隐《登乐游原》' },
      { text: '山气日夕佳', source: '陶渊明《饮酒》' },
      { text: '半江瑟瑟半江红', source: '白居易《暮江吟》' }
    ]
  };

  /** 晨昏四幕：5/11/17/23 边界（与 daypart-theme 一致）。 */
  export function daypartIndexOf(hour24: number): number {
    const h = ((Math.floor(hour24) % 24) + 24) % 24;
    if (h < 5) return 0;
    if (h < 11) return 1;
    if (h < 17) return 2;
    if (h < 23) return 3;
    return 0;
  }

  const PART_NAMES: readonly DaypartVerse['daypart'][] = ['night', 'morning', 'day', 'evening'];

  /**
   * 当前幕的诗句：同一天同一幕永远同一句（日期+幕 稳定伪随机），不会闪变。
   * now 为 epoch ms；非法输入回退当前时刻。
   */
  export function daypartVerse(now: number): DaypartVerse {
    if (!Number.isFinite(now)) now = Date.now();
    const d = new Date(now);
    const part = daypartIndexOf(d.getHours());
    const daypart = PART_NAMES[part];
    const pool = DAYPART_VERSES[daypart];
    const dayKey = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const pick = ((dayKey * 4 + part) % pool.length + pool.length) % pool.length;
    return { daypart, text: pool[pick].text, source: pool[pick].source };
  }
}
(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
