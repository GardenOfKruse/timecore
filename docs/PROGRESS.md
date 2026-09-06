# TimeCore 进度文档（循环续跑用）

> 项目：悬浮式三维时间核心（time-core）
> 规则：每次循环开始先读本文件 + `git status`；循环结束必须更新本文件（已完成 / 未完成 / 下一步命令）；不得覆盖 time-core/ 之外的任何文件，不得回滚已有修改。

## 任务指令摘录（循环提示词要点）

- 新项目：高级、精密、可长期运行的桌面时间装置，主题「悬浮式三维时间核心」，非普通网页时钟。
- 时钟：本地时区当前时间，可切换时区，精确到毫秒 3 位数；优先网络校时计算偏移，失败平滑回退本地时间。
- 倒计时：三维能量环呈现；多周期、按绝对时间节点计算；三阶段提示——10 秒外环预热、5 秒能量增强、3 秒强节奏脉冲；到点瞬间清晰反馈。
- 击拍：空格 / 鼠标左键触发，按偏差判定 PERFECT / GREAT / GOOD / MISS，有连击数与颜色反馈。
- 界面：三维悬浮核心（玻璃环体、金属轨道、粒子、体积光），避免堆砌与文字重叠。
- 窗口：半透明、全屏、始终置顶。
- 验证：浏览器实测阶段切换、击拍判定、小窗口布局、网络失败回退；可加音效。
- 进度写入本文件，便于续跑。

## 状态

- 循环 #1：✅ 已完成（2026-09-06）
- 循环 #2：✅ 已完成（2026-09-06）——应用户纠正，倒计时改为「对齐绝对时间节点」语义并修复实测发现的问题
- 循环 #3：✅ 已完成（2026-09-06）——Electron 实用反馈三连修：标题栏遮挡、全屏无法退出、功能键重复
- 循环 #4：✅ 已完成（2026-09-06）——新玩法「ADB 齐射」：倒计时到点向多台安卓设备齐射用户自定义脚本（仅 Windows 桌面端）
- 循环 #5：✅ 已完成（2026-09-06）——可用性改造：模板化动作、截图选点、abs 简化、名字持久化修复、设备自动刷新
- 循环 #6：✅ 已完成（2026-09-06）——添加操作改为单按钮（类型下拉默认连点）；确认 screencap `-s` 修复（双设备实测 1.6MB PNG）
- 循环 #7：✅ 已完成（2026-09-06）——ADB 总开关（可选功能）：停用 = 不扫描/不布防/不发射/不拉起 adb，配置保留；真机验证停用布防 0 路、重启恢复 2 台设备
- 循环 #8：✅ 已完成（2026-09-06）——BUG1 全屏退不出（根因实测：透明窗口 isFullScreen 误报）；BUG2 选点不精准（大图选点 + 放大镜）
- 循环 #9：✅ 已完成（2026-09-06）——选点准星修复：大图上选定点的红色准星此前按舞台百分比定位（图片居中后错位到图外），改为包一层 sp-frame 相对图片定位；悬停十字导线跟随；点击脉冲动画；frame 尺寸约束修正（图片不再按原始分辨率溢出）。E2E：crossOnImage ✓ crossNearClick（误差<3px）✓
- 循环 #10：✅ 已完成（2026-09-06）——用户实测三连修：①点击无反应（根因：选点浮层是 #app pointer-events:none 的子元素且未重设 auto，整个浮层点击穿透到 3D 画布）→ 浮层补 pointer-events:auto；②图片拉伸变形（frame 嵌套后 max-height:100% 相对自动高度父级失效）→ JS 按 shotW/H 显式计算等比尺寸；③原生图片拖拽吞 click → dragstart preventDefault。E2E：受信点击坐标精确（719,480）✓ 导线/准星可见 ✓ 等比 noDistort ✓
- 循环 #11：✅ 已完成（2026-09-06）——「时序测试」卡确认无必要（E2E 遗留物），getprop 按用户建议内置进设备扫描：扫描时自动读 marketname/model 给设备起可读名（真机验证：4ca694e/70a18048 → "Redmi K60"）；遗留卡自动清理；新增「恢复示例」按钮；默认示例改为单条连点（X864 Y2280 ×5 @400ms，不启用）。修 bug：nameJobs 存函数未执行（Promise.all 不调用函数）→ map(fn => fn())
- 循环 #12：✅ 已完成（2026-09-06）——12 条反馈落地 7 项：①添加动作默认启用 ②动作参数垂直字段布局 ③抽屉加宽 420px + 全局细滚动条 ④∞ 默认勾选 ⑥倒计时面板输入持久化(tc.cd) ⑦移除设置抽屉重复的小窗复选框（顶栏按钮为准）⑧「模拟失联」更名「演示：校时失联回退」；自动扫描静默化（无变化不刷日志）；安装 threejs-skills×10 到 ~/.agents/skills。E2E 全绿。3D 中心物方案/音效方向/新点子 → 已给提案待用户选择
- 循环 #13：✅ 已完成（2026-09-06）——6 条反馈落地：①扫描全量检测流水线（命名→分辨率→延迟，延迟 60s 新鲜度阈值）+ 时序链公式写进抽屉（点击时刻 = 节点−提前量−传输延迟）②删除按钮改垃圾桶 SVG（悬停变红）③缩略图等比限高 108×170 object-fit:contain + 控件顶对齐（布局不再被撑破）④软节拍起始秒可设（3~60s，默认 10）⑤节拍器开机自启（持久化，默认开）⑥受信鼠标移动现可触发放大镜（此前布局错位致命中失败）。E2E 全绿。5/9/12 提案待用户选择
- 循环 #14：✅ 已完成（2026-09-06）——ADB 配置即时生效：任何配置变更（启停/提前量/坐标/次数/间隔/设备勾选/精准模式等）经 save() 统一钩子触发去抖 300ms 重排布防，取消未发射定时器并按最新配置重排；已过节点跳过不补发；执行中脚本进程不动；扫描发现设备变化同样触发重排。E2E：启用 2 路 → 停用 0 路 → 再启用 2 路 ✓。图标生成脚本完成（build/icon.ico）。开源发布规划按用户要求延后
- 循环 #15：✅ 已完成（2026-09-06）——用户全权委托推荐方案：①中心 3D 换**程序化星球**（值噪声大陆/深海/极地纹理 + 独立云层 + BackSide 大气辉光 shader + 节拍弹跳，玻璃环体与旧内核移除，金属轨道变为卫星轨道）②**adb 一键下载**（无 adb 环境从 dl.google.com 拉取 platform-tools 自动解压到 userData，检测候选含该路径）③状态色系统（面板边框随倒计时阶段变色）④到点反馈三档（低/中/高：闪光/冲击波/粒子/震屏强度分档）⑤分轨音量（提示/到点/击拍三条独立推子，tc.track 持久化）⑥README 开源化（下载安装/ADB 准备/发布流程/License）+ .gitignore dist。全量回归全绿（全屏还原/等比/选点/持久化/重排）+ 星球视觉截图 docs/planet.png
- 循环 #16：✅ 已完成（2026-09-06）——**开源发布上线**：time-core 独立 git 仓库（main 分支）→ API 建仓 GardenOfKruse/timecore（本地 GCM 凭证，token 零回显）→ 推送代码 → tag v1.0.0 → GitHub Actions 自动构建成功 → Release v1.0.0 已发布（TIMECORE-Setup-1.0.0.exe 78MB + Portable 78MB + latest.yml/blockmap）。发布流水线后续发版只需：改 version → tag → push。
- 循环 #21：✅ 已完成（2026-09-06）——用户批准辉光配额方向并报「设 1 次实点 2 次」BUG。**双发根因**：齐射重排 clearTimers 只能撤未触发的定时器，已拉起的 adb 进程撤不回；抽屉轮询扫描（5s）每次 save()→重排，且延迟重测改变 fireAt 绕过 fireAt 键去重 → 同路径双发。**修复**：①发射闸门 fireOne（键=动作×设备×倒计时节点，与 L 无关；同节点重排不补发，新节点自动放行；cd:stop/done/停用清记录）②扫描无变化不 save（轮询不再触发重排）③n=1 脚本去掉循环与尾巴 sleep（单发裸 input tap）。测试基建：_dev() 注入模拟设备钩子（test 标记免疫扫描清理）+ cycle21.mjs 双发回归 9/9（全程演练模式绝不碰真机）；诊断过程抓到「新设备窗口内上线=合法新路径」与「布防日志含（演练）污染计数」两个干扰项并隔离。**辉光配额落地**（impeccable audit 驱动）：常驻辉光唯一归属=倒计时数字（随阶段青→琥珀→橙→红→白变色），瞬时辉光保留 judge/zero 两处，其余 8 处（状态点/标题灯/combo/按钮/欢迎logo/准星/XY读数）全扁平；三技能（impeccable/gpt-taste/design-md）已装 ~/.agents/skills。附测：到点瞬间主线程响应探测（zeroprobe）MAX_RTT 仅 390ms（首样本），ZERO 边界无卡顿——此前截图挂起是 CDP 通道假象非产品问题。回归：cycle21 9/9 + cycle19 23/23。辉光对比图 docs/glow-preview/compare-*.png（×5）
- 循环 #20（评估轮）：✅ 已完成（2026-09-06）——应用户要求安装三个设计技能到 ~/.agents/skills：impeccable（v4.2.1，含确定性 CLI 引擎，doctor/detect 本机验证可用）、gpt-taste（taste-skill 合集中仅装 GPT 变体，营销页风格宪法）、design-md（Google DESIGN.md 令牌工具链，纯 Python 离线）。用 impeccable detect 实测 TIMECORE：7 项反模式（6×dark-glow 彩色辉光滥用=「AI 味」主因，1×潜在 broken-image=sp-img 初始无 src）+1 建议（em-dash 密度）。结论：TIMECORE 产品 UI 精修用 impeccable（主力）；design-md 做「从项目反推 DESIGN.md」固化视觉令牌防漂移（配套）；gpt-taste 不用于产品（Tailwind/GSAP 营销页物种），留给将来宣传页。已提案循环#21 方向「辉光配额+层级精修」，待用户选择
- 循环 #19：✅ 已完成（2026-09-06）——首体验版本 v1.1：①窗口尺寸三预设（迷你380×300/紧凑660×460/标准1180×760，C键或Ctrl+1/2/3循环，保持中心+钳制工作区，全屏中先退出）+ 位置尺寸记忆（tc-window.json，全屏期间不覆盖）+ 密度随宽度自适应（body.mini/compact，手动拖拽也跟随）②ADB 默认停用（新 profile；老用户存值不受影响）+ 抽屉未启用整体置灰门槛（.adb-gate）+ 四步引导卡（开启→装adb→连设备→启用动作，含未授权提示与"不用ADB"出口）③首启欢迎卡（仅全新 profile：tc.welcomed 判定实际偏好键而非版本号；「开启节拍器」按钮顺带完成 AudioContext 解锁手势，修复"静音节拍器"准bug；静默进入则写 tc.freerun=0）④开始/停止按钮状态化（运行中→「重新布防」，空闲时停止禁用）⑤标题栏状态灯三颗（校时/ADB/音频）⑥第三方库评估：结论为零依赖不引入（自研视觉语言+组件覆盖成本高于手写+透明窗口假设风险）。E2E 23/23（双阶段：全新动线+重启记忆），证据 docs/welcome.png、size-mini.png、size-compact.png、adb-guide.png
- 循环 #18：✅ 已完成（2026-09-06）——应用图标定稿（Codex 星球图 1254² → nativeImage best 缩放 256² → ICO）+ BrowserWindow 窗口图标（npm start 即见）→ **Release v1.0.1 已发布**（Setup 78MB，含星球图标与全部体验修复）。用户确认"就用 Codex 生成的这个"
- 循环 #17：✅ 已完成（2026-09-06）——①贡献者身份修正：提交原用全局 git 配置（Gitee 身份 CN-Yi），改为仓库级 GardenOfKruse + GitHub noreply 邮箱（128662648+GardenOfKruse@users.noreply.github.com），orphan 重写单提交历史强推，GitHub 已正确归属 ②打包产物收敛为单个 Windows 安装包（移除 Portable target）③electron-builder 默认创建草稿 Release → PATCH draft:false 正式发布（Release Notes 已写）。E2E：构建 success ✓ 提交归属 GardenOfKruse ✓ Release latest draft:false ✓ 仅 Setup 产物 ✓

## 循环 #19

用户三点需求：窗口尺寸切换与适配、首启 ADB 引导、开始按钮常亮疑问。分析先行（评估+盲点清单已用户确认），实现四层：electron 主进程 PRESETS/clampToWork/saveBounds（resize/move 去抖、close 兜底、fsState 期间跳过）；ui.js 尺寸循环+密度自适应+欢迎卡+syncRunState+状态灯；adb.js DEF.enabled=false+renderGuide 四步链+dataset.on 门槛+bus 外发 adb:state。测试教训：Windows 下 child.kill() 是硬终止，leveldb 未落盘导致阶段B全挂——测试必须先走 electronAPI.send('close') 优雅退出再等进程退出。截图脚本用新 profile 时欢迎卡会挡画面（另修：wl-card 加 max-height+overflow，compact/mini 档减化内容）。

## 循环 #17

用户确认贡献者信息有误（Gitee 身份）+ 产物只要一个安装包。标准开源收尾：仓库级 git 身份（noreply 邮箱保证 GitHub 归属正确，与隐私设置兼容）、orphan 分支重写单提交历史、强推 main、删除旧草稿 Release 与 tag 重打。经验：electron-builder 每次 tag 都会新建 DRAFT release，需 PATCH draft:false 才对外可见（后续发版记得这步，或 UI 上点 Publish）。

- 循环 #15：✅ 已完成（2026-09-06）——用户全权委托推荐方案：①中心 3D 换**程序化星球**（值噪声大陆/深海/极地纹理 + 独立云层 + BackSide 大气辉光 shader + 节拍弹跳，玻璃环体与旧内核移除，金属轨道变为卫星轨道）②**adb 一键下载**（无 adb 环境从 dl.google.com 拉取 platform-tools 自动解压到 userData，检测候选含该路径）③状态色系统（面板边框随倒计时阶段变色）④到点反馈三档（低/中/高：闪光/冲击波/粒子/震屏强度分档）⑤分轨音量（提示/到点/击拍三条独立推子，tc.track 持久化）⑥README 开源化（下载安装/ADB 准备/发布流程/License）+ .gitignore dist。全量回归全绿（全屏还原/等比/选点/持久化/重排）+ 星球视觉截图 docs/planet.png
- 循环 #16：✅ 已完成（2026-09-06）——**开源发布上线**：time-core 独立 git 仓库（main 分支）→ API 建仓 GardenOfKruse/timecore（本地 GCM 凭证，token 零回显）→ 推送代码 → tag v1.0.0 → GitHub Actions 自动构建成功 → **Release v1.0.0 已发布**（TIMECORE-Setup-1.0.0.exe 78MB + Portable 78MB + latest.yml/blockmap）。发布流水线后续发版只需：改 version → tag → push。

## 循环 #16

开源发布踩坑记录：Git Bash 内联 node -e 的模板插值会被 shell 展开（诊断脚本必须走文件）；curl（Windows 原生）读不了 /tmp 路径（用相对路径）；JSON 载荷含中文必须 UTF-8 文件 + --data-binary；创建仓库用 POST /user/repos（本地 GCM 凭证经 git credential fill 提取，40 长度 token，全程零回显）。

## 循环 #15

用户委托全部推荐方案推进 + 追问「用户电脑上 adb 怎么解决」→ 方案：应用内一键下载官方 platform-tools（tar 解压 + PowerShell 兜底），不打包进安装包（体积/许可更干净）。3D 选定方案 B 星球（程序化纹理零版权问题、与轨道卫星主题契合）。threejs-skills 技能集已装（本会话未强依赖）。
开源发布待办（用户侧）：建仓库 GardenOfKruse/timecore → push → 打 tag v1.0.0 → Actions 自动出 Release。package.json 的 repository 字段如仓库名不同需调整。

## 循环 #14

用户要求 ADB 配置修改后立即生效（无需停止再重启倒计时），并建议把刷新机制与设备检测合并。设计取舍：采用「save() 统一钩子 + 去抖 300ms 重排」事件驱动（改完 300ms 内生效），比挂在 5 秒轮询上更精准；设备检测的签名变化也触发重排（新插入设备可中途加入齐射）。arm() 增加「已过节点不补发」守卫（重排发生在 ZERO 驻留期时不重复发射）。测试教训：驱动直接替换 cfg.actions 后 DOM 卡片与配置对象脱钩，测试必须走真实 UI 路径。
开源发布：package.json build 配置（electron-builder NSIS+Portable）、.github/workflows/release.yml（tag 推送自动构建发布）、LICENSE(MIT)、scripts/make-icon.mjs → build/icon.ico 已就绪；README 下载/ADB 章节与发布清单待与用户确认仓库名后一起做。

## 循环 #13

时序链模型（对用户说明用）：真实鼠标点击到点 = 节点 − 提前量(用户设,默认300ms) − 传输延迟(自动校准,~110ms)；预发射把抖动吸收进设备端 sleep。扫描流水线顺序：devices -l → getprop 命名 → wm size → echo×3 延迟（60s 新鲜度）。


## 循环 #11

用户问「时序测试脚本重要吗，能否内置到扫描」→ 回答：不重要（测试遗留），其"连通性验证"价值已由扫描本身 + 「校」延迟按钮覆盖；getprop 的合理归宿是扫描时自动取市场名命名设备。迁移过滤：script 匹配 getprop ro.product.model 的旧卡自动清除；「恢复示例」一键回到默认单条连点示例（需确认弹窗）。

## 循环 #10

用户报告：大图点击无反应 + 图片拉伸变形。诊断（elementFromPoint）发现点击全部穿透落在 3D 画布上（顺手触发了击拍判定）。三个修复 + 一个测试基建教训（诊断脚本走文件，避免 bash 模板插值转义问题）。
## 循环 #8

**BUG1 全屏退不出**（用户报告，实测定位）
- 根因：Electron Windows 透明无边框窗口上 `setFullScreen(true)` 生效但 `isFullScreen()` 恒为 false → 切换逻辑永远算出「进入」
- 实测数据：进入后窗口 1920×1080 但 fs=false；再次点击 = 再次进入
- 修复：主进程显式 `fsState` 取反（不信任 isFullScreen）+ `setBounds` 手动铺满/恢复原尺寸兜底 + enter/leave-full-screen 事件回写 + 渲染端 Esc 先退全屏
- E2E 回归：1180×760 → 1920×1080(fs=true) → 1180×760(fs=false, restored:true) ✓

**BUG2 选点不精准**（方案 A：大图选点 + 放大镜）
- `#shot-picker` 全屏浮层：设备截图占屏大图、悬停 ×3 放大镜（canvas，关闭平滑）、红色准星、坐标实时大字读数、重拍/确认/Esc/点击遮罩关闭
- 卡片内缩略图固定 132px 仅展示+点击进大图 → 布局不再被撑破
- E2E：浮层可见 ✓、合成点击坐标误差 1px（777,576 vs 期望 778,576）✓、放大镜悬停显示 ✓、Input.dispatchMouseEvent 真实鼠标路径截图 ✓

## 循环 #7

- 抽屉顶部新增「启用 ADB 齐射」总开关（cfg.enabled，默认开、可关）
- 停用态：arm() 直接返回、自动刷新停止、启动不拉起 adb、顶栏按钮半透明；配置与命名保留
- E2E：停用后 arm pending=0 ✓；重新启用 detect+scan 恢复 2 台设备 ✓

## 循环 #6

- 「＋ 添加操作」单按钮 + 类型下拉（连点/亮屏连点/高级脚本），默认连点
- E2E 复核：双设备 screencap 1.6MB PNG + pickXY 540,1200 ✓；改名跨重启 ✓；添加流程（默认 tap / 切 wake）✓
- 用户侧报错 more than one device = 旧实例未重启（修复已在 v109），重启即愈

## 循环 #5：可用性改造（用户反馈三连）

1. **模板化动作**：动作 = 连点（位置/次数/间隔）| 亮屏连点（WAKEUP+上滑解锁+连点，需无密码锁屏）| 高级脚本（原 textarea 折叠保留）；「添加」变为 ＋连点/＋亮屏/＋脚本 三键；首次运行预置两个模板动作（不启用）；旧数据自动迁移为脚本型
2. **截图选点**：动作卡「📸 截屏选点」→ `adb -s X exec-out screencap -p`（二进制 base64 通道）→ 截图内嵌卡片，**点击截图即选点**（十字标记 + 坐标回填）；多设备分辨率不同按比例缩放（记录标定设备 shotW/H）；实测 1.3MB PNG 全链路通
3. **abs 简化**：datetime-local → 「时刻输入 + 定时（今天/明天下一个该时刻）+ 整点快捷」
4. **名字持久化修复**：save() 原来从在线设备表整体重建 → 改为按序列号合并；离线设备保留灰色行可提前命名。已验证改名跨应用重启保留
5. **设备自动刷新**：抽屉打开或已布防时每 5s 自动扫描；签名比对避免重建丢焦点；动作卡设备 chips 同步更新
6. **测试卫生**：TC_TMP_PROFILE 环境变量隔离 userData，E2E 驱动不再污染真实配置（此前清除 localStorage 抹掉了用户命名——已向用户说明）

**真机 E2E（双设备 4ca694e + 70a18048）**：扫描/命名/延迟 111~136ms ✓、截图选点 1.3MB PNG ✓、模板演练布防双路独立 sleep ✓、getprop 引擎执行 ✓、改名跨重启 ✓。修 bug：screencap 漏 `-s serial`（多设备报错）、空串坐标绕过默认中心点。
## 循环 #4：ADB 齐射（设计 + 真机 E2E）

**时序模型（三层补偿）**
1. 全局提前量（默认 300ms，用户估算「注入生效→应用响应」的不可测量延迟）
2. 每设备传输延迟校准：3 次 `echo` 往返取中位（实测 ~110ms），发射时自动扣除
3. 预发射（精准模式）：节点前 ~1.8s 把 `sleep X; <脚本>` 发到设备，由**设备端时钟**对齐执行——传输抖动被 sleep 窗口吸收，多设备相对同步显著优于 PC 侧 setTimeout 齐 spawn

**真机 E2E（tests/adb-e2e.mjs，CDP 驱动 Electron 渲染进程）**
- adb 自动检测（PATH → E:\Tools\adb\adb.exe，1.0.36）
- 双设备扫描（4ca694e + 70a18048，23013RK75C×2）：自动命名/尺寸 1080×2400/延迟 111~112ms
- 演练布防：双路独立调度，sleep 各自计算（1.739s / 1.737s）
- 引擎真实执行 getprop：106ms / 126ms 完成
- 时序精度（设备端 date 回报 vs PC 节点，扣除 rtt/2 校准）：**偏差 +41ms / +45ms**（系统分量可被全局提前量吸收；多设备相对偏差预期更小）
- 截图 docs/adb-e2e.png：双设备抽屉 + 第5/∞轮强脉冲运行中

**实现要点**
- electron/main.js：`adb:detect`（PATH/SDK 默认路径/where 逐候选试 `adb version`）与 `adb:exec`（spawn 直传参数数组，windowsHide，90s 超时）
- preload：`electronAPI.adb(cmd)` 白名单（detect/exec）
- js/adb.js：设备管理（扫描/命名/启停/无线 connect/延迟校准/中心点测试）、动作卡（脚本模板 + {serial}{W}{H}{X}{Y} 代入 + 每动作提前量/设备勾选）、节点调度（cd:start/cd:advance 取绝对节点 arm；cd:stop/done 清计时器）、演练模式、发射日志
- 修复：`adb devices -l` 分隔是空格不是 \t → 正则 `^(\S+)\s+(device|offline|unauthorized)`
- 安全默认：示例动作默认不启用；演练模式；到点 toast + 日志

## 循环 #3 修复记录（用户实用反馈）

1. **标题栏遮挡工具栏**：自定义标题栏(高30px)压在 top:18px 的面板上；且小窗模式 `body.compact top:12px` 级联在后覆盖了 electron 规则 → electron 面板下移规则移至文件末尾（`top:40px`），toast 同步下移；已用「electron+compact 叠加」场景复验矩形不相交
2. **全屏点开后无法缩回**：工具栏 ⛶ 走 HTML5 Fullscreen API，在无边框透明窗口上不可靠 → Electron 下改路由到原生 `win.setFullScreen` 切换（toggle），F 键与按钮统一；浏览器模式保留 HTML API 并监听 fullscreenchange 同步高亮
3. **功能键重复**（用户截图指出）：置顶/全屏在标题栏与工具栏各出现一次 → 窗口控制统一收进标题栏（置顶/—/全屏/✕，自适应宽度不再折行，✕ 红色悬停），删除工具栏「置顶」，Electron 下隐藏工具栏「全屏」（浏览器模式保留）；标题栏初始状态从主进程同步（置顶/全屏高亮）

## 部署问答备忘（2026-09-06）

- Android：PWA（manifest+SW，最省）或 Capacitor 出 APK；置顶/透明无对应物，等价形态=全屏+WakeLock 常亮
- Docker：nginx:alpine 静态托管做「分发」，访客浏览器运行；不建议容器内跑 Chromium（WebGL 软渲染）

## 已完成

- [x] 检查工作区：仅存在未跟踪目录，无跟踪文件改动；独立目录 `time-core/`，未触碰其他项目
- [x] three.js r128 本地化（603KB，无 CDN 依赖）
- [x] 全部功能模块（core/time-sync/clock/countdown/beats/audio/scene3d/ui/main/test）
- [x] 三维场景：玻璃环体、内核、能量环 shader（顶部顺时针充能弧+彗尖+刻度）、金属轨道×3+卫星、粒子系统、体积光锥、冲击波池、到点白闪、自适应画质
- [x] Electron 外壳（无边框透明、置顶、透明度、全屏），npm install 成功，冒烟测试通过（进程拉起 8s 无报错）
- [x] **循环 #2 纠正**：快捷 chips（10s/30s/1m/5m/10m）与自定义分/秒 = **对齐到绝对时间节点**（5m → 每个整 5 分时刻；10s → 每个整 10 秒节点；本地零点起划分）；「定到该时刻」保留精确绝对时刻；显示改为「触发 09:15:00.000 · 每5分」

## 浏览器实测记录（IAB + ?test=1 钩子）

| 项 | 结果 | 证据 |
|---|---|---|
| 时钟毫秒 3 位 | ✅ | 09:16:10.731 实时跳动 |
| 时区切换 | ✅ | Asia/Tokyo 10:01:10 = Intl 期望值 |
| 阶段切换 | ✅ | hist: WARMUP(剩10s)→SURGE(剩5s)→PULSE(剩3s)→zero→done，阈值精准 |
| 阶段视觉 | ✅ | 截图：琥珀外环/暖色激增/红色脉冲+冲击波 |
| 到点反馈 | ✅ | 白闪+「时间到 · 核心释放/全部节点完成」+ DOM class 验证 |
| 击拍判定 | ✅ | 30ms→PERFECT、100/110ms→GREAT（真实点击）、200ms→GOOD、400ms→MISS；连击与归零正确 |
| 击拍弹出 | ✅ | 绿色 GREAT + 「晚 110ms」+ COMBO 面板（截图） |
| 多周期节点 | ✅ | 每5秒×3轮：zero 节点 ：30/:35/:40 全对齐，advance×2→done |
| 小窗布局 | ✅ | 360×320 无溢出、面板矩形不相交（修复后 4px 间隙）、compact 模式干净 |
| 网络失败回退 | ✅ | ?nosync=1 徽章「本地时钟（未联网校时）」；+2s→simFail 全程零倒跳、归零 |
| 音频 | ✅ | 真实点击解锁，AudioContext running；无音频设备 try/catch 兜底 |
| 对齐节点 | ✅ | startAligned(300) → 触发 09:15:00.000（minute%5=0, s=0, ms=0） |

## 实测发现并修复的问题

1. **校时徽章橙底橙字不可读**：CSS 选择器把背景误加到整个徽章 → 修正为仅 `.dot`
2. **偏移回退显示时间倒退 332ms**：指数收敛初速快于真实时间 → 改为基于内部实测真实流逝统一限速（回退 ≤0.85×、正向 ≤8×），跨 rAF/看门狗调用成立
3. **限速单位错误**（dt 秒 vs 偏移毫秒差 1000 倍）→ 修正
4. **隐藏窗口时钟冻结**：DOM 更新依赖 rAF，页面 hidden 时 rAF 挂起 → 重构为定时器驱动逻辑与显示（66ms），rAF 只管 3D；音频调度器后台加大预排窗口至 1.6s
5. **校时采样点**：中点改用响应头到达时刻（排除解析耗时）；单源采信门槛 200→350ms
6. **小窗面板重叠**：时钟面板与控制按钮组重叠 22px → 窄屏媒体查询收紧（按钮 24px、时间 24px、面板限宽换行）
7. **测试环境怪癖（非程序问题）**：IAB 的 CUA keypress 把 "space" 映射成 KeyN（真实用户键盘不受影响）；截图通道偶发 6-8s 延迟；隐藏页被宿主限流

## 未完成 / Todo（供后续循环）

- [ ] 可选：粒子用 InstancedBufferGeometry 进一步降耗
- [ ] 可选：倒计时列表多目标并行（当前为单节点序列 + 多周期）
- [ ] 可选：Electron 安装包打包（electron-builder）
- [ ] 可选：接入真实 NTP（需后端/原生层，HTTP 源精度 ±RTT/2）

## 下一步命令（若中断，从这里继续）

```bash
cd /e/code/vibecoding/time-core
python -m http.server 8377 --bind 127.0.0.1   # 服务已常驻（后台任务）
# 浏览器：http://127.0.0.1:8377/index.html?test=1   （桌面端：npm start）
# 循环守则：先读本文件与 git status；只改 time-core/ 内文件；结束更新本文件
```

## 运行方式

- 浏览器直接打开 `index.html`（全本地资源）
- 桌面端：`npm install && npm start`（置顶/透明/无边框，node_modules 已装好）
