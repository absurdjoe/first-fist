// --- UI & DOM MANIPULATION ENGINE ---

// Utility to prevent HTML injection when rendering local storage data
function escapeHTML(val) {
    // If the value is missing entirely, return a safe fallback
    if (val === null || val === undefined) return '';
    
    // Force numbers into strings safely before scanning
    return String(val).replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Basic Screen Routing
function goTo(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
}

// Renders the punch type selection grid in the Profile tab
function renderPunchSelectionGrid() {
    const grid = document.getElementById('punch-grid');
    if (!grid || typeof PUNCH_TYPES === 'undefined' || typeof state === 'undefined') return;
    
    grid.innerHTML = "";

    PUNCH_TYPES.forEach(punch => {
        const isSelected = state.punchType === punch.id ? 'selected' : '';
        const item = document.createElement('div');
        item.className = `vector-option ${isSelected}`;
        
        // Using innerHTML is safe here because PUNCH_TYPES is a hardcoded trusted constant
        item.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${punch.icon}</svg>
            <h4>${punch.name}</h4>
        `;
        item.onclick = () => { 
            state.punchType = punch.id; 
            localStorage.setItem('ff_vector', punch.id);
            renderPunchSelectionGrid(); 
        };
        grid.appendChild(item);
    });
}

// Updates the circular gauge during calibration/arming
function updateLiveGauge(mag) {
    const pctEl = document.getElementById('main-pct');
    const fillEl = document.getElementById('main-fill');
    if (!pctEl || !fillEl) return;
    
    let pct = Math.max(0, Math.min(100, Math.round((mag / 110) * 100)));
    pctEl.textContent = pct + '%';
    
    const offset = 565.4 * (1 - pct / 100);
    fillEl.style.strokeDashoffset = offset;
    fillEl.style.stroke = pct > 10 ? 'var(--accent)' : 'rgba(255,255,255,0.15)';
}

// Populates the Final Result screen after a punch
function populateMetricsUI(metricsData, effectiveMass, punchName) {
    const safeForce = Math.round(metricsData.force);
    const safeMass = effectiveMass.toFixed(2);
    const safeVelocity = typeof state !== 'undefined' ? state.maxVelocity.toFixed(2) : "0.00";
    
    document.getElementById('main-pct').textContent = metricsData.scorePct + '%';
    document.getElementById('main-pct').style.color = metricsData.color;
    
    const fillEl = document.getElementById('main-fill');
    if (fillEl) {
        fillEl.style.stroke = metricsData.color;
        fillEl.style.strokeDashoffset = 565.4 * (1 - metricsData.scorePct/100);
    }
    
    const resultScoreEl = document.getElementById('result-score');
    if (resultScoreEl) {
        resultScoreEl.textContent = metricsData.scorePct;
        resultScoreEl.style.color = metricsData.color;
    }
    
    document.getElementById('bd-force').textContent = safeForce + ' N';
    document.getElementById('bd-mass').textContent = safeMass + ' kg';
    document.getElementById('bd-type').textContent = escapeHTML(punchName);
    document.getElementById('bd-velocity').textContent = safeVelocity + ' m/s';

    // DYNAMIC GAMIFICATION LOGIC
    const btn = document.getElementById('btn-submit-score');
    const msg = document.getElementById('upload-status-msg');
    if (msg) msg.textContent = "";

    const highestSubmitted = parseInt(localStorage.getItem('ff_submitted_best') || '0', 10);

    if (btn) {
        if (metricsData.scorePct > highestSubmitted) {
            btn.style.display = 'block';
            btn.disabled = false;
            btn.textContent = highestSubmitted === 0 ? "Submit Initial Score" : "Submit New High Score 🚀";
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        } else {
            btn.style.display = 'block';
            btn.disabled = true;
            btn.textContent = `Must beat ${highestSubmitted}% to update Rank`;
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
        }
    }
}

// Populates the history feed and lifetime stats in the Profile screen
function renderProfileHistory() {
    const totalPunches = localStorage.getItem('ff_total_punches') || '0';
    const personalBest = localStorage.getItem('ff_personal_best') || '0';
    
    const totalEl = document.getElementById('stat-total-punches');
    const pbEl = document.getElementById('stat-personal-best');
    
    if (totalEl) totalEl.textContent = escapeHTML(totalPunches);
    if (pbEl) pbEl.textContent = escapeHTML(personalBest) + '%';

    const historyList = document.getElementById('history-list');
    if (!historyList) return;

    const history = JSON.parse(localStorage.getItem('ff_history')) || [];
    historyList.innerHTML = "";

    if (history.length === 0) {
        historyList.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px; font-size:13px;">No strikes logged yet.</div>`;
        return;
    }

    history.forEach((punch) => {
        const safeVector = escapeHTML(punch.vector);
        const safeDate = escapeHTML(punch.date);
        const safeScore = escapeHTML(punch.score);
        const safeForce = escapeHTML(punch.force);
        const safeColor = escapeHTML(punch.color);

        const row = document.createElement('div');
        row.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 12px; margin-bottom: 8px;`;
        
        row.innerHTML = `
            <div>
                <div style="font-weight: 700; font-size: 14px; margin-bottom: 2px;">${safeVector}</div>
                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${safeDate}</div>
            </div>
            <div style="text-align: right;">
                <div class="mono-metrics" style="font-weight: 800; color: ${safeColor}; font-size: 18px; line-height: 1;">${safeScore}%</div>
                <div class="mono-metrics" style="font-size: 10px; color: var(--text-muted);">${safeForce} N</div>
            </div>
        `;
        historyList.appendChild(row);
    });
}

// Renders the shareable performance card
function generateScorecard() {
    const canvas = document.getElementById('scorecard-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const score = (typeof state !== 'undefined' && state.lastMetrics) ? state.lastMetrics.scorePct : 0;
    const username = window.isLoggedIn ? (localStorage.getItem('ff_username') || 'FIGHTER') : 'GUEST FIGHTER';

    // Background & Border
    ctx.fillStyle = '#06070a';
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 25;
    ctx.strokeRect(30, 30, 1020, 1860);

    // Text & Data Rendering Function
    const drawTextData = () => {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 350px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(score + '%', 540, 800);
        
        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 60px sans-serif';
        ctx.fillText('POWER RATING', 540, 900);

        ctx.fillStyle = '#ffffff';
        ctx.font = '50px sans-serif';
        ctx.fillText(`FIGHTER: ${username.toUpperCase()}`, 540, 1150);
        
        ctx.fillStyle = '#ffd700'; 
        ctx.font = 'bold 60px sans-serif';
        const rankText = (window.isLoggedIn && typeof state !== 'undefined' && state.lastRank) ? `GLOBAL RANK: #${state.lastRank}` : 'GLOBAL RANK: UNRANKED';
        ctx.fillText(rankText, 540, 1300);

        ctx.fillStyle = '#535a70';
        ctx.font = '40px sans-serif';
        ctx.fillText('MEASURE YOUR STRIKE AT:', 540, 1700);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 50px sans-serif';
        ctx.fillText('FIRST-FIST.VERCEL.APP', 540, 1760);

        // Trigger Download
        try {
            const dataURL = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = 'first-fist-promo.png';
            link.href = dataURL;
            link.click();
        } catch (e) {
            console.error("Scorecard export failed:", e);
        }
    };

    // Attempt to load the logo, fallback if missing
    const logo = new Image();
    logo.crossOrigin = "Anonymous"; // Prevents canvas tainting if logo is on a CDN
    logo.onload = () => {
        ctx.drawImage(logo, 390, 100, 300, 300);
        drawTextData();
    };
    logo.onerror = () => {
        console.warn("Could not load logo.png for scorecard. Generating without logo.");
        drawTextData();
    };
    
    logo.src = 'logo.png'; 
}

// --- EXPORT TO GLOBAL WINDOW OBJECT ---
window.goTo = goTo;
window.renderPunchSelectionGrid = renderPunchSelectionGrid;
window.updateLiveGauge = updateLiveGauge;
window.populateMetricsUI = populateMetricsUI;
window.renderProfileHistory = renderProfileHistory;
window.generateScorecard = generateScorecard;