/**
 * First Fist — Tactical Combo Engine
 * NOTE: Currently a dormant module. Awaiting future UI implementation in index.html.
 */

// --- STATE & CONFIG ---
const comboState = { 
    activeCombo: null, 
    currentStepIndex: 0, 
    timestamps: [], 
    forces: [], 
    peakAccels: [], 
    promptTime: 0, 
    isTracking: false, 
    results: null 
};

const COMBOS = [
    { 
        id: '1-2', 
        name: 'Classic 1-2 Combo', 
        sequence: ['jab', 'cross'], 
        desc: 'Lead jab directly connected to rear power cross payload.' 
    }
];

// How long (ms) to keep sampling after a punch is first detected, to
// find the true peak before locking in that strike's value.
const PUNCH_WINDOW_MS = 250;

let comboWindowRecording = false;
let comboWindowStart = 0;
let comboBuffer = [];

// --- UI ROUTING & SETUP ---
function renderComboSelectionScreen() {
    const container = document.getElementById('combo-list-container');
    if (!container) return; // Fail gracefully if UI isn't built yet

    container.innerHTML = COMBOS.map(c => `
        <div class="punch-card" onclick="window.selectCombo('${c.id}')" style="margin-bottom:10px; cursor:pointer;">
            <div class="pc-name" style="color:var(--blue); font-weight: 800;">${c.name}</div>
            <div class="pc-desc" style="font-size: 13px; color: var(--text-muted);">${c.desc}</div>
        </div>
    `).join('');
    
    if (typeof window.goTo === 'function') window.goTo('screen-combo-select');
}

function selectCombo(comboId) {
    comboState.activeCombo = COMBOS.find(c => c.id === comboId);
    
    const panel = document.getElementById('combo-setup-panel');
    const nameEl = document.getElementById('panel-combo-name');
    const descEl = document.getElementById('panel-combo-desc');
    const seqEl = document.getElementById('panel-combo-sequence');

    if (panel) panel.style.display = 'block';
    if (nameEl) nameEl.textContent = comboState.activeCombo.name;
    if (descEl) descEl.textContent = comboState.activeCombo.desc;
    if (seqEl) seqEl.textContent = `PATTERN: ${comboState.activeCombo.sequence.join(' -> ').toUpperCase()}`;
}

// --- EXECUTION ENGINE ---
function startComboExecution() {
    // 1. Reset state
    comboState.isTracking = true; 
    comboState.currentStepIndex = 0; 
    comboState.timestamps = []; 
    comboState.forces = []; 
    comboState.peakAccels = [];
    
    // Ensure state object exists (from app.js)
    if (typeof state !== 'undefined') {
        state.hasGravityEstimate = false;
        state.armed = false;
    }

    // 2. Route UI
    if (typeof window.goTo === 'function') window.goTo('screen-combo-measure');
    
    const targetEl = document.getElementById('combo-target-punch');
    const indicatorEl = document.getElementById('combo-step-indicator');
    if (targetEl) targetEl.textContent = "STANDBY";
    if (indicatorEl) indicatorEl.textContent = "ZEROING TRACKER...";

    // 3. Mount Physics Engine safely
    window.removeEventListener('devicemotion', handleComboMotion);
    window.addEventListener('devicemotion', handleComboMotion);
    
    setTimeout(() => { 
        if (typeof state !== 'undefined') state.armed = true; 
        triggerNextComboPrompt(); 
    }, 1200);
}

function triggerNextComboPrompt() {
    const cur = comboState.activeCombo.sequence[comboState.currentStepIndex];
    const punchConfig = typeof PUNCH_TYPES !== 'undefined' ? PUNCH_TYPES.find(p => p.id === cur) : null;
    
    const targetEl = document.getElementById('combo-target-punch');
    const indicatorEl = document.getElementById('combo-step-indicator');

    if (targetEl && punchConfig) targetEl.textContent = punchConfig.name.toUpperCase();
    if (indicatorEl) indicatorEl.textContent = `STRIKE ${comboState.currentStepIndex + 1}`;
    
    comboState.promptTime = performance.now();
}

// --- SENSOR PROCESSING ---
function getLinearAccel(event) {
    const gAcc = event.accelerationIncludingGravity;
    if (!gAcc || gAcc.x === null) return null;

    const rawAccel = event.acceleration;
    if (rawAccel && rawAccel.x !== null) {
        return { x: rawAccel.x, y: rawAccel.y, z: rawAccel.z };
    }

    // Fallback for missing LinearAccelerationSensor
    const alpha = 0.85;
    if (typeof state !== 'undefined') {
        if (!state.hasGravityEstimate) {
            state.gravity = { x: gAcc.x, y: gAcc.y, z: gAcc.z };
            state.hasGravityEstimate = true;
        } else {
            state.gravity.x = alpha * state.gravity.x + (1 - alpha) * gAcc.x;
            state.gravity.y = alpha * state.gravity.y + (1 - alpha) * gAcc.y;
            state.gravity.z = alpha * state.gravity.z + (1 - alpha) * gAcc.z;
        }

        return {
            x: gAcc.x - state.gravity.x,
            y: gAcc.y - state.gravity.y,
            z: gAcc.z - state.gravity.z
        };
    }
    return { x: 0, y: 0, z: 0 };
}

function filterSignalNoise(rawMag) {
    const offset = typeof state !== 'undefined' ? (state.zeroZoneOffset || 3.2) : 3.2;
    return Math.max(0, rawMag - offset);
}

function handleComboMotion(event) {
    if (!comboState.isTracking) return;
    
    const rawAccel = getLinearAccel(event);
    if (!rawAccel) return;
    
    const filteredMag = filterSignalNoise(Math.sqrt(rawAccel.x**2 + rawAccel.y**2 + rawAccel.z**2));
    
    const liveEl = document.getElementById('combo-live-accel');
    if (liveEl) liveEl.textContent = filteredMag.toFixed(1);
    
    const currentTime = performance.now();
    const isSystemArmed = typeof state !== 'undefined' ? state.armed : true;

    // Trigger Detection
    const threshold = typeof TRIGGER_THRESHOLD !== 'undefined' ? TRIGGER_THRESHOLD : 18.0;
    if (filteredMag > threshold && !comboWindowRecording && isSystemArmed) {
        comboWindowRecording = true; 
        comboWindowStart = currentTime; 
        comboBuffer = [];
    }

    // Kinetic Flight Processing
    if (comboWindowRecording) {
        comboBuffer.push(filteredMag);
        
        if (currentTime - comboWindowStart >= PUNCH_WINDOW_MS) {
            comboWindowRecording = false;
            
            let peak = Math.max(...comboBuffer.slice(Math.floor(comboBuffer.length * 0.2)));
            if (peak === 0 || peak === -Infinity) peak = Math.max(...comboBuffer);
            
            comboState.timestamps.push(currentTime);
            
            const cur = comboState.activeCombo.sequence[comboState.currentStepIndex];
            const punchConfig = typeof PUNCH_TYPES !== 'undefined' ? PUNCH_TYPES.find(p => p.id === cur) : { fraction: 0.045 };
            const bodyWeight = typeof state !== 'undefined' ? state.bodyWeight : 70;
            
            // F = ma approximation
            comboState.forces.push((bodyWeight * punchConfig.fraction + 0.35) * peak);
            comboState.peakAccels.push(peak);
            
            if (navigator.vibrate) navigator.vibrate(100);
            
            comboState.currentStepIndex++;

            if (comboState.currentStepIndex < comboState.activeCombo.sequence.length) {
                triggerNextComboPrompt();
            } else {
                // Combo Complete
                comboState.isTracking = false; 
                window.removeEventListener('devicemotion', handleComboMotion);
                calculateComboMetrics();
            }
        }
    }
}

// --- RESULTS MATH ---
function calculateComboMetrics() {
    if (comboState.timestamps.length === 0) return;

    const lat = (comboState.timestamps[0] - comboState.promptTime) / 1000;
    const dur = (comboState.timestamps[comboState.timestamps.length - 1] - comboState.timestamps[0]) / 1000;
    const totalF = comboState.forces.reduce((a, b) => a + b, 0);
    
    comboState.results = { 
        latency: lat, 
        totalDuration: dur, 
        totalForce: totalF 
    };
    
    const forceEl = document.getElementById('cb-res-force');
    const latEl = document.getElementById('cb-res-latency');
    const durEl = document.getElementById('cb-res-duration');
    const sustEl = document.getElementById('cb-res-sustenance');

    if (forceEl) forceEl.textContent = Math.round(comboState.results.totalForce);
    if (latEl) latEl.textContent = comboState.results.latency.toFixed(3);
    if (durEl) durEl.textContent = comboState.results.totalDuration.toFixed(3);
    if (sustEl) sustEl.textContent = "88"; // Hardcoded placeholder logic retained
    
    if (typeof window.goTo === 'function') window.goTo('screen-combo-results');
}

// --- GLOBAL EXPORTS ---
window.renderComboSelectionScreen = renderComboSelectionScreen;
window.selectCombo = selectCombo;
window.startComboExecution = startComboExecution;