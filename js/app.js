// --- CORE STATE & CONFIG ---
const state = { 
    bodyWeight: 70, 
    punchType: 'cross', 
    peak: 0, 
    maxVelocity: 0, 
    armed: false, 
    capturing: false, 
    gravity: { x: 0, y: 0, z: 0 }, 
    hasGravityEstimate: false, 
    punchCount: 0, 
    bestPct: 0, 
    isCalibrating: false, 
    zeroZoneOffset: 3.2,
    lastMetrics: null, 
    lastRank: null,
    lastPunchConfidence: null // Added for sensor impact tracking
};

const PUNCH_TYPES = [
    { id: 'jab', name: 'Jab', desc: 'Lead linear snap strike', fraction: 0.030, icon: '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="14,6 20,12 14,18"/>' },
    { id: 'cross', name: 'Cross', desc: 'Rear kinetic chain punch', fraction: 0.045, icon: '<line x1="4" y1="20" x2="20" y2="4"/><polyline points="12,4 20,4 20,12"/>' }
];

// --- APP INITIALIZATION ---
function loadLocalProfile() {
    // Sync with the new username paradigm
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
    
    if (savedVector) { 
        state.punchType = savedVector; 
    }

    updateTabBarVisuals();
}

function updateHomeDashboard() {
    // 1. Update the Greeting
    const usernameDisplay = document.getElementById('home-username');
    if (usernameDisplay) {
        const username = localStorage.getItem('ff_username') || 'Guest Fighter';
        usernameDisplay.textContent = window.isLoggedIn ? username.toUpperCase() : 'GUEST FIGHTER';
    }
    
    // 2. Calculate and Update Stats
    const totalPunches = parseInt(localStorage.getItem('ff_total_punches') || '0', 10);
    const pbScore = localStorage.getItem('ff_personal_best') || '0';
    
    document.getElementById('home-total').textContent = totalPunches;
    document.getElementById('home-pb').textContent = pbScore + '%';

    // Calculate Average Force from History
    const history = JSON.parse(localStorage.getItem('ff_history')) || [];
    let avgForce = 0;
    if (history.length > 0) {
        const totalForce = history.reduce((sum, punch) => sum + (Number(punch.force) || 0), 0);
        avgForce = Math.round(totalForce / history.length);
    }
    document.getElementById('home-avg').textContent = avgForce > 0 ? avgForce + ' N' : '-- N';

    // Toggle Empty State Message
    const statsGrid = document.getElementById('home-stats-grid');
    const emptyState = document.getElementById('home-empty-state');
    if (totalPunches === 0) {
        if (statsGrid) statsGrid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
    } else {
        if (statsGrid) statsGrid.style.display = 'grid';
        if (emptyState) emptyState.style.display = 'none';
    }

    // 3. Conditional UI Rendering based on Auth State
    const heroLoginBtn = document.getElementById('hero-login-btn');
    const competitiveCard = document.getElementById('home-competitive-card');
    
    if (window.isLoggedIn) {
        if (heroLoginBtn) heroLoginBtn.style.display = 'none';
        if (competitiveCard) competitiveCard.style.display = 'none';
    } else {
        if (heroLoginBtn) heroLoginBtn.style.display = 'block';
        if (competitiveCard) competitiveCard.style.display = 'block';
    }
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

// Locks/unlocks the Rankings and Profile tabs based on login state
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
        } catch (e) { 
            console.error(e); 
        }
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
    state.peak = 0; 
    state.maxVelocity = 0; 
    state.capturing = false; 
    state.armed = false;
    state.isCalibrating = true; 
    state.zeroZoneOffset = 3.2; 
    
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
    
    // 1. NEW LOGIC: Auto-Detect Punch Type from axes
    const detectedPunch = (typeof window.detectPunchClass === 'function') 
        ? window.detectPunchClass(state.peakX, state.peakY, state.peakZ) 
        : { name: "STRAIGHT", massFraction: 0.050 };

    // 2. Use detected mass fraction
    const weightInput = document.getElementById('input-weight');
    const userWeight = weightInput ? parseFloat(weightInput.value) : state.bodyWeight;
    const effectiveMass = userWeight * detectedPunch.massFraction + 0.35;
    
    const metricsData = (typeof calculatePunchPower === 'function') ? calculatePunchPower(state.peak, effectiveMass) : { scorePct: 0, force: 0 };
    metricsData.stability = finalStability; 
    
    // 3. Update Results UI with the auto-detected name
    const typeUI = document.getElementById('bd-type');
    if (typeUI) typeUI.textContent = detectedPunch.name;

    if (typeof logTelemetry === 'function') window.logTelemetry(metricsData);
    if (typeof populateMetricsUI === 'function') populateMetricsUI(metricsData, effectiveMass, detectedPunch.name);
    state.lastMetrics = metricsData;
    
    if (typeof savePunchToHistory === 'function') savePunchToHistory(metricsData, detectedPunch.name);
    if (typeof goTo === 'function') goTo('screen-result');

    if (!window.isLoggedIn) {
        setTimeout(() => {
            if (typeof window.showLoginModal === 'function') {
                window.showLoginModal("Great strike! Sign in with Google to push your score to the Global Leaderboard.");
            }
        }, 1200);
    }

    if (window.evaluateAcademyGoal && state.maxVelocity) {
        window.evaluateAcademyGoal(metricsData, state.maxVelocity);
    }
}

function remeasure() { 
    if (typeof goTo === 'function') goTo('screen-measure'); 
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

// --- EXPORT TO GLOBAL WINDOW OBJECT ---
window.switchTab = switchTab;
window.enableSensors = enableSensors;
window.remeasure = remeasure;
window.updateHomeDashboard = updateHomeDashboard;
window.updateTabBarVisuals = updateTabBarVisuals;

// --- BOOT SEQUENCE ---
document.addEventListener('DOMContentLoaded', () => { 
    loadLocalProfile();
    
    if (typeof renderPunchSelectionGrid === 'function') renderPunchSelectionGrid(); 
    
    // Safety check in case they reload on the leaderboard page
    if (document.getElementById('screen-leaderboard').classList.contains('active')) {
        if (typeof window.fetchOnlineLeaderboard === 'function') window.fetchOnlineLeaderboard(); 
    }
    
    if (typeof renderProfileHistory === 'function') renderProfileHistory();

    // Event Listener for the weight input field
    const weightInput = document.getElementById('input-weight');
    if (weightInput) {
        weightInput.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val > 0) {
                state.bodyWeight = val;
                localStorage.setItem('ff_weight', val);
            }
        });
    }
});

// =========================================
// ACADEMY & PROGRESSION ENGINE (V0)
// =========================================

const ACADEMY_LEVELS = [
    { id: 1, title: "The Heavy Hand", desc: "Control: Score exactly between 30% and 50% power.", target: 3, type: 'control', min: 30, max: 50 },
    { id: 2, title: "The Viper", desc: "Speed: Achieve a max velocity of 8.0 m/s or higher.", target: 1, type: 'speed', minVel: 8.0 },
    { id: 3, title: "The Metronome", desc: "Consistency: Throw heavy punches (over 60%) to prove repeatability.", target: 3, type: 'consistency', minPower: 60 },
    { id: 4, title: "Coming Soon", desc: "More challenges in development.", target: 1, type: 'locked' }
];

function getAcademyState() {
    return JSON.parse(localStorage.getItem('ff_academy')) || { level: 1, progress: 0 };
}

function saveAcademyState(state) {
    localStorage.setItem('ff_academy', JSON.stringify(state));
    renderAcademy();
}

function renderAcademy() {
    const container = document.getElementById('academy-map-container');
    if (!container) return;
    
    let state = getAcademyState();
    container.innerHTML = "";

    ACADEMY_LEVELS.forEach(lvl => {
        let statusClass = "locked";
        let progressPct = 0;
        let iconHtml = lvl.id;

        if (lvl.id < state.level) {
            statusClass = "completed";
            progressPct = 100;
            iconHtml = "✓";
        } else if (lvl.id === state.level) {
            statusClass = "active";
            progressPct = (state.progress / lvl.target) * 100;
        }

        const node = document.createElement('div');
        node.className = `level-node ${statusClass}`;
        node.innerHTML = `
            <div class="node-icon">${iconHtml}</div>
            <div class="node-content">
                <div class="node-title">${lvl.id}. ${lvl.title}</div>
                <div class="node-desc">${lvl.desc}</div>
                ${statusClass !== 'locked' && lvl.type !== 'locked' ? `
                    <div class="node-progress">
                        <div class="node-progress-fill" style="width: ${progressPct}%;"></div>
                    </div>
                    <div style="font-size: 10px; color: var(--text-muted); text-align: right; margin-top: 4px; font-weight: 700;">
                        ${statusClass === 'completed' ? 'COMPLETED' : `${state.progress} / ${lvl.target}`}
                    </div>
                ` : ''}
            </div>
        `;
        container.appendChild(node);
    });
}

// Hook that evaluates the punch after it's processed
function evaluateAcademyGoal(metricsData, maxVelocity) {
    let state = getAcademyState();
    if (state.level >= ACADEMY_LEVELS.length) return; // Reached "Coming Soon"

    const currentLevel = ACADEMY_LEVELS[state.level - 1];
    let success = false;

    // Evaluate Criteria
    if (currentLevel.type === 'control') {
        if (metricsData.scorePct >= currentLevel.min && metricsData.scorePct <= currentLevel.max) success = true;
    } else if (currentLevel.type === 'speed') {
        if (maxVelocity >= currentLevel.minVel) success = true;
    } else if (currentLevel.type === 'consistency') {
        if (metricsData.scorePct >= currentLevel.minPower) success = true;
    }

    if (success) {
        state.progress += 1;
        if (state.progress >= currentLevel.target) {
            // Level Up Condition Met!
            state.level += 1;
            state.progress = 0;
            saveAcademyState(state);
            
            // Show celebration modal after a short delay so the user sees their score first
            setTimeout(() => {
                document.getElementById('levelup-msg').textContent = `You passed Level ${currentLevel.id}: ${currentLevel.title}`;
                document.getElementById('levelup-modal').style.display = 'flex';
            }, 1000);
        } else {
            saveAcademyState(state);
        }
    }
}

// Make globally available
window.renderAcademy = renderAcademy;
window.evaluateAcademyGoal = evaluateAcademyGoal;

// =========================================
// PWA INSTALLATION ENGINE
// =========================================
let deferredInstallPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome's default mini-infobar from appearing
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredInstallPrompt = e;
    
    // Unhide our custom install button in the Setup tab
    const installCard = document.getElementById('install-card');
    if (installCard) installCard.style.display = 'block';
});

window.triggerAppInstall = async function() {
    if (!deferredInstallPrompt) return;
    
    // Show the native install prompt
    deferredInstallPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredInstallPrompt.userChoice;
    
    if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
        // Hide the button once installed
        document.getElementById('install-card').style.display = 'none';
    }
    
    // We can't use the prompt again, so discard it
    deferredInstallPrompt = null;
};