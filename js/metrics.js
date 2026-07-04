/**
 * First Fist — Biomechanical Scoring & Physics Engine
 * Upgraded with Performance Tier tagging and strict boundaries.
 */

// Freeze configuration to prevent accidental runtime mutations
const METRICS_CONFIG = Object.freeze({
    // Calibrated for kinetic flight force (shadowboxing), not heavy bag impact.
    MAX_HUMAN_FORCE_NEWTONS: 800.0, 
    MAX_VELOCITY_MS: 12.0
});

/**
 * Calculates power and assigns a tier.
 * @param {number} peakAccel - Peak acceleration from sensors
 * @param {number} effectiveMass - Calculated punch mass
 * @returns {object} metrics object including force, score, color, and tier.
 */
function calculatePunchPower(peakAccel, effectiveMass) {
    // Defensive check: cleanly handle missing or corrupted sensor data
    const validAccel = (typeof peakAccel === 'number' && !isNaN(peakAccel)) ? Math.max(0, peakAccel) : 0;
    const validMass = (typeof effectiveMass === 'number' && !isNaN(effectiveMass)) ? Math.max(1, effectiveMass) : 10;

    // 1. Calculate raw kinetic force
    const calculatedForce = validMass * validAccel;
    
    // 2. Map force against the absolute human limit (0.0 to 1.0)
    const rawFraction = calculatedForce / METRICS_CONFIG.MAX_HUMAN_FORCE_NEWTONS;
    
    // 3. Apply a logarithmic curve for Elite Gating
    // Clamped between 0 and 1 to prevent NaN anomalies
    const safeFraction = Math.max(0, Math.min(1, rawFraction));
    const curvedFraction = Math.pow(safeFraction, 0.75); 
    
    // 4. Convert to 0-100% ceiling integer
    const finalPct = Math.max(1, Math.min(100, Math.round(curvedFraction * 100)));

    return {
        force: calculatedForce,
        scorePct: finalPct,
        color: getPowerColorGradient(finalPct),
        tier: getPerformanceTier(finalPct)
    };
}

/**
 * Maps performance to a professional tier label.
 */
function getPerformanceTier(pct) {
    if (pct >= 90) return "ELITE";
    if (pct >= 70) return "PRO";
    if (pct >= 40) return "ADVANCED";
    return "NOVICE";
}

/**
 * Determines the UI glow based on performance tier.
 */
function getPowerColorGradient(pct) {
    if (pct >= 90) return "#ffd700";        // Elite: Gold
    if (pct >= 70) return "var(--red)";     // Pro: Crimson Red
    return "var(--accent)";                 // Novice/Advanced: Cyan Blue
}

/**
 * Evaluates how steady the hand was during the wind-up.
 */
function calculateStability(buffer) {
    if (!Array.isArray(buffer) || buffer.length === 0) return 100; 

    // Calculate the mean (average) movement
    const mean = buffer.reduce((sum, val) => sum + val, 0) / buffer.length;
    
    // Calculate variance: how far do the points stray from the mean?
    const variance = buffer.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / buffer.length;
    
    // Convert variance to a 0-100 score explicitly bounded at both ends.
    const score = Math.max(0, Math.min(100, 100 - (variance * 50))); 
    return Math.round(score);
}

// --- EXPORT TO GLOBAL WINDOW OBJECT ---
// Ensures perfect cross-file compatibility with app.js and sensors.js
window.calculatePunchPower = calculatePunchPower;
window.calculateStability = calculateStability;
window.getPerformanceTier = getPerformanceTier;
window.getPowerColorGradient = getPowerColorGradient;