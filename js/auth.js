// --- IDENTITY & AUTHENTICATION ENGINE (FIREBASE) ---

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

window.isLoggedIn = !!localStorage.getItem('ff_username');

let auth, provider;

try {
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

// Helper kept in one place so both the listener and manual retries use it
function syncLoggedInUI() {
    if (typeof window.updateHomeDashboard === 'function') window.updateHomeDashboard();
    if (typeof window.updateTabBarVisuals === 'function') window.updateTabBarVisuals();
}

// --- THE LISTENER (The Single Source of Truth) ---
if (auth) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const token = await user.getIdToken();
            window.firebaseToken = token;

            try {
                const response = await fetch('/api/user', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    // Server rejected the token / errored — don't silently
                    // pretend the user has no profile. Surface it instead.
                    console.error("Profile sync failed with status", response.status);
                    window.showLoginModal("Couldn't sync your profile. Please try signing in again.");
                    await signOut(auth);
                    return;
                }

                const data = await response.json();

                if (data.exists && data.username) {
                    localStorage.setItem('ff_username', data.username);
                    window.isLoggedIn = true;
                    syncLoggedInUI();
                } else {
                    // Genuinely new account — needs a username
                    document.getElementById('username-modal').style.display = 'flex';
                }
            } catch (err) {
                // Network/CORS failure — don't leave the app stuck thinking
                // it's logged out forever while Firebase thinks it's logged in.
                console.error("Failed to fetch user profile:", err);
                window.showLoginModal("Connection issue while signing in. Please try again.");
                await signOut(auth).catch(() => {});
            }
        } else {
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
        // Don't call updateHomeDashboard() here — ff_username isn't set yet.
        // onAuthStateChanged will update the UI once the profile sync finishes.
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

        localStorage.setItem('ff_username', input);
        window.isLoggedIn = true;
        document.getElementById('username-modal').style.display = 'none';

        syncLoggedInUI();

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
            await signOut(auth);
            ['ff_username', 'ff_weight', 'ff_vector', 'ff_history', 'ff_total_punches', 'ff_personal_best', 'ff_submitted_best'].forEach(key => localStorage.removeItem(key));
            window.location.reload();
        } catch (error) {
            console.error("Logout Error:", error);
        }
    }
};