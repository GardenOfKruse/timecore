"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function runtimeDocument() {
        const scope = globalThis;
        if (!scope.document)
            throw new Error('AdbGuideView requires a document');
        return scope.document;
    }
    function step(number, ok, text, button) {
        return '<div class="ag-step' + (ok ? ' ok' : '') + '"><i>' + (ok ? '✓' : number) + '</i><span>' + text + '</span>' + button + '</div>';
    }
    function createAdbGuideView(options = {}) {
        const doc = options.document || runtimeDocument();
        let handlers = { onEvent: () => { } };
        function renderStatus(model) {
            const status = doc.getElementById('adb-status');
            if (!status)
                return;
            if (!model.adbOk) {
                status.textContent = '未找到 adb';
                status.title = '未在系统与常见路径找到 adb：点「下载 adb」一键安装官方组件（约 6MB），或在上方路径框指定 adb.exe 后点「检测」';
                status.style.color = 'var(--warm)';
            }
            else if (model.adbAncient) {
                status.textContent = '⚠ adb 过旧（' + (model.adbVersion || '') + '）';
                status.title = '该版本 USB 可用，但 Android 11+ 无线调试（TLS）无法握手——点「升级 adb」安装官方最新组件后重连无线即可';
                status.style.color = 'var(--warm)';
            }
            else {
                status.textContent = '✓ 就绪 · adb ' + (model.adbVersion || '');
                status.title = model.adbPath || '';
                status.style.color = '#4dffa6';
            }
            const download = doc.getElementById('adb-download');
            if (download) {
                download.hidden = model.adbOk && !model.adbAncient;
                download.textContent = model.adbAncient ? '⬇ 升级 adb' : '⬇ 下载 adb';
            }
        }
        function renderGuide(model) {
            const guide = doc.getElementById('adb-guide');
            if (!guide)
                return;
            const done = model.enabled && model.adbOk && model.readyCount > 0 && model.actionCount > 0;
            guide.hidden = done;
            guide.innerHTML =
                '<div class="ag-title">' + (done ? '✓ ADB 齐射已就绪' : '按步骤开启 ADB 齐射') + '</div>' +
                    step(1, model.enabled, '开启「启用 ADB 齐射」总开关', '') +
                    step(2, model.adbOk, model.adbOk ? 'adb 组件已就绪' : '安装 adb（一键下载官方组件，约 6MB)', model.adbOk ? '' : '<button id="ag-dl">下载</button>') +
                    step(3, model.readyCount > 0, model.readyCount ? '已连接 ' + model.readyCount + ' 台设备' : 'USB 连接手机并开启 USB 调试', model.readyCount ? '' : '<button id="ag-scan">扫描</button>') +
                    step(4, model.actionCount > 0, model.actionCount ? '已启用 ' + model.actionCount + ' 个动作' : '添加动作并勾选「启用」', '') +
                    (model.unauthorized ? '<div class="ag-warn">检测到未授权设备：请在手机上允许「USB 调试」弹窗，再点扫描</div>' : '') +
                    '<div class="ag-note">不需要 ADB？保持总开关关闭即可，TIMECORE 仍是完整的纯时间装置</div>';
            const download = doc.getElementById('ag-dl');
            if (download)
                download.addEventListener('click', () => handlers.onEvent({ kind: 'download' }));
            const scan = doc.getElementById('ag-scan');
            if (scan)
                scan.addEventListener('click', () => handlers.onEvent({ kind: 'scan' }));
            const dot = doc.getElementById('adb-dot');
            if (dot)
                dot.style.background = !model.enabled ? '#777' : model.readyCount ? '#4dffa6' : model.adbOk ? '#39d7ff' : '#ffb347';
        }
        function render(model, nextHandlers) {
            handlers = nextHandlers;
            renderStatus(model);
            renderGuide(model);
        }
        return { render };
    }
    TimeCoreDomain.createAdbGuideView = createAdbGuideView;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
