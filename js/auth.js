// --- IDENTITY & AUTHENTICATION ENGINE (FIREBASE) ---

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Global Auth State
window.isLoggedIn = !!localStorage.getItem('ff_username');

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

// Keeps home dashboard + tab-bar lock state in sync wherever login state changes
function syncLoggedInUI() {
    if (typeof window.updateHomeDashboard === 'function') window.updateHomeDashboard();
    if (typeof window.updateTabBarVisuals === 'function') window.updateTabBarVisuals();
}

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

                if (!response.ok) {
                    // Server rejected the token / errored. Don't silently treat
                    // this as "no profile yet" — that would show the username
                    // picker to a returning user and mask a real failure.
                    console.error("Profile sync failed with status", response.status);
                    window.showLoginModal("Couldn't sync your profile. Please try signing in again.");
                    await signOut(auth).catch(() => {});
                    return;
                }

                const data = await response.json();

                if (data.exists && data.username) {
                    // Profile found! Sync it to this phone
                    localStorage.setItem('ff_username', data.username);
                    window.isLoggedIn = true;
                    syncLoggedInUI();
                } else {
                    // Account exists, but no username chosen yet.
                    document.getElementById('username-modal').style.display = 'flex';
                }
            } catch (err) {
                // Network/CORS failure. Without this, Firebase thinks the user
                // is signed in but window.isLoggedIn never flips to true and
                // ff_username never gets set — the app gets stuck permanently
                // showing "Guest Fighter" / locked tabs with no way out.
                console.error("Failed to fetch user profile:", err);
                window.showLoginModal("Connection issue while signing in. Please try again.");
                await signOut(auth).catch(() => {});
            }
        } else {
            // User is completely logged out
            window.isLoggedIn = false;
            window.firebaseToken = null;
            localStorage.removeItem('ff_username');
            syncLoggedInUI();
        }
    });
}

// --- TRIGGER SIGN IN ---
window.signInWithGoogle = async function() {
    try {
        await signInWithPopup(auth, provider);
        window.closeLoginModal();
        // NOTE: we intentionally do NOT call updateHomeDashboard() here.
        // ff_username isn't set yet at this point — onAuthStateChanged
        // handles the UI refresh once profile sync actually completes.
    } catch (error) {
        console.error("Sign-In Error:", error);
    }
};

// --- CLAIM USERNAME ---
window.submitNewUsername = async function() {
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

        syncLoggedInUI();

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