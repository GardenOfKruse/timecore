# TIMECORE 产品设计文档

> 悬浮式三维时间核心 · Windows 桌面时间装置
> 仓库：GardenOfKruse/timecore · 当前版本：v1.2.4 · 文档基准：2026-09-14
> 循环开发守则见 `docs/PROGRESS.md`（每次循环先读它 + git status，结束必须回写）

---

## 1. 产品定位

**一句话**：给桌面常驻的、毫秒级精确的、以「绝对时间节点」为核心的时间装置——不只是看时间，而是"对齐时间做事"（倒计时到点、击拍节奏、多机齐射）。

**目标用户**：需要精确到点触发的个人用户（抢购/秒表对齐/多机测试/直播计时/番茄对齐）。

**产品性格**：装置感（instrument）而非应用（app）。常驻置顶、透明悬浮、克制的辉光、暗色玻璃。

**红线（不可违背的语义）**：
- **绝对节点**：倒计时「5m」= 对齐到每个整 5 分时刻（09:05:00.000、09:10:00.000…），不是"5 分钟后"。所有调度（提示音、齐射、节点推进）都锚定绝对 epoch。
- **显示永不回跳**：校时偏移平滑限速（回退 ≤0.85× 真实流逝、正向 ≤8×），基于内部实测流逝。
- **到点必触发**：rAF 挂起/后台节流不影响——66ms 定时器 + 120ms 看门狗双驱动。

## 2. 功能规格

### 2.1 时钟
- 本地时区 HH:MM:SS + 3 位毫秒；21 个时区切换；网络校时（worldtimeapi/timeapi.io/taobao，中点采样，单源采信门槛 350ms），失败平滑回退本地；校时状态徽章。
- 网络校时为双保险缺失时降级链：synced → stale（保持偏移）→ failed → local。

### 2.2 倒计时（状态机见 js/countdown.js）
- **对齐模式**：startAligned(periodMs, cycles, infinite)，节点 = 本地零点起每 periodMs 边界；∞ 默认勾选。
- **定时模式**：今天（已过则明天）的 HH:MM:SS 时刻；快捷「整点」。
- **三阶段提示**：>10s 运行 → 10s WARMUP（外环预热）→ 5s SURGE（能量增强）→ 3s PULSE（强脉冲）→ 0 ZERO（释放）。
- **释放驻留**：HOLD_MS 1800ms；驻留期大数字停 00:00.000，小字预告「下一轮 X秒 · 触发 HH:MM:SS.mmm 开始」（fired 分支必须先于 armed 判断——armed 在驻留期仍为 true）。

### 2.3 击拍
- 空格 / 左键（星球）触发；PERFECT ≤60ms / GREAT ≤140 / GOOD ≤300 / MISS；combo、准确率、颜色分级。
- 自由节拍器（B 键）：整秒格对齐；无倒计时也独立发声，不受倒计时提示音开关影响；倒计时进行中让位给倒计时提示音；「倒计时全程节拍」开关默认开（tc.metrofull）——节拍器开启时倒计时全程每秒提示，软节拍窗口外由 scheduleCd 内补齐。
- 击拍音走 hit 分轨；提示音走 beat 分轨（提示音量滑杆控制）。

### 2.4 音频（js/audio.js，全合成无素材）
- **绝对节点调度**：音频时钟锚定映射 tFor(epoch)，每 30s 重锚（只影响未来计算，已排音频不漂移）。
- **批量预排**：页面 hidden 时一次性预排 softLead+3s 整窗的 tick/beep/fire（修"后台听不到最后 10 秒"）；另有 blob Worker 250ms 唤醒兜底（Worker 不受可见性节流）。
- **可撤销队列**：所有 osc/noise 登记 {src,t0,cat}；cd:stop/cd:advance → cancelPending() 撤销未响的 beat/cue（修停止后残留音）。
- **零点双响防护**：排 k=0 时必须登记 `fire:<target>` key，cd:zero 兜底以它判重。
- 分轨音量：beat/cue/hit 独立推子（tc.track）；主音量、静音（tc.vol/tc.mute）。

### 2.5 窗口形态（四档，同一窗口）
| 形态 | 尺寸 | 入口 |
|---|---|---|
| 正常 | 1180×760 | Ctrl+3 / C 循环 / 右键菜单 |
| 小窗 | 480×320 | Ctrl+2 / C 循环 |
| 仅时间 | 280×96 纯钟面 | Ctrl+1 / 标题栏 ◉ |
| 全屏 | 铺满 | F / 标题栏 |

- 布局密度随宽度自适应：body.mini(<450) / body.compact(<780)，手动拉伸也跟随。
- **位置记忆**：userData/tc-window.json；全屏期间与钟面形态期间**不覆盖**（避免重开是变形尺寸）。
- 旧版别名 mini/compact 保留在 PRESETS（cycle19 依赖），UI 不再暴露。

### 2.6 仅时间形态（钟面）——交互定稿 v1.2.3 / 动效 v1.2.5
- **显示**：只有 时:分:秒.毫秒 一行，字号 **12.6vw / 6.3vw**（随窗口拉伸等比缩放）；其余 UI 全部隐藏。
- **退出**：双击任意处（主出口） / 右键菜单「还原窗口」 / Ctrl+1 / Esc。退出还原进入前尺寸（clockPrev）。
- **移动/缩放**：按住面板拖动 = 手动增量拖窗；鼠标滚轮围绕窗口中心等比缩放（160–1180px 宽），>4px 位移标记 dragMoved 抑制双击误触。
- **交互提示**：不在时间内容上叠加按钮；双击面板退出，右键菜单管理窗口。
- **右键菜单**（原生 Menu.popup，webContents context-menu 触发）：还原窗口 / 分隔 / 三形态 / 分隔 / 全屏 / 置顶 / 分隔 / 关闭。
- **首次提示**：进入时显示 3.5s「双击退出 · 右键菜单 · 滚轮缩放」（tc.hint.clock 持久化，仅一次；任意入口进入都触发）。
- **形态状态同步**：主进程 pushState 推送 `win:state`（doSize/toggleFs/toggleTop 后即时发）→ 渲染端秒翻类名 + 800ms win:get 轮询兜底。
- **动效四件套**（v1.2.5，全部 GPU-only transform/opacity，不动逻辑循环）：
  1. **数字 tick**：时/分/秒拆独立 span（.d-pair，textContent 仍为 HH:MM:SS），变化的对做 240ms 上浮淡入（digitTick），冒号降为 .62 透明度衬托主体；
  2. **形态 morph**：主进程 tweenBounds 窗口缓动（easeOutCubic 170ms/16ms 步进，结尾一步落精确目标供 E2E 断言；拖动/全屏/关闭取消；滚轮连滚在逻辑目标上累乘重定向，尺寸序列与逐次到位一致）+ 钟面 clockIn 淡入放大 200ms + 退出时主面板 panelIn 淡入 180ms（display 翻转自动重放）；
  3. **滚轮丝滑缩放**：zoomClock 走同一 tween；
  4. **布防心动**：仅钟面形态由 `js/clock.js` 的单一 ClockMotion 控制器驱动真实 `.clock-breath` 与 `#clock-hms`；NORMAL 2.6s、WARMUP 1.8s、SURGE 1.1s、PULSE 0.62s，一轻一重后留白。边框透明度是主拍，数字只做 ≤0.7% 微缩放；阶段只换色/节奏，秒环保持稳定，不再叠加闪烁轨道。
- 毫秒显示不动画（60fps 直接刷文本，动画会糊）；隐藏页回落 66ms 定时器照常刷新。
- **秒环（v1.3.1）**：钟面边框即秒针——SVG rect pathLength=1000，彗尾 dasharray 60/940，每帧写 dashoffset，1.6px accent 色绕边框一周/秒；cd:zero 时钟面 zero-pulse 整窗呼吸 550ms。
- **缩放记忆（v1.3.2）**：滚轮缩放即时写 userData/tc-clock.json，再次进入钟面恢复上次宽度（首用 280，ratio 恒定，applyPreset 钳工作区）。
- **布防心动约束（v1.5.3）**：ZERO 只做一次 560ms 白色释放，不循环；停止、完成、退出钟面立即取消 WAAPI。`prefers-reduced-motion` 下取消循环位移，保留静态低幅度状态反馈；若浏览器不支持 WAAPI，退化为静态状态色，不影响倒计时逻辑。

### 2.7 首次启动体验
- **全新 profile 判定**：tc.welcomed 不存在且所有偏好键为空（判实际状态，非版本号）→ 显示欢迎卡：开启节拍器（顺带解锁 AudioContext）/ 配置 ADB / 直接进入；老用户升级不弹。
- 节拍器自启规则：老用户按 tc.freerun；新用户由欢迎卡选择（开启=on，直接进入=off）。
- **ADB 默认停用**；抽屉未启用时 .adb-gate 区整体置灰（pointer-events:none），四步引导卡（开启→装adb→连设备→启用动作）逐步点亮；未授权设备提示；"不用ADB"出口文案。

### 2.8 ADB 齐射（js/adb.js，仅 Windows）
- **到点音景（v1.3.1）**：S.fire 三层——sub 冲击（82→36Hz 下坠+二次谐波+低频砰）、五声琶音（C D E G A 上行，左右声像交替+镜像泛音+反声像幽灵回声）、高频钟簇慢衰减；全部走 cue 轨可撤销；master 挂 DynamicsCompressor 防多层叠加爆音。
- **时序链**：点击时刻 = 节点 − 提前量(默认 100ms) − 传输延迟(echo×3 中位, 60s 新鲜度)；预发射模式提前 1.8s 拉起 adb、设备端 sleep 对齐。
- **时间轴编排**：每个动作可设节点偏移 `T+N ms`（默认 0）；同一倒计时节点按各动作偏移依次触发，仍复用提前量、延迟校准、预发射与节点去重。
- **间隔补偿**（cfg.comp 默认开）：probe 实测 input 命令开销 TI（无参 usage 调用×3 中位 − echo RTT），生成脚本 sleep = gap − TI（下限 50ms，无 TI 不补偿）——「间隔」≈ 真实点击间隔。
- **发射去重**（双发 BUG 修复）：fireOne 闸门，键 = 动作id×设备serial×**倒计时节点**（不能用 fireAt——延迟重测会改它）；同节点重排不补发，新节点放行；cd:stop/done/停用 → haltAll 清记录。
- **扫描纪律**：无变化不 save()（save 触发重排）；n=1 脚本为裸 `input tap`（无循环无尾巴）。
- **设备列表**：USB/IP 徽章（serial 含":"即 IP）、每行垃圾桶移除（清 cfg.devices + 动作引用）、离线保留命名。
- **旧版 adb 治理**：1.0.x<41 判"过旧"（USB 可用、Android 11+ 无线 TLS 握手失败）；自家 platform-tools 优先于 PATH；状态行三态短语+tooltip；一键下载/升级（升级后清 cfg.path 解钉）。
- 演练模式（dry）只记日志；测试钩子 `TC.ADB._dev(serial, TI)` 注入模拟设备（test 标记免疫扫描清理）。

### 2.9 版本与更新
- 标题栏 `TIMECORE v*` 角标（app.getVersion 经 win:get 下发，浏览器模式显示 web）；点击弹关于浮层：检查更新（GitHub latest 对比 semver）/ Releases 直达（主进程 open 仅白名单本仓库 URL）；设置抽屉版本同源动态。

## 3. 视觉系统

- **辉光配额**（v1.1.0 定稿）：常驻辉光唯一归属 = 倒计时数字（随阶段 青→琥珀→橙→红→释放白 变色，与 3D 能量环同体系）；瞬时辉光仅 judge 弹出与到点白闪；其余一律扁平。禁止新增装饰性彩色辉光。
  - **钟面唯一例外（v1.5.3）**：仅时间形态允许一处「布防心动」——`.clock-breath` 只调制 1px 边框透明度，布防时才按阶段着色；无 box-shadow、无粒子、无额外装饰性辉光。
- **钟面布防动效例外（v1.5.3）**：只在用户已布防时允许阶段色边框和低幅度心动透明度变化；不新增 box-shadow、粒子或 3D 渲染，不影响正常窗口。
- 阶段色：WARMUP #ffb347 / SURGE #ff8c3b / PULSE #ff4d5e / ZERO #fff；accent #39d7ff；面板 rgba(9,15,27,.46) 玻璃 + backdrop blur。
- 3D 中心：程序化星球（值噪声大陆+云层+大气 BackSide shader），节拍弹跳，粒子 30fps 限频（dt 累积器），震屏为 camera 位移。
- **真实太阳（v1.3.1）**：key 光方位角按显示时区的真实时刻绕星球转（12:00 正面 / 00:00 背面），高度角艺术定值 2.6；强度 = 昼夜因子 day × 阶段因子；晨昏带色温偏暖；夜半球由反向冷色月光补光。?sunhour=N 固定时刻（测试/截图），TC.Scene.debugSun() 探针。
- **卫星尾迹（v1.4.0）**：两颗卫星按解析角速度回推 22 个渐隐加色点（约 1s 行程），随 pSpeed 变速自然伸缩；低画质隐藏。
- **到点流星雨（v1.4.1）**：cd:zero 时星野 uBoost 瞬时 2.2 后指数回落（~2s），三颗流星 120/320/520ms 错峰齐落——与到点音景合成完整仪式；属瞬时辉光配额。
- **星空生动化（v1.3.3）**：远景星野 320 颗（自定义点 shader，aPhase 错相慢闪烁，半径 22–44 球壳，低画质隐藏）+ 流星（30–90s 随机一颗，拉伸光斑 0.9s 划过，TC.Scene.meteor() 强制触发）。
- **开场仪式（v1.3.1）**：主进程 show:false → ready-to-show 再显示；body bootIn 320ms；欢迎卡 wlIn；核心 intensity 从 0 充能到 IDLE（约 1s）。
- 缓存：所有 css/js 引用带 `?v=N`，每次改动递增（当前 v150）。

## 4. 架构

- **零框架**：vanilla JS 模块 IIFE + TC 命名空间（core/time-sync/clock/countdown/beats/audio/scene3d/ui/adb/main），three.js 仅 3D。
- **双驱动循环**：rAF 只渲染 3D；逻辑与 DOM 由 66ms setInterval + 120ms 看门狗驱动（后台/隐藏不冻结）。
- **钟面零渲染（v1.5.0）**：body.clockmode 时 render() 整帧早退（display:none 的 canvas 上 WebGL 仍跑全管线，实测 42 calls/1.7 万 tris/帧）——悬浮钟形态 GPU 近零；skipStreak/lastFrame 暴露于 TC.Scene.debugSun()。
- **IPC**（electron/main.js 'win' 通道）：top/opacity/minimize/fullscreen/size/clock形态/clock-zoom/move-begin/move-end/open(GitHub 白名单)/close；win:get 返回 {top,fs,ver,clock}；主进程 `win:state` 推送（形态/全屏/置顶变化即时下发）；adb:detect|exec|download。
- **窗口命令函数化**：doSize/toggleFs/toggleTop 供 IPC 与右键菜单共用，统一走 tweenBounds 窗口缓动并 pushState。
- 悬浮钟曾是独立 BrowserWindow（v1.2.1 前），v1.2.2 起按用户要求改为同窗口形态，?overlay=1 分支已删。

## 5. 测试基建（tests/）

- CDP 直连 Electron 渲染进程（`--remote-debugging-port=92XX`），`TC_TMP_PROFILE` 隔离 userData（**绝不碰真实配置**）。
- cycle19 首启动/回归 23 项；cycle21 双发回归 9；cycle24 旧 adb 升级链路 8（显式检测 E:\Tools\adb 1.0.36 构造场景）；cycle26 设备标注移除 6；cycle27 连点优化 7；cycle30 形态/悬浮钟/音频批量 14。
- 发版前全量：`for t in 19 21 24 26 27 30; do node tests/cycle$t.mjs; done`
- **已知坑**：
  - 真实鼠标必须 `Input.dispatchMouseEvent`（合成 dispatchEvent 绕过输入管线——拖拽区 BUG 就是这么漏测的）
  - Runtime.evaluate 需要 `awaitPromise: true`（否则 Promise 序列化为 {}）
  - 退出必须走 `electronAPI.send('close')`；`child.kill()` 硬终止丢 leveldb
  - 被杀任务会留僵尸 electron 占调试端口 → 换端口解锁
  - 测试会改 docs/ 下截图（welcome.png），提交前 checkout 还原

## 6. 构建与发布

- **本机构建**：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npx electron-builder --win --publish never -c.directories.output=distN`
  - winCodeSign 缓存若报符号链接权限：手动 `7za x -snld <hash>.7z -o winCodeSign-2.6.0`，darwin dylib 占位文件用真实 dylib 拷贝补全
  - dist*/win-unpacked/app.asar 常被 Defender 瞬时锁死 → **轮换输出目录**（dist4~dist10 已用，均 gitignore）
- **发版**：改 package.json version → commit push → `git tag vX.Y.Z && git push origin vX.Y.Z` → CI（GitHub Actions release.yml）自动创建唯一草稿 Release → CI 成功后查询该 tag 对应的 Release，使用 UTF-8 JSON 文件 `--data-binary` **PATCH 现有 draft 的 `draft:false`**（禁止额外 POST 创建同 tag Release）→ 验证 `releases/latest`。若误生成重复 Release，先按 Release ID 删除错误项，再删除并重推同名 tag 重新触发旧流程。gh CLI 不存在，用 `git credential fill` 取 token（零回显）。
- 提交身份：仓库级 GardenOfKruse + noreply 邮箱（**勿用全局 git 配置**，那是 Gitee 身份 CN-Yi）。
- **git add -A 红线**：dist*/ 必须在 .gitignore（曾两次险些提交 82MB 产物，一次已进历史靠重写挽回）。

## 7. 待办池（未承诺）

- 时间轴编排：一个节点按 T+0/T+2s… 序列发多个动作（ADB 用户提过）
- 每日击拍统计面板
- 局域网伴侣页（手机看倒计时）
- 音效主题包（绑定 3D 主题）
