/**
 * First Fist — Biomechanical Scoring & Physics Engine
 * Upgraded with Performance Tier tagging.
 */

const METRICS_CONFIG = {
    // 3500 Newtons is roughly the impact force of an elite heavyweight professional boxer.
    MAX_HUMAN_FORCE_NEWTONS: 3500.0, 
    MAX_VELOCITY_MS: 12.0
};

/**
 * Calculates power and assigns a tier.
 * @param {number} peakAccel - Peak acceleration from sensors
 * @param {number} effectiveMass - Calculated punch mass
 * @returns {object} metrics object including force, score, color, and tier.
 */
function calculatePunchPower(peakAccel, effectiveMass) {
    // Defensive check
    if (!peakAccel || isNaN(peakAccel)) peakAccel = 0;
    if (!effectiveMass || isNaN(effectiveMass)) effectiveMass = 10;

    // 1. Calculate raw kinetic force (F = ma)
    const calculatedForce = effectiveMass * peakAccel;
    
    // 2. Map force against the absolute human limit (0.0 to 1.0)
    const rawFraction = calculatedForce / METRICS_CONFIG.MAX_HUMAN_FORCE_NEWTONS;
    
    // 3. Apply a logarithmic curve for Elite Gating
    const curvedFraction = Math.pow(rawFraction, 0.75); 
    
    // 4. Convert to 0-100% ceiling integer
    const finalPct = Math.max(1, Math.min(100, Math.round(curvedFraction * 100)));

    return {
        force: calculatedForce,
        scorePct: finalPct,
        color: getPowerColorGradient(finalPct),
        tier: getPerformanceTier(finalPct) // NEW FEATURE
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
    if (pct >= 90) return "#ffd700"; // Elite: Gold
    if (pct >= 70) return "var(--red)";   // Pro: Crimson Red
    return "var(--accent)";          // Novice/Advanced: Cyan Blue
}

/**
 * Evaluates how steady the hand was during the wind-up.
 */
function calculateStability(buffer) {
    if (!Array.isArray(buffer) || buffer.length === 0) return 100; 

    const mean = buffer.reduce((sum, val) => sum + val, 0) / buffer.length;
    const variance = buffer.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / buffer.length;
    
    const score = Math.max(0, 100 - (variance * 50)); 
    return Math.round(score);
}