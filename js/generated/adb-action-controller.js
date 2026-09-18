"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function updateField(action, field, value) {
        if (field === 'name')
            action.name = String(value);
        else if (field === 'enabled')
            action.on = !!value;
        else if (field === 'lead')
            action.lead = value === '' ? '' : +value;
        else if (field === 'offset')
            action.offsetMs = value === '' ? 0 : Math.max(0, +value || 0);
        else if (field === 'script')
            action.script = String(value);
        else if (field === 'x')
            action.x = value === '' ? '' : +value;
        else if (field === 'y')
            action.y = value === '' ? '' : +value;
        else if (field === 'count')
            action.n = +value || 5;
        else if (field === 'gap')
            action.gap = +value || 400;
    }
    function createAdbActionController(options) {
        function handle(event) {
            const action = event.action;
            if (event.kind === 'field') {
                updateField(action, event.field, event.value);
                options.save();
                return;
            }
            if (event.kind === 'device-toggle') {
                action.devs = action.devs.includes(event.serial)
                    ? action.devs.filter(serial => serial !== event.serial)
                    : action.devs.concat(event.serial);
                options.save();
                return;
            }
            if (event.kind === 'remove') {
                options.catalog.remove(action);
                options.save();
                options.render();
            }
            else if (event.kind === 'fire') {
                options.onFire(action);
            }
            else if (event.kind === 'screenshot') {
                options.onScreenshot(action);
            }
            else if (event.kind === 'open-picker') {
                options.onOpenPicker(action);
            }
        }
        return { handle };
    }
    TimeCoreDomain.createAdbActionController = createAdbActionController;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
