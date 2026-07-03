const comboState = { activeCombo: null, currentStepIndex: 0, timestamps: [], forces: [], peakAccels: [], promptTime: 0, isTracking: false, results: null };
const COMBOS = [
    { id: '1-2', name: 'Classic 1-2 Combo', sequence: ['jab', 'cross'], desc: 'Lead jab directly connected to rear power cross payload.' }
];

let comboWindowRecording = false;
let comboWindowStart = 0;
let comboBuffer = [];

function renderComboSelectionScreen() {
    const container = document.getElementById('combo-list-container');
    if(!container) return;
    container.innerHTML = COMBOS.map(c => `
        <div class="punch-card" onclick="selectCombo('${c.id}')" style="margin-bottom:10px;">
            <div class="pc-name" style="color:var(--blue);">${c.name}</div>
            <div class="pc-desc">${c.desc}</div>
        </div>
    `).join('');
    goTo('screen-combo-select');
}

function selectCombo(comboId) {
    comboState.activeCombo = COMBOS.find(c => c.id === comboId);
    document.getElementById('combo-setup-panel').style.display = 'block';
    document.getElementById('panel-combo-name').textContent = comboState.activeCombo.name;
    document.getElementById('panel-combo-desc').textContent = comboState.activeCombo.desc;
    document.getElementById('panel-combo-sequence').textContent = `PATTERN: ${comboState.activeCombo.sequence.join(' -> ').toUpperCase()}`;
}

function startComboExecution() {
    comboState.isTracking = true; comboState.currentStepIndex = 0; comboState.timestamps = []; comboState.forces = []; comboState.peakAccels = [];
    state.hasGravityEstimate = false;
    goTo('screen-combo-measure');
    document.getElementById('combo-target-punch').textContent = "STANDBY";
    document.getElementById('combo-step-indicator').textContent = "ZEROING TRACKER...";
    window.addEventListener('devicemotion', handleComboMotion);
    state.armed = false;
    setTimeout(() => { state.armed = true; triggerNextComboPrompt(); }, 1200);
}

function triggerNextComboPrompt() {
    const cur = comboState.activeCombo.sequence[comboState.currentStepIndex];
    document.getElementById('combo-target-punch').textContent = PUNCH_TYPES.find(p => p.id === cur).name.toUpperCase();
    document.getElementById('combo-step-indicator').textContent = `STRIKE ${comboState.currentStepIndex + 1}`;
    comboState.promptTime = performance.now();
}

function handleComboMotion(event) {
    if (!comboState.isTracking) return;
    const rawAccel = getLinearAccel(event);
    if (!rawAccel) return;
    const filteredMag = filterSignalNoise(Math.sqrt(rawAccel.x**2 + rawAccel.y**2 + rawAccel.z**2));
    document.getElementById('combo-live-accel').textContent = filteredMag.toFixed(1);
    const currentTime = performance.now();

    if (filteredMag > TRIGGER_THRESHOLD && !comboWindowRecording && state.armed) {
        comboWindowRecording = true; comboWindowStart = currentTime; comboBuffer = [];
    }
    if (comboWindowRecording) {
        comboBuffer.push(filteredMag);
        if (currentTime - comboWindowStart >= PUNCH_WINDOW_MS) {
            comboWindowRecording = false;
            let peak = Math.max(...comboBuffer.slice(Math.floor(comboBuffer.length * 0.2)));
            if(peak === 0 || peak === -Infinity) peak = Math.max(...comboBuffer);
            
            comboState.timestamps.push(performance.now());
            const cur = comboState.activeCombo.sequence[comboState.currentStepIndex];
            comboState.forces.push((state.bodyWeight * PUNCH_TYPES.find(p => p.id === cur).fraction + 0.35) * peak);
            comboState.peakAccels.push(peak);
            triggerHapticFeedback();
            comboState.currentStepIndex++;

            if (comboState.currentStepIndex < comboState.activeCombo.sequence.length) {
                triggerNextComboPrompt();
            } else {
                comboState.isTracking = false; window.removeEventListener('devicemotion', handleComboMotion);
                calculateComboMetrics();
            }
        }
    }
}

function calculateComboMetrics() {
    const lat = (comboState.timestamps[0] - comboState.promptTime) / 1000;
    const dur = (comboState.timestamps[comboState.timestamps.length - 1] - comboState.timestamps[0]) / 1000;
    comboState.results = { latency: lat, totalDuration: dur, totalForce: comboState.forces.reduce((a,b)=>a+b, 0) };
    document.getElementById('cb-res-force').textContent = Math.round(comboState.results.totalForce);
    document.getElementById('cb-res-latency').textContent = comboState.results.latency.toFixed(3);
    document.getElementById('cb-res-duration').textContent = comboState.results.totalDuration.toFixed(3);
    document.getElementById('cb-res-sustenance').textContent = "88";
    goTo('screen-combo-results');
}