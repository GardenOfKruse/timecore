"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function runtimeDocument() {
        const scope = globalThis;
        if (!scope.document)
            throw new Error('AdbActionView requires a document');
        return scope.document;
    }
    function required(node, selector) {
        if (!node)
            throw new Error('AdbActionView missing ' + selector);
        return node;
    }
    function valueOf(event) {
        return event.target && event.target.value !== undefined ? event.target.value : '';
    }
    function checkedOf(event) {
        return !!(event.target && event.target.checked);
    }
    function finite(value) {
        if (value === '' || value === null || value === undefined)
            return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }
    function quoted(value) {
        return String(value || '').replace(/"/g, '');
    }
    function crossStyle(action) {
        const x = finite(action.x);
        const y = finite(action.y);
        const width = finite(action.shotW);
        const height = finite(action.shotH);
        if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0)
            return '';
        return 'left:' + (x / width * 100).toFixed(2) + '%;top:' + (y / height * 100).toFixed(2) + '%';
    }
    function setNumberValue(node, value, fallback = '') {
        const number = finite(value);
        node.value = number === null ? fallback : String(number);
    }
    function chipsHTML(action, devices) {
        if (!devices.length)
            return '<span class="dim small">无设备</span>';
        return devices.map(device => {
            const selected = action.devs.includes(device.serial);
            const offline = device.state !== 'device';
            return '<span class="a-devchip' + (selected ? ' on' : '') + (offline ? ' dimchip' : '') +
                '" data-serial="' + quoted(device.serial) + '" title="' + quoted(device.serial) +
                (offline ? '（离线）' : '') + '">' + quoted(device.name || device.serial.slice(-4)) + '</span>';
        }).join('');
    }
    function cardBody(action, isAdvanced) {
        if (isAdvanced) {
            return '<textarea class="a-script" rows="3" spellcheck="false" placeholder="设备端 shell 脚本，支持 {serial} {W} {H} {X} {Y}"></textarea>';
        }
        return '<div class="a-pick">' +
            '<div class="a-shot">' +
            (typeof action._shot === 'string' && action._shot.length > 0
                ? '<img src="data:image/png;base64,' + action._shot + '"><i class="a-cross" style="' + crossStyle(action) + '"></i>'
                : '<div class="a-shot-empty dim small">尚未截屏</div>') +
            '</div>' +
            '<div class="a-pick-ctl">' +
            '<button class="a-shotbtn">' + (action._shot ? '📸 重新截屏' : '📸 截屏选点') + '</button>' +
            '<div class="a-field"><span class="a-lab">X 坐标</span><input type="number" class="a-x"></div>' +
            '<div class="a-field"><span class="a-lab">Y 坐标</span><input type="number" class="a-y"></div>' +
            '<div class="a-field"><span class="a-lab">次数</span><input type="number" class="a-n" min="1" max="200"></div>' +
            '<div class="a-field"><span class="a-lab">间隔 ms</span><input type="number" class="a-gap" min="50"></div>' +
            (action.type === 'wake' ? '<div class="dim small">先亮屏+上滑解锁（需无密码锁屏）</div>' : '') +
            '</div>' +
            '</div>';
    }
    function createAdbActionView(options = {}) {
        const doc = options.document || runtimeDocument();
        let model = { actions: [], devices: [] };
        let handlers = { onEvent: () => { } };
        function emit(event, card) {
            handlers.onEvent(event);
            if (event.kind === 'field' && (event.field === 'x' || event.field === 'y') && card) {
                const cross = card.querySelector('.a-cross');
                if (cross)
                    cross.style.cssText = crossStyle(event.action);
            }
            if (event.kind === 'device-toggle')
                refreshDevices(model);
        }
        function bindDevices(box, action) {
            box.querySelectorAll('.a-devchip').forEach(chip => chip.addEventListener('click', () => {
                const serial = chip.dataset.serial || '';
                if (serial)
                    emit({ kind: 'device-toggle', action, serial });
            }));
        }
        function actionCard(action) {
            const card = doc.createElement('div');
            card.className = 'adb-action';
            card.dataset.id = action.id;
            const badge = { tap: '连点', wake: '亮屏连点', adv: '脚本' }[action.type] || '动作';
            const isAdvanced = action.type === 'adv';
            card.innerHTML =
                '<div class="row"><span class="a-badge">' + badge + '</span><input class="a-name" value="' + quoted(action.name) + '" placeholder="动作名称">' +
                    '<label class="ck-inline"><input type="checkbox" class="a-on"' + (action.on ? ' checked' : '') + '>启用</label>' +
                    '<button class="a-del" title="删除此动作"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg></button></div>' +
                    cardBody(action, isAdvanced) +
                    '<div class="a-devices">' + chipsHTML(action, model.devices) + '</div>' +
                    '<div class="a-field"><span class="a-lab">提前量</span><input type="number" class="a-lead" placeholder="用全局"><span class="dim small">ms</span></div>' +
                    '<div class="a-field"><span class="a-lab">节点偏移</span><input type="number" class="a-offset" placeholder="0"><span class="dim small">ms（T+）</span></div>' +
                    '<div class="row"><span class="dim small a-devcount">' + (action.devs.length ? '指定 ' + action.devs.length + ' 台' : '全部启用设备') + '</span>' +
                    '<span style="flex:1"></span><button class="a-fire">试射</button></div>';
            required(card.querySelector('.a-name'), '.a-name').addEventListener('input', event => emit({ kind: 'field', action, field: 'name', value: valueOf(event) }, card));
            required(card.querySelector('.a-on'), '.a-on').addEventListener('change', event => emit({ kind: 'field', action, field: 'enabled', value: checkedOf(event) }, card));
            required(card.querySelector('.a-del'), '.a-del').addEventListener('click', () => emit({ kind: 'remove', action }, card));
            required(card.querySelector('.a-fire'), '.a-fire').addEventListener('click', () => emit({ kind: 'fire', action }, card));
            const lead = required(card.querySelector('.a-lead'), '.a-lead');
            lead.value = action.lead != null ? String(action.lead) : '';
            lead.addEventListener('input', event => emit({ kind: 'field', action, field: 'lead', value: valueOf(event) }, card));
            const offset = required(card.querySelector('.a-offset'), '.a-offset');
            setNumberValue(offset, action.offsetMs, '0');
            offset.addEventListener('input', event => emit({ kind: 'field', action, field: 'offset', value: valueOf(event) }, card));
            const devices = required(card.querySelector('.a-devices'), '.a-devices');
            bindDevices(devices, action);
            if (isAdvanced) {
                const script = required(card.querySelector('.a-script'), '.a-script');
                script.value = typeof action.script === 'string' ? action.script : '';
                script.addEventListener('input', event => emit({ kind: 'field', action, field: 'script', value: valueOf(event) }, card));
            }
            else {
                required(card.querySelector('.a-shotbtn'), '.a-shotbtn').addEventListener('click', () => emit({ kind: 'screenshot', action }, card));
                const x = required(card.querySelector('.a-x'), '.a-x');
                const y = required(card.querySelector('.a-y'), '.a-y');
                setNumberValue(x, action.x);
                setNumberValue(y, action.y);
                x.addEventListener('input', event => emit({ kind: 'field', action, field: 'x', value: valueOf(event) }, card));
                y.addEventListener('input', event => emit({ kind: 'field', action, field: 'y', value: valueOf(event) }, card));
                const count = required(card.querySelector('.a-n'), '.a-n');
                const gap = required(card.querySelector('.a-gap'), '.a-gap');
                setNumberValue(count, action.n || 5);
                setNumberValue(gap, action.gap || 400);
                count.addEventListener('input', event => emit({ kind: 'field', action, field: 'count', value: valueOf(event) }, card));
                gap.addEventListener('input', event => emit({ kind: 'field', action, field: 'gap', value: valueOf(event) }, card));
                const shot = required(card.querySelector('.a-shot'), '.a-shot');
                const image = shot.querySelector('img');
                (image || shot).addEventListener('click', () => emit({ kind: 'open-picker', action }, card));
            }
            return card;
        }
        function refreshDevices(next) {
            model = next;
            for (const card of doc.querySelectorAll('.adb-action')) {
                const action = model.actions.find(item => item.id === card.dataset.id);
                if (!action)
                    continue;
                const box = card.querySelector('.a-devices');
                if (box) {
                    box.innerHTML = chipsHTML(action, model.devices);
                    bindDevices(box, action);
                }
                const count = card.querySelector('.a-devcount');
                if (count)
                    count.textContent = action.devs.length ? '指定 ' + action.devs.length + ' 台' : '全部启用设备';
            }
        }
        function render(next, nextHandlers) {
            model = next;
            handlers = nextHandlers;
            const box = doc.getElementById('adb-actions');
            if (!box)
                return;
            box.innerHTML = '';
            for (const action of model.actions)
                box.appendChild(actionCard(action));
        }
        return { render, refreshDevices };
    }
    TimeCoreDomain.createAdbActionView = createAdbActionView;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
