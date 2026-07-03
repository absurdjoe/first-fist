// --- UI & DOM MANIPULATION ENGINE ---

// Basic Screen Routing
function goTo(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if(target) target.classList.add('active');
}

// Renders the punch type selection grid in the Profile tab
function renderPunchSelectionGrid() {
    const grid = document.getElementById('punch-grid');
    if (!grid) return;
    grid.innerHTML = "";

    PUNCH_TYPES.forEach(punch => {
        const isSelected = state.punchType === punch.id ? 'selected' : '';
        const item = document.createElement('div');
        item.className = `vector-option ${isSelected}`;
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
    document.getElementById('main-pct').textContent = metricsData.scorePct + '%';
    document.getElementById('main-pct').style.color = metricsData.color;
    document.getElementById('main-fill').style.stroke = metricsData.color;
    document.getElementById('main-fill').style.strokeDashoffset = 565.4 * (1 - metricsData.scorePct/100);
    
    document.getElementById('result-score').textContent = metricsData.scorePct;
    document.getElementById('result-score').style.color = metricsData.color;
    
    document.getElementById('bd-force').textContent = Math.round(metricsData.force) + ' N';
    document.getElementById('bd-mass').textContent = effectiveMass.toFixed(2) + ' kg';
    document.getElementById('bd-type').textContent = punchName;
    document.getElementById('bd-velocity').textContent = state.maxVelocity.toFixed(2) + ' m/s';

    // DYNAMIC GAMIFICATION LOGIC
    const btn = document.getElementById('btn-submit-score');
    const msg = document.getElementById('upload-status-msg');
    if (msg) msg.textContent = "";

    const highestSubmitted = parseInt(localStorage.getItem('ff_submitted_best') || '0');

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
    
    if (totalEl) totalEl.textContent = totalPunches;
    if (pbEl) pbEl.textContent = personalBest + '%';

    const historyList = document.getElementById('history-list');
    if (!historyList) return;

    const history = JSON.parse(localStorage.getItem('ff_history')) || [];
    historyList.innerHTML = "";

    if (history.length === 0) {
        historyList.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px; font-size:13px;">No strikes logged yet.</div>`;
        return;
    }

    history.forEach((punch) => {
        const row = document.createElement('div');
        row.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 12px; margin-bottom: 8px;`;
        
        row.innerHTML = `
            <div>
                <div style="font-weight: 700; font-size: 14px; margin-bottom: 2px;">${punch.vector}</div>
                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${punch.date}</div>
            </div>
            <div style="text-align: right;">
                <div class="mono-metrics" style="font-weight: 800; color: ${punch.color}; font-size: 18px; line-height: 1;">${punch.score}%</div>
                <div class="mono-metrics" style="font-size: 10px; color: var(--text-muted);">${punch.force} N</div>
            </div>
        `;
        historyList.appendChild(row);
    });
}

// Renders the shareable performance card
async function generateScorecard() {
    const canvas = document.getElementById('scorecard-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const score = state.lastMetrics ? state.lastMetrics.scorePct : 0;
    
    // UPDATED: Syncing with window.isLoggedIn and ff_username
    const username = window.isLoggedIn ? (localStorage.getItem('ff_username') || 'FIGHTER') : 'GUEST FIGHTER';

    ctx.fillStyle = '#06070a';
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 25;
    ctx.strokeRect(30, 30, 1020, 1860);

    const logo = new Image();
    logo.src = 'logo.png'; 
    
    logo.onload = () => {
        ctx.drawImage(logo, 390, 100, 300, 300);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 350px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(score + '%', 540, 800);
        
        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 60px sans-serif';
        ctx.fillText('POWER RATING', 540, 900);

        ctx.fillStyle = '#ffffff';
        ctx.font = '50px sans-serif';
        // Displaying username here
        ctx.fillText(`FIGHTER: ${username.toUpperCase()}`, 540, 1150);
        
        ctx.fillStyle = '#ffd700'; 
        ctx.font = 'bold 60px sans-serif';
        const rankText = (window.isLoggedIn && state.lastRank) ? `GLOBAL RANK: #${state.lastRank}` : 'GLOBAL RANK: UNRANKED';
        ctx.fillText(rankText, 540, 1300);

        ctx.fillStyle = '#535a70';
        ctx.font = '40px sans-serif';
        ctx.fillText('MEASURE YOUR STRIKE AT:', 540, 1700);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 50px sans-serif';
        ctx.fillText('FIRST-FIST.VERCEL.APP', 540, 1760);

        const dataURL = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'first-fist-promo.png';
        link.href = dataURL;
        link.click();
    };
}