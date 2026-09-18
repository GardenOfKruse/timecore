"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    const TRACKS = ['beat', 'cue', 'hit'];
    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }
    function defaultPlatform() {
        return {
            createContext() {
                const scope = globalThis;
                const Constructor = scope.AudioContext || scope.webkitAudioContext;
                return Constructor ? new Constructor() : null;
            },
            createWorker(onWake) {
                try {
                    const scope = globalThis;
                    if (!scope.Worker || !scope.Blob || !scope.URL)
                        return null;
                    const worker = new scope.Worker(scope.URL.createObjectURL(new scope.Blob(['setInterval(()=>postMessage(0),250)'], { type: 'text/javascript' })));
                    worker.onmessage = () => onWake();
                    return worker;
                }
                catch (_) {
                    return null;
                }
            }
        };
    }
    function createAudioOutput(platform = defaultPlatform()) {
        let ctx = null;
        let master = null;
        let noiseBuffer = null;
        let worker = null;
        const tracks = {};
        let queued = [];
        function ensure(options) {
            if (!ctx) {
                try {
                    const candidate = platform.createContext();
                    if (!candidate)
                        return false;
                    const nextMaster = candidate.createGain();
                    nextMaster.gain.value = options.masterGain;
                    const compressor = candidate.createDynamicsCompressor();
                    compressor.threshold.value = -10;
                    compressor.knee.value = 24;
                    compressor.ratio.value = 6;
                    compressor.attack.value = 0.003;
                    compressor.release.value = 0.25;
                    nextMaster.connect(compressor);
                    compressor.connect(candidate.destination);
                    const nextTracks = {};
                    for (const category of TRACKS) {
                        const track = candidate.createGain();
                        const saved = options.trackGains[category];
                        track.gain.value = isFinite(saved) ? clamp(saved, 0, 1) : 1;
                        track.connect(nextMaster);
                        nextTracks[category] = track;
                    }
                    const nextNoiseBuffer = candidate.createBuffer(1, candidate.sampleRate, candidate.sampleRate);
                    const data = nextNoiseBuffer.getChannelData(0);
                    for (let i = 0; i < data.length; i++)
                        data[i] = Math.random() * 2 - 1;
                    ctx = candidate;
                    master = nextMaster;
                    noiseBuffer = nextNoiseBuffer;
                    for (const category of TRACKS)
                        tracks[category] = nextTracks[category];
                    worker = platform.createWorker(options.onWake);
                }
                catch (_) {
                    ctx = null;
                    master = null;
                    noiseBuffer = null;
                    worker = null;
                    for (const category of TRACKS)
                        delete tracks[category];
                    return false;
                }
            }
            if (ctx.state === 'suspended')
                ctx.resume().catch(() => { });
            return true;
        }
        function playOscillator(request) {
            if (!ctx || !master)
                return;
            const o = ctx.createOscillator();
            const gain = ctx.createGain();
            o.type = request.type;
            o.frequency.setValueAtTime(Math.max(1, request.fromHz), request.startAt);
            if (request.toHz && request.toHz !== request.fromHz) {
                o.frequency.exponentialRampToValueAtTime(Math.max(1, request.toHz), request.startAt + request.duration);
            }
            gain.gain.setValueAtTime(0.0001, request.startAt);
            gain.gain.exponentialRampToValueAtTime(request.peak, request.startAt + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, request.startAt + request.duration);
            let tail = gain;
            if (request.pan && ctx.createStereoPanner) {
                const panner = ctx.createStereoPanner();
                panner.pan.value = clamp(request.pan, -1, 1);
                gain.connect(panner);
                tail = panner;
            }
            o.connect(gain);
            tail.connect((request.track && tracks[request.track]) || master);
            o.start(request.startAt);
            o.stop(request.startAt + request.duration + 0.05);
            queued.push({ src: o, t0: request.startAt, category: request.track || 'master' });
        }
        function playNoise(request) {
            if (!ctx || !master || !noiseBuffer)
                return;
            const source = ctx.createBufferSource();
            source.buffer = noiseBuffer;
            source.loop = true;
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = request.frequency;
            filter.Q.value = request.quality || 1;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(request.peak, request.startAt);
            gain.gain.exponentialRampToValueAtTime(0.0001, request.startAt + request.duration);
            source.connect(filter);
            filter.connect(gain);
            gain.connect((request.track && tracks[request.track]) || master);
            source.start(request.startAt);
            source.stop(request.startAt + request.duration + 0.05);
            queued.push({ src: source, t0: request.startAt, category: request.track || 'master' });
        }
        function cancelPending() {
            if (!ctx)
                return;
            const now = ctx.currentTime;
            const cut = now + 0.05;
            const keep = [];
            for (const entry of queued) {
                if (entry.t0 <= now - 0.5)
                    continue;
                if (entry.t0 > cut && (entry.category === 'beat' || entry.category === 'cue')) {
                    try {
                        entry.src.stop(cut);
                    }
                    catch (_) { }
                    continue;
                }
                keep.push(entry);
            }
            queued = keep;
        }
        return {
            ensure,
            ready: () => !!ctx && ctx.state === 'running',
            currentTime: () => ctx ? ctx.currentTime : 0,
            playOscillator,
            playNoise,
            cancelPending,
            state: () => ctx ? ctx.state : 'none',
            workerActive: () => !!worker,
            queuedCount: () => queued.length,
            setMasterGain: value => { if (master)
                master.gain.value = value; },
            trackGain: category => tracks[category] ? tracks[category].gain.value : 1,
            setTrackGain: (category, value) => { if (tracks[category])
                tracks[category].gain.value = clamp(value, 0, 1); }
        };
    }
    TimeCoreDomain.createAudioOutput = createAudioOutput;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
