"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function runtimeDocument() {
        const scope = globalThis;
        if (!scope.document)
            throw new Error('AdbScreenshotPickerView requires a document');
        return scope.document;
    }
    function runtimeWindow() {
        const scope = globalThis;
        if (!scope.window)
            throw new Error('AdbScreenshotPickerView requires a window');
        return scope.window;
    }
    function required(node, id) {
        if (!node)
            throw new Error('AdbScreenshotPickerView missing #' + id);
        return node;
    }
    function finite(value) {
        if (value === '' || value === null || value === undefined)
            return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    function xyText(action) {
        const x = finite(action.x), y = finite(action.y);
        return (x === null ? '—' : String(x)) + ' , ' + (y === null ? '—' : String(y));
    }
    function crossStyle(action) {
        const x = finite(action.x), y = finite(action.y);
        const width = finite(action.shotW), height = finite(action.shotH);
        if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0)
            return '';
        return 'left:' + (x / width * 100).toFixed(2) + '%;top:' + (y / height * 100).toFixed(2) + '%';
    }
    function createAdbScreenshotPickerView(options = {}) {
        const doc = options.document || runtimeDocument();
        const win = options.window || runtimeWindow();
        const handlers = options.handlers || { onSelect: () => { }, onRetake: () => { }, onClose: () => { } };
        const picker = required(doc.getElementById('shot-picker'), 'shot-picker');
        const title = required(doc.getElementById('sp-title'), 'sp-title');
        const xy = required(doc.getElementById('sp-xy'), 'sp-xy');
        const stage = required(doc.getElementById('sp-stage'), 'sp-stage');
        const frame = required(stage.querySelector('.sp-frame'), 'sp-frame');
        const image = required(doc.getElementById('sp-img'), 'sp-img');
        const guides = required(doc.getElementById('sp-guides'), 'sp-guides');
        const vertical = required(guides.querySelector('.gv'), 'sp-guides .gv');
        const horizontal = required(guides.querySelector('.gh'), 'sp-guides .gh');
        const cross = required(doc.getElementById('sp-cross'), 'sp-cross');
        const magnifier = required(doc.getElementById('sp-mag'), 'sp-mag');
        const closeButton = required(doc.getElementById('sp-close'), 'sp-close');
        const okButton = required(doc.getElementById('sp-ok'), 'sp-ok');
        const retakeButton = required(doc.getElementById('sp-retake'), 'sp-retake');
        let active = null;
        function layoutFrame() {
            if (!active)
                return;
            const bounds = stage.getBoundingClientRect();
            const availableWidth = Math.max(50, bounds.width - 8);
            const availableHeight = Math.max(50, bounds.height - 8);
            const width = finite(active.shotW) || 1;
            const height = finite(active.shotH) || 1;
            const aspect = width / height;
            let frameWidth = availableWidth;
            let frameHeight = frameWidth / aspect;
            if (frameHeight > availableHeight) {
                frameHeight = availableHeight;
                frameWidth = frameHeight * aspect;
            }
            frame.style.width = Math.round(frameWidth) + 'px';
            frame.style.height = Math.round(frameHeight) + 'px';
        }
        function updateCross() {
            if (!active)
                return;
            const css = crossStyle(active);
            cross.style.cssText = css;
            cross.hidden = !css;
        }
        function hide() {
            picker.hidden = true;
            magnifier.style.display = 'none';
            guides.hidden = true;
            active = null;
        }
        function closeFromUser() {
            const action = active;
            hide();
            if (action)
                handlers.onClose(action);
        }
        function open(action) {
            if (typeof action._shot !== 'string' || !action._shot)
                throw new Error('AdbScreenshotPickerView requires a screenshot');
            active = action;
            title.textContent = '选点 · ' + (action.name || '') + ' · ' + action.shotW + '×' + action.shotH;
            image.src = 'data:image/png;base64,' + action._shot;
            xy.textContent = xyText(action);
            updateCross();
            picker.hidden = false;
            layoutFrame();
        }
        function close() { hide(); }
        function isOpen() { return !picker.hidden && !!active; }
        image.addEventListener('dragstart', event => { if (event.preventDefault)
            event.preventDefault(); });
        win.addEventListener('resize', layoutFrame);
        image.addEventListener('mousemove', event => {
            if (!active || event.clientX === undefined || event.clientY === undefined)
                return;
            const bounds = image.getBoundingClientRect();
            const px = event.clientX - bounds.left, py = event.clientY - bounds.top;
            const rx = clamp(px / bounds.width, 0, 1), ry = clamp(py / bounds.height, 0, 1);
            const shotWidth = finite(active.shotW) || 1, shotHeight = finite(active.shotH) || 1;
            xy.textContent = Math.round(rx * shotWidth) + ' , ' + Math.round(ry * shotHeight);
            guides.hidden = false;
            vertical.style.left = px + 'px';
            horizontal.style.top = py + 'px';
            const zoom = 3, size = 160;
            const naturalWidth = image.naturalWidth || shotWidth;
            const naturalHeight = image.naturalHeight || shotHeight;
            const sourceX = clamp(rx * naturalWidth - size / (2 * zoom), 0, Math.max(0, naturalWidth - size / zoom));
            const sourceY = clamp(ry * naturalHeight - size / (2 * zoom), 0, Math.max(0, naturalHeight - size / zoom));
            const context = image && magnifier.getContext ? magnifier.getContext('2d') : null;
            if (context) {
                context.imageSmoothingEnabled = false;
                context.drawImage(image, sourceX, sourceY, size / zoom, size / zoom, 0, 0, size, size);
                context.strokeStyle = 'rgba(255,93,122,0.9)';
                context.lineWidth = 1;
                context.beginPath();
                context.moveTo(size / 2, 0);
                context.lineTo(size / 2, size);
                context.moveTo(0, size / 2);
                context.lineTo(size, size / 2);
                context.stroke();
            }
            const frameBounds = frame.getBoundingClientRect();
            magnifier.style.display = 'block';
            magnifier.style.left = clamp(event.clientX - frameBounds.left + 22, 0, frameBounds.width - size) + 'px';
            magnifier.style.top = clamp(event.clientY - frameBounds.top - size / 2, 0, frameBounds.height - size) + 'px';
        });
        image.addEventListener('mouseleave', () => { magnifier.style.display = 'none'; guides.hidden = true; });
        image.addEventListener('click', event => {
            if (!active || event.clientX === undefined || event.clientY === undefined)
                return;
            const bounds = image.getBoundingClientRect();
            const shotWidth = finite(active.shotW) || 1, shotHeight = finite(active.shotH) || 1;
            const x = Math.round((event.clientX - bounds.left) * (shotWidth / bounds.width));
            const y = Math.round((event.clientY - bounds.top) * (shotHeight / bounds.height));
            handlers.onSelect(active, x, y);
            xy.textContent = xyText({ ...active, x, y });
            updateCross();
            cross.classList.remove('pulse');
            void cross.offsetWidth;
            cross.classList.add('pulse');
            guides.hidden = true;
        });
        closeButton.addEventListener('click', closeFromUser);
        okButton.addEventListener('click', closeFromUser);
        retakeButton.addEventListener('click', () => { if (active)
            handlers.onRetake(active); });
        picker.addEventListener('click', event => { if (event.target === picker)
            closeFromUser(); });
        win.addEventListener('keydown', event => {
            if (event.key === 'Escape' && isOpen())
                closeFromUser();
        }, true);
        return { open, close, isOpen };
    }
    TimeCoreDomain.createAdbScreenshotPickerView = createAdbScreenshotPickerView;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
