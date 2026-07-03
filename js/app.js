// --- CORE STATE & CONFIG ---
const state = { 
    bodyWeight: 70, punchType: 'cross', peak: 0, maxVelocity: 0, 
    armed: false, capturing: false, gravity: { x: 0, y: 0, z: 0 }, hasGravityEstimate: false, 
    punchCount: 0, bestPct: 0, isCalibrating: false, zeroZoneOffset: 3.2,
    lastMetrics: null, lastRank: null
};

const PUNCH_TYPES = [
    { id: 'jab', name: 'Jab', desc: 'Lead linear snap strike', fraction: 0.030, icon: '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="14,6 20,12 14,18"/>' },
    { id: 'cross', name: 'Cross', desc: 'Rear kinetic chain punch', fraction: 0.045, icon: '<line x1="4" y1="20" x2="20" y2="4"/><polyline points="12,4 20,4 20,12"/>' }
];

// --- APP INITIALIZATION ---
function loadLocalProfile() {
    const savedUsername = localStorage.getItem('ff_username');
    window.isLoggedIn = !!savedUsername; 
    
    switchTab('screen-home'); 
    
    const savedWeight = localStorage.getItem('ff_weight');
    const savedVector = localStorage.getItem('ff_vector');

    if (savedWeight) {
        state.bodyWeight = parseFloat(savedWeight);
        const weightInput = document.getElementById('input-weight');
        if (weightInput) weightInput.value = savedWeight;
    }
    if (savedVector) { state.punchType = savedVector; }

    updateTabBarVisuals(); // <-- was never called before
}

function updateHomeDashboard() {
    // UPDATED: Targeting the new home-username ID and ff_username storage key
    const usernameDisplay = document.getElementById('home-username');
    if (usernameDisplay) {
        usernameDisplay.textContent = window.isLoggedIn ? localStorage.getItem('ff_username').toUpperCase() : 'GUEST FIGHTER';
    }
    document.getElementById('home-total').textContent = localStorage.getItem('ff_total_punches') || '0';
    document.getElementById('home-pb').textContent = (localStorage.getItem('ff_personal_best') || '0') + '%';
}

// --- TAB ROUTING & GUEST LOCK ---
function switchTab(screenId) {
    if (!window.isLoggedIn && (screenId === 'screen-leaderboard' || screenId === 'screen-setup')) {
        if (typeof window.showLoginModal === 'function') {
            window.showLoginModal("Sign in to view global rankings and your fighter profile.");
        }
        return; 
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');

    const navId = screenId.replace('screen-', 'tab-nav-');
    const navItem = document.getElementById(navId);
    if (navItem) navItem.classList.add('active');

    if (screenId === 'screen-home') updateHomeDashboard();
}

// --- SENSOR ARMING & CAPTURE ---
async function enableSensors() {
    window.removeEventListener('devicemotion', handleMotion);
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const status = await DeviceMotionEvent.requestPermission();
            if (status === 'granted') {
                window.addEventListener('devicemotion', handleMotion, true);
                setupSensorSuccess();
            } else {
                alert("Please grant motion sensor permissions to track punches.");
            }
        } catch (e) { console.error(e); }
    } else {
        window.addEventListener('devicemotion', handleMotion, true);
        setupSensorSuccess();
    }
}

function setupSensorSuccess() {
    if (typeof goTo === 'function') goTo('screen-measure'); 
    executeArmingProtocol();
}

function executeArmingProtocol() {
    state.peak = 0; state.maxVelocity = 0; state.capturing = false; state.armed = false;
    state.isCalibrating = true; state.zeroZoneOffset = 3.2; 
    
    if (typeof stabilityBuffer !== 'undefined') stabilityBuffer = [];
    if (typeof resetSensorBuffers === 'function') resetSensorBuffers();

    const tag = document.getElementById('status-tag');
    const hint = document.getElementById('measure-hint');
    const msg = document.getElementById('upload-status-msg');
    
    if (tag) { tag.className = 'status-tag standby'; tag.textContent = 'CALIBRATING...'; }
    if (hint) hint.textContent = 'KEEP HAND STEADY — Zeroing muscular noise';
    if (msg) msg.textContent = "";

    setTimeout(() => {
        if (document.getElementById('screen-measure').classList.contains('active')) {
            state.isCalibrating = false; 
            
            if (typeof calibrationBuffer !== 'undefined' && calibrationBuffer.length > 0) {
                const total = calibrationBuffer.reduce((sum, val) => sum + val, 0);
                state.zeroZoneOffset = Math.max(3.2, (total / calibrationBuffer.length) + 0.5);
            }

            if (tag) { tag.className = 'status-tag armed'; tag.textContent = 'SYSTEM ARMED'; }
            if (hint) hint.textContent = '🥊 STRIKE NOW ON VIBRATION!';
            
            if (navigator.vibrate) navigator.vibrate(200); 
            state.armed = true;
        }
    }, 1500); 
}

function finalizeCapture() {
    state.armed = false;
    state.capturing = false; 

    const finalStability = (typeof calculateStability === 'function' && typeof stabilityBuffer !== 'undefined') ? calculateStability(stabilityBuffer) : 100;
    
    const config = PUNCH_TYPES.find(p => p.id === state.punchType);
    const weightInput = document.getElementById('input-weight');
    const userWeight = weightInput ? parseFloat(weightInput.value) : state.bodyWeight;
    const effectiveMass = userWeight * config.fraction + 0.35;
    
    const metricsData = (typeof calculatePunchPower === 'function') ? calculatePunchPower(state.peak, effectiveMass) : { scorePct: 0, force: 0 };
    metricsData.stability = finalStability; 
    
    if (typeof logTelemetry === 'function') logTelemetry(metricsData);
    
    if (typeof populateMetricsUI === 'function') populateMetricsUI(metricsData, effectiveMass, config.name);
    state.lastMetrics = metricsData;
    
    if (typeof savePunchToHistory === 'function') savePunchToHistory(metricsData, config.name);
    
    goTo('screen-result');

    // Automatically prompt guests to sign in after viewing their score
    if (!window.isLoggedIn) {
        setTimeout(() => {
            if (typeof window.showLoginModal === 'function') {
                window.showLoginModal("Great strike! Sign in with Google to push your score to the Global Leaderboard.");
            }
        }, 1200);
    } else {
        // Automatically reveal the submit button if they are already logged in
        const btn = document.getElementById('btn-submit-score');
        if (btn) btn.style.display = 'inline-block';
    }
}

function remeasure() { 
    goTo('screen-measure'); 
    executeArmingProtocol(); 
}

// --- LOCAL HISTORY ---
function savePunchToHistory(metrics, vectorName) {
    let history = JSON.parse(localStorage.getItem('ff_history')) || [];
    
    const newPunch = {
        id: Date.now(),
        date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        score: metrics.scorePct,
        force: Math.round(metrics.force),
        vector: vectorName,
        color: metrics.color || '#fff'
    };
    
    history.unshift(newPunch); 
    if (history.length > 30) history.pop(); 
    localStorage.setItem('ff_history', JSON.stringify(history));
    
    let totalPunches = parseInt(localStorage.getItem('ff_total_punches') || '0') + 1;
    let personalBest = parseInt(localStorage.getItem('ff_personal_best') || '0');
    if (metrics.scorePct > personalBest) personalBest = metrics.scorePct;
    
    localStorage.setItem('ff_total_punches', totalPunches.toString());
    localStorage.setItem('ff_personal_best', personalBest.toString());

    if (typeof renderProfileHistory === 'function') renderProfileHistory();
}

// Add this helper to app.js
function updateTabBarVisuals() {
    const tabs = ['tab-nav-leaderboard', 'tab-nav-setup'];
    tabs.forEach(tabId => {
        const el = document.getElementById(tabId);
        if (!el) return;
        
        if (!window.isLoggedIn) {
            el.classList.add('locked');
        } else {
            el.classList.remove('locked');
        }
    });
}

// Call this inside loadLocalProfile() and in your Auth Listener

// --- BOOT SEQUENCE ---
document.addEventListener('DOMContentLoaded', () => { 
    loadLocalProfile();
    if (typeof renderPunchSelectionGrid === 'function') renderPunchSelectionGrid(); 
    
    // Safety check in case they reload on the leaderboard page
    if (document.getElementById('screen-leaderboard').classList.contains('active')) {
        fetchOnlineLeaderboard(); 
    }
    
    if (typeof renderProfileHistory === 'function') renderProfileHistory();
});