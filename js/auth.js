// --- IDENTITY & AUTHENTICATION ENGINE (FIREBASE) ---

// 1. IMPORT FIREBASE (Added onAuthStateChanged)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Global Auth State
window.isLoggedIn = !!localStorage.getItem('ff_username'); // Changed to username

let auth, provider;

try {
    // YOUR FIREBASE CONFIG
    const firebaseConfig = {
        apiKey: "AIzaSyBdr5kB5UCEFXT3beszNbaRek7WbJpWfSc",
        authDomain: "first-fist-aa3cb.firebaseapp.com",
        projectId: "first-fist-aa3cb",
        storageBucket: "first-fist-aa3cb.firebasestorage.app",
        messagingSenderId: "474069687179",
        appId: "1:474069687179:web:d7bf18c8c1331ee733ad8e"
    };

    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
} catch (err) {
    console.warn("Firebase config error:", err);
}

// --- MODAL UI LOGIC ---
window.showLoginModal = function(message = "Sign in to continue") {
    const msgElement = document.getElementById('login-modal-msg');
    if (msgElement) msgElement.textContent = message;
    document.getElementById('login-modal').style.display = 'flex';
};

window.closeLoginModal = function() {
    document.getElementById('login-modal').style.display = 'none';
};

window.promptSubmitScore = function() {
    if (!window.isLoggedIn) {
        window.showLoginModal("Sign in with Google to claim your rank on the Atlas Grid.");
        return;
    }
    if (typeof transmitScoreToLeaderboard === 'function') {
        transmitScoreToLeaderboard();
    }
};

// --- THE LISTENER (The Single Source of Truth) ---
if (auth) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in! Get their secure token
            const token = await user.getIdToken();
            window.firebaseToken = token; // Store in memory for API calls

            // Fetch their username from MongoDB
            try {
                const response = await fetch('/api/user', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                const data = await response.json();
                
                if (data.exists && data.username) {
                    // Profile found! Sync it to this phone
                    localStorage.setItem('ff_username', data.username);
                    window.isLoggedIn = true;
                    if (typeof updateHomeDashboard === 'function') updateHomeDashboard();
                } else {
                    // Account exists, but no username chosen yet. Show updated modal ID
                    document.getElementById('username-modal').style.display = 'flex';
                }
            } catch (err) {
                console.error("Failed to fetch user profile:", err);
            }
        } else {
            // User is completely logged out
            window.isLoggedIn = false;
            window.firebaseToken = null;
            localStorage.removeItem('ff_username');
            if (typeof updateHomeDashboard === 'function') updateHomeDashboard();
        }
    });
}

// --- TRIGGER SIGN IN ---
window.signInWithGoogle = async function() {
    try {
        const result = await signInWithPopup(auth, provider);
        window.closeLoginModal();
        
        // --- FORCE UI REFRESH ---
        // This ensures the screen updates even before the listener finishes
        if (typeof updateHomeDashboard === 'function') {
            updateHomeDashboard();
        }
    } catch (error) {
        console.error("Sign-In Error:", error);
    }
};

// --- CLAIM USERNAME ---
window.submitNewUsername = async function() { // Renamed from submitNewHandle
    const input = document.getElementById('new-username-input').value.trim();
    const errorDiv = document.getElementById('username-error');
    
    if (input.length < 3) {
        if (errorDiv) errorDiv.textContent = "Username must be at least 3 letters.";
        return;
    }
    
    try {
        const response = await fetch('/api/user', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.firebaseToken}` 
            },
            body: JSON.stringify({ username: input })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (errorDiv) errorDiv.textContent = data.error || "Username taken. Try another.";
            return;
        }
        
        // Success
        localStorage.setItem('ff_username', input);
        window.isLoggedIn = true;
        document.getElementById('username-modal').style.display = 'none';
        
        if (typeof updateHomeDashboard === 'function') updateHomeDashboard();
        
        // Auto-submit score if they just finished a punch
        if (typeof state !== 'undefined' && state.lastMetrics && state.lastMetrics.scorePct > 0) {
            if (typeof transmitScoreToLeaderboard === 'function') transmitScoreToLeaderboard();
        }
        
    } catch (error) {
        if (errorDiv) errorDiv.textContent = "Network error. Try again.";
    }
};

// --- SECURE LOGOUT ---
window.logoutProfile = async function() {
    if (confirm("Are you sure? This will log you out of your current profile.")) {
        try {
            await signOut(auth); // The listener will handle the backend cleanup!
            
            // Clear all local telemetry data for privacy
            ['ff_username', 'ff_weight', 'ff_vector', 'ff_history', 'ff_total_punches', 'ff_personal_best', 'ff_submitted_best'].forEach(key => localStorage.removeItem(key));
            
            window.location.reload();
        } catch (error) {
            console.error("Logout Error:", error);
        }
    }
};

window.signInWithGoogle = signInWithGoogle;
window.logoutProfile = logoutProfile;
window.submitNewUsername = submitNewUsername;