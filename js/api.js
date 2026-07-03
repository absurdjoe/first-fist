// --- NETWORK & API ENGINE ---

// Utility to prevent XSS injections from maliciously crafted usernames
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
async function fetchOnlineLeaderboard() {
    const listContainer = document.getElementById('leaderboard-list');
    if (!listContainer) return;
    
    try {
        const response = await fetch('/api/leaderboard'); 
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        listContainer.innerHTML = ""; 
        
        if (!Array.isArray(data) || data.length === 0) { 
            listContainer.innerHTML = `<div style="text-align:center; padding:20px; font-size:13px; color: var(--text-muted);">No scores logged yet.</div>`; 
            return; 
        }

        data.forEach((entry, index) => {
            const row = document.createElement('div');
            row.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 14px; font-size: 14px; margin-bottom: 8px;`;
            let rankColor = index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : 'var(--text-muted)';
            
            const displayScore = entry.score || Math.min(100, Math.max(1, Math.round(Math.pow((entry.force || 0)/3500.0, 0.75) * 100)));
            const safeUsername = escapeHTML(entry.username);

            row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span class="mono-metrics" style="color: ${rankColor}; width: 20px;">#${index + 1}</span>
                    <div style="font-weight: 700;">${safeUsername}</div>
                </div>
                <div class="mono-metrics" style="font-weight: 800; color: ${rankColor}; font-size: 16px;">${displayScore}%</div>
            `;
            listContainer.appendChild(row);
        });
    } catch (err) {
        console.error("Leaderboard Fetch Error:", err);
        listContainer.innerHTML = `<div style="text-align:center; color:var(--red); padding:20px;">⚠️ Sync Error: Unable to reach Atlas Grid.</div>`;
    }
}

async function transmitScoreToLeaderboard() {
    const msg = document.getElementById('upload-status-msg');
    const btn = document.getElementById('btn-submit-score');
    const username = localStorage.getItem('ff_username');
    
    // SECURE FAILSAFE: Ensure the user is logged in AND has an active Firebase token
    if (!username || !window.isLoggedIn || !window.firebaseToken) {
        if (msg) { msg.textContent = "Authentication required."; msg.style.color = "var(--red)"; }
        return; 
    }
    
    if (msg) { msg.textContent = "Transmitting to Atlas Grid..."; msg.style.color = "var(--accent)"; }
    if (btn) btn.style.display = 'none';

    // Build the payload using the new username paradigm
    const payload = { 
        username: username, 
        score: state.lastMetrics.scorePct,
        force: state.lastMetrics.force,
        vector: state.punchType
    };
    
    try {
        const response = await fetch('/api/leaderboard', {
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.firebaseToken}` // THE VAULT KEY
            }, 
            body: JSON.stringify(payload)
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
            // Re-fetch the leaderboard to calculate our current rank
            const leaderboardResponse = await fetch('/api/leaderboard');
            const leaderboardData = await leaderboardResponse.json();
            
            // CRITICAL FIX: Handle the case where the user's score doesn't crack the Top 50
            const userIndex = leaderboardData.findIndex(entry => entry.username === username);
            const myRank = userIndex !== -1 ? userIndex + 1 : "50+";
            
            state.lastRank = myRank;
            
            if (msg) { 
                // Check if the backend retained an older, higher score
                if (responseData.message && responseData.message.includes('retained')) {
                    msg.textContent = `Rank Retained: #${myRank}`; 
                    msg.style.color = "var(--text-muted)";
                } else {
                    msg.textContent = `Rank Updated: #${myRank}!`; 
                    msg.style.color = "#00ff66"; 
                }
            }
            
            localStorage.setItem('ff_submitted_best', state.lastMetrics.scorePct.toString());
            fetchOnlineLeaderboard();
        } else {
            // If the server rejects it (e.g., username mismatch), throw the specific error
            throw new Error(responseData.error || 'Upload blocked by server');
        }
    } catch (err) { 
        console.error("Transmission Error:", err);
        if (msg) { msg.textContent = err.message || "Transmission failed."; msg.style.color = "var(--red)"; }
        if (btn) btn.style.display = 'block';
    }
}

async function logTelemetry(metrics) {
    const payload = {
        username: localStorage.getItem('ff_username') || 'Guest',
        vector: state.punchType,
        force: Math.round(metrics.force),
        score: metrics.scorePct,
        stability: metrics.stability || 100 
    };

    // Telemetry logs quietly in the background without blocking the UI
    fetch('/api/log-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch(err => console.error("Telemetry log dropped", err));
}

// Ensure global accessibility for inline HTML onclick handlers
window.fetchOnlineLeaderboard = fetchOnlineLeaderboard;
window.transmitScoreToLeaderboard = transmitScoreToLeaderboard;
window.logTelemetry = logTelemetry;