"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function assertEpoch(value) {
        if (!Number.isFinite(value))
            throw new RangeError('nodeEpoch must be an absolute epoch value');
    }
    function emissionKey(actionId, deviceId, nodeEpoch) {
        return String(actionId) + ':' + String(deviceId) + ':' + String(nodeEpoch);
    }
    function createAdbEmissionGate() {
        let armedNode = null;
        const claimed = new Set();
        function arm(nodeEpoch) {
            assertEpoch(nodeEpoch);
            if (armedNode !== nodeEpoch) {
                claimed.clear();
                armedNode = nodeEpoch;
            }
        }
        function claim(actionId, deviceId, nodeEpoch) {
            assertEpoch(nodeEpoch);
            if (armedNode == null)
                armedNode = nodeEpoch;
            const key = emissionKey(actionId, deviceId, nodeEpoch);
            if (claimed.has(key))
                return false;
            claimed.add(key);
            return true;
        }
        function reset() {
            claimed.clear();
            armedNode = null;
        }
        return { arm, claim, reset, size: () => claimed.size };
    }
    TimeCoreDomain.createAdbEmissionGate = createAdbEmissionGate;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
