(() => {
    'use strict';

    // Theme
    const themeBtn = document.getElementById('themeBtn');
    themeBtn.addEventListener('click', () => {
        const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = t;
        themeBtn.textContent = t === 'dark' ? '🌙' : '☀️';
    });

    // ═══════════════════════════════════════════════════
    // AUDIO CONTEXT
    // ═══════════════════════════════════════════════════
    let audioCtx = null;
    let analyser, analyserFreq, masterGain, filterNode, delayNode, delayGain;
    let activeOscs = {};

    function initAudio() {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyserFreq = audioCtx.createAnalyser();
        analyserFreq.fftSize = 256;

        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.7;

        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 20000;

        delayNode = audioCtx.createDelay(1);
        delayNode.delayTime.value = 0;
        delayGain = audioCtx.createGain();
        delayGain.gain.value = 0;

        // Chain: source → filter → masterGain → analyser → destination
        filterNode.connect(masterGain);
        masterGain.connect(analyser);
        masterGain.connect(analyserFreq);
        analyser.connect(audioCtx.destination);

        // Delay feedback loop
        masterGain.connect(delayNode);
        delayNode.connect(delayGain);
        delayGain.connect(masterGain);

        drawVisualizer();
    }

    // ═══════════════════════════════════════════════════
    // SYNTHESIZER — Piano Keyboard
    // ═══════════════════════════════════════════════════
    const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const NOTE_FREQ = {};
    for (let o = 0; o <= 8; o++) {
        NOTES.forEach((n, i) => {
            const midi = o * 12 + i + 12;
            NOTE_FREQ[n + o] = 440 * Math.pow(2, (midi - 69) / 12);
        });
    }

    let currentWave = 'sine';
    let octave = 4;

    // Build keyboard
    const keyboardEl = document.getElementById('keyboard');
    const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const blackNotes = { 'C': 'C#', 'D': 'D#', 'F': 'F#', 'G': 'G#', 'A': 'A#' };
    const KEY_MAP = { 'a': 'C', 'w': 'C#', 's': 'D', 'e': 'D#', 'd': 'E', 'f': 'F', 't': 'F#', 'g': 'G', 'y': 'G#', 'h': 'A', 'u': 'A#', 'j': 'B', 'k': 'C+' };

    function buildKeyboard() {
        keyboardEl.innerHTML = '';
        let whiteIdx = 0;
        whiteNotes.forEach((note, i) => {
            const key = document.createElement('div');
            key.className = 'key white';
            key.dataset.note = note + octave;
            key.textContent = note;
            key.style.position = 'relative';
            keyboardEl.appendChild(key);

            if (blackNotes[note]) {
                const bkey = document.createElement('div');
                bkey.className = 'key black';
                bkey.dataset.note = blackNotes[note] + octave;
                const leftOffset = (i + 1) * (100 / 8) - 1.5;
                bkey.style.left = leftOffset + '%';
                keyboardEl.appendChild(bkey);
            }
            whiteIdx++;
        });
        // Extra C for next octave
        const key = document.createElement('div');
        key.className = 'key white';
        key.dataset.note = 'C' + (octave + 1);
        key.textContent = 'C';
        keyboardEl.appendChild(key);
    }
    buildKeyboard();

    function playNote(note) {
        initAudio();
        if (activeOscs[note]) return;
        const freq = NOTE_FREQ[note];
        if (!freq) return;

        const osc = audioCtx.createOscillator();
        const env = audioCtx.createGain();
        osc.type = currentWave;
        osc.frequency.value = freq;

        const atk = parseInt(document.getElementById('attack').value) / 100;
        env.gain.setValueAtTime(0, audioCtx.currentTime);
        env.gain.linearRampToValueAtTime(1, audioCtx.currentTime + atk);

        osc.connect(env);
        env.connect(filterNode);
        osc.start();
        activeOscs[note] = { osc, env };

        // Visual feedback
        const keyEl = keyboardEl.querySelector(`[data-note="${note}"]`);
        if (keyEl) keyEl.classList.add('active');
    }

    function stopNote(note) {
        if (!activeOscs[note]) return;
        const rel = parseInt(document.getElementById('release').value) / 100;
        const { osc, env } = activeOscs[note];
        env.gain.cancelScheduledValues(audioCtx.currentTime);
        env.gain.setValueAtTime(env.gain.value, audioCtx.currentTime);
        env.gain.linearRampToValueAtTime(0, audioCtx.currentTime + rel);
        osc.stop(audioCtx.currentTime + rel + 0.1);
        delete activeOscs[note];

        const keyEl = keyboardEl.querySelector(`[data-note="${note}"]`);
        if (keyEl) keyEl.classList.remove('active');
    }

    // Mouse events
    keyboardEl.addEventListener('mousedown', e => { if (e.target.dataset.note) playNote(e.target.dataset.note); });
    keyboardEl.addEventListener('mouseup', e => { if (e.target.dataset.note) stopNote(e.target.dataset.note); });
    keyboardEl.addEventListener('mouseleave', e => { if (e.target.dataset.note) stopNote(e.target.dataset.note); });

    // Touch events
    keyboardEl.addEventListener('touchstart', e => {
        e.preventDefault();
        const touch = e.touches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (el && el.dataset.note) playNote(el.dataset.note);
    }, { passive: false });
    keyboardEl.addEventListener('touchend', e => {
        Object.keys(activeOscs).forEach(stopNote);
    });

    // Keyboard shortcuts
    const pressedKeys = {};
    document.addEventListener('keydown', e => {
        if (pressedKeys[e.key]) return;
        pressedKeys[e.key] = true;
        const noteBase = KEY_MAP[e.key.toLowerCase()];
        if (!noteBase) return;
        const note = noteBase === 'C+' ? 'C' + (octave + 1) : noteBase + octave;
        playNote(note);
    });
    document.addEventListener('keyup', e => {
        pressedKeys[e.key] = false;
        const noteBase = KEY_MAP[e.key.toLowerCase()];
        if (!noteBase) return;
        const note = noteBase === 'C+' ? 'C' + (octave + 1) : noteBase + octave;
        stopNote(note);
    });

    // ═══════════════════════════════════════════════════
    // CONTROLS
    // ═══════════════════════════════════════════════════
    document.querySelectorAll('.wave-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentWave = btn.dataset.wave;
        });
    });

    document.getElementById('octave').addEventListener('input', e => {
        octave = parseInt(e.target.value);
        document.getElementById('octaveVal').textContent = octave;
        buildKeyboard();
    });

    document.getElementById('volume').addEventListener('input', e => {
        document.getElementById('volVal').textContent = e.target.value;
        if (masterGain) masterGain.gain.value = e.target.value / 100;
    });

    document.getElementById('filter').addEventListener('input', e => {
        document.getElementById('filterVal').textContent = e.target.value;
        if (filterNode) filterNode.frequency.value = parseInt(e.target.value);
    });

    document.getElementById('delay').addEventListener('input', e => {
        document.getElementById('delayVal').textContent = e.target.value;
        if (delayNode) {
            delayNode.delayTime.value = parseInt(e.target.value) / 1000;
            delayGain.gain.value = parseInt(e.target.value) > 0 ? 0.4 : 0;
        }
    });

    document.getElementById('reverb').addEventListener('input', e => {
        document.getElementById('reverbVal').textContent = e.target.value;
    });

    document.getElementById('attack').addEventListener('input', e => {
        document.getElementById('attackVal').textContent = (parseInt(e.target.value) / 100).toFixed(2);
    });

    document.getElementById('release').addEventListener('input', e => {
        document.getElementById('releaseVal').textContent = (parseInt(e.target.value) / 100).toFixed(2);
    });

    // ═══════════════════════════════════════════════════
    // VISUALIZER (Waveform + Frequency)
    // ═══════════════════════════════════════════════════
    const waveCanvas = document.getElementById('waveCanvas');
    const freqCanvas = document.getElementById('freqCanvas');
    const wCtx = waveCanvas.getContext('2d');
    const fCtx = freqCanvas.getContext('2d');

    function drawVisualizer() {
        if (!analyser) return;
        requestAnimationFrame(drawVisualizer);

        // Waveform
        const wRect = waveCanvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        waveCanvas.width = wRect.width * dpr;
        waveCanvas.height = wRect.height * dpr;
        wCtx.scale(dpr, dpr);
        const wW = wRect.width, wH = wRect.height;

        const timeData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(timeData);

        wCtx.fillStyle = '#0a0a18';
        wCtx.fillRect(0, 0, wW, wH);

        // Center line
        wCtx.strokeStyle = 'rgba(255,255,255,0.05)';
        wCtx.lineWidth = 1;
        wCtx.beginPath(); wCtx.moveTo(0, wH / 2); wCtx.lineTo(wW, wH / 2); wCtx.stroke();

        // Waveform line with glow
        wCtx.shadowColor = '#06b6d4';
        wCtx.shadowBlur = 10;
        wCtx.strokeStyle = '#06b6d4';
        wCtx.lineWidth = 2;
        wCtx.beginPath();
        const sliceWidth = wW / timeData.length;
        for (let i = 0; i < timeData.length; i++) {
            const v = timeData[i] / 128.0;
            const y = (v * wH) / 2;
            if (i === 0) wCtx.moveTo(0, y);
            else wCtx.lineTo(i * sliceWidth, y);
        }
        wCtx.stroke();
        wCtx.shadowBlur = 0;

        // Frequency bars
        const fRect = freqCanvas.getBoundingClientRect();
        freqCanvas.width = fRect.width * dpr;
        freqCanvas.height = fRect.height * dpr;
        fCtx.scale(dpr, dpr);
        const fW = fRect.width, fH = fRect.height;

        const freqData = new Uint8Array(analyserFreq.frequencyBinCount);
        analyserFreq.getByteFrequencyData(freqData);

        fCtx.fillStyle = '#0a0a18';
        fCtx.fillRect(0, 0, fW, fH);

        const barCount = freqData.length;
        const barW = fW / barCount;

        for (let i = 0; i < barCount; i++) {
            const barH = (freqData[i] / 255) * fH;
            const hue = (i / barCount) * 300;
            const grad = fCtx.createLinearGradient(0, fH, 0, fH - barH);
            grad.addColorStop(0, `hsla(${hue}, 80%, 60%, 0.8)`);
            grad.addColorStop(1, `hsla(${hue}, 80%, 60%, 0.2)`);
            fCtx.fillStyle = grad;
            fCtx.fillRect(i * barW, fH - barH, barW - 1, barH);
        }
    }

    // ═══════════════════════════════════════════════════
    // BEAT SEQUENCER
    // ═══════════════════════════════════════════════════
    const SEQ_STEPS = 16;
    const SEQ_ROWS = [
        { name: 'Kick', freq: 80, type: 'sine', decay: 0.15 },
        { name: 'Snare', freq: 200, type: 'triangle', decay: 0.1 },
        { name: 'HiHat', freq: 8000, type: 'square', decay: 0.03 },
        { name: 'Clap', freq: 1500, type: 'sawtooth', decay: 0.08 },
    ];
    let seqGrid = SEQ_ROWS.map(() => new Array(SEQ_STEPS).fill(false));
    let seqPlaying = false;
    let seqStep = 0;
    let seqTimer = null;

    function buildSequencer() {
        const grid = document.getElementById('sequencerGrid');
        grid.innerHTML = '';
        grid.style.gridTemplateColumns = `60px repeat(${SEQ_STEPS}, 1fr)`;

        SEQ_ROWS.forEach((row, ri) => {
            const label = document.createElement('div');
            label.className = 'seq-label';
            label.textContent = row.name;
            grid.appendChild(label);

            for (let ci = 0; ci < SEQ_STEPS; ci++) {
                const cell = document.createElement('div');
                cell.className = 'seq-cell' + (seqGrid[ri][ci] ? ' active' : '');
                cell.dataset.row = ri;
                cell.dataset.col = ci;
                cell.addEventListener('click', () => {
                    seqGrid[ri][ci] = !seqGrid[ri][ci];
                    cell.classList.toggle('active');
                });
                grid.appendChild(cell);
            }
        });
    }
    buildSequencer();

    function playSeqSound(row) {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = row.type;
        osc.frequency.value = row.freq;

        // Kick-specific: frequency sweep
        if (row.freq < 100) {
            osc.frequency.setValueAtTime(row.freq * 4, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(row.freq, audioCtx.currentTime + 0.05);
        }

        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + row.decay);
        osc.connect(gain);
        gain.connect(filterNode);
        osc.start();
        osc.stop(audioCtx.currentTime + row.decay + 0.01);
    }

    function seqTick() {
        const grid = document.getElementById('sequencerGrid');
        // Clear previous column highlights
        grid.querySelectorAll('.seq-cell.playing').forEach(c => c.classList.remove('playing'));

        // Highlight current column
        for (let ri = 0; ri < SEQ_ROWS.length; ri++) {
            const cell = grid.querySelector(`[data-row="${ri}"][data-col="${seqStep}"]`);
            if (cell) cell.classList.add('playing');
            if (seqGrid[ri][seqStep]) playSeqSound(SEQ_ROWS[ri]);
        }

        seqStep = (seqStep + 1) % SEQ_STEPS;
    }

    document.getElementById('seqPlay').addEventListener('click', () => {
        initAudio();
        if (seqPlaying) return;
        seqPlaying = true;
        seqStep = 0;
        const bpm = parseInt(document.getElementById('seqBpm').value);
        const interval = (60 / bpm / 4) * 1000; // 16th notes
        seqTimer = setInterval(seqTick, interval);
    });

    document.getElementById('seqStop').addEventListener('click', () => {
        seqPlaying = false;
        clearInterval(seqTimer);
        document.querySelectorAll('.seq-cell.playing').forEach(c => c.classList.remove('playing'));
    });

    document.getElementById('seqBpm').addEventListener('input', e => {
        document.getElementById('seqBpmVal').textContent = e.target.value;
        if (seqPlaying) {
            clearInterval(seqTimer);
            const interval = (60 / parseInt(e.target.value) / 4) * 1000;
            seqTimer = setInterval(seqTick, interval);
        }
    });
})();
