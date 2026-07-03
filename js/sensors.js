/**
 * First Fist — Device Sensor & Biomechanical Telemetry Engine
 * Upgraded with Impact Confidence tagging and centralized configuration.
 */

// Freeze configuration for safe, easy tuning of the physics engine
const SENSOR_CONFIG = Object.freeze({
    TRIGGER_THRESHOLD: 18.0,
    ROLLING_SAMPLE_LIMIT: 30,
    STABILITY_SAMPLE_LIMIT: 20,
    IMPACT_SLOPE_THRESHOLD: 180.0,
    IMPACT_MIN_TIME_MS: 40,
    AIR_PUNCH_TIMEOUT_MS: 200,
    AIR_PUNCH_DEFAULT_SLOPE: 80.0
});

// Internal Buffer State
let stabilityBuffer = []; 
let rollingHistory = [];             
let strikeBuffer = [];               
let calibrationBuffer = []; 
let isTrackingStrike = false;
let strikeStartTime = 0;

/**
 * Core Motion Handler
 */
function handleMotion(event) {
    // Fail gracefully if the global state from app.js hasn't initialized yet
    if (typeof state === 'undefined') return;

    const gAcc = event.accelerationIncludingGravity;
    if (!gAcc || gAcc.x === null) return;

    // 1. Stability Tracking
    const rawMag = Math.sqrt(gAcc.x**2 + gAcc.y**2 + gAcc.z**2);
    if (state.armed && !state.capturing && !isTrackingStrike) {
        stabilityBuffer.push(rawMag);
        if (stabilityBuffer.length > SENSOR_CONFIG.STABILITY_SAMPLE_LIMIT) {
            stabilityBuffer.shift();
        }
    }

    // 2. Vector Isolation
    const rawAccel = event.acceleration; 
    let mx = 0, my = 0, mz = 0;

    if (rawAccel && rawAccel.x !== null) {
        mx = rawAccel.x; 
        my = rawAccel.y; 
        mz = rawAccel.z;
    } else {
        // Fallback for devices without LinearAccelerationSensor
        const alpha = 0.85;
        if (!state.hasGravityEstimate) {
            state.gravity = { x: gAcc.x, y: gAcc.y, z: gAcc.z };
            state.hasGravityEstimate = true;
        } else {
            state.gravity.x = alpha * state.gravity.x + (1 - alpha) * gAcc.x;
            state.gravity.y = alpha * state.gravity.y + (1 - alpha) * gAcc.y;
            state.gravity.z = alpha * state.gravity.z + (1 - alpha) * gAcc.z;
        }
        mx = gAcc.x - state.gravity.x; 
        my = gAcc.y - state.gravity.y; 
        mz = gAcc.z - state.gravity.z;
    }

    const mag = Math.sqrt(mx*mx + my*my + mz*mz);
    const dt = event.interval ? event.interval / 1000 : 0.016;
    const currentTime = performance.now();

    // 3. Calibration Routing
    if (state.isCalibrating) {
        calibrationBuffer.push(mag);
        if (typeof window.updateLiveGauge === 'function') window.updateLiveGauge(0);
        return;
    }

    if (!state.armed || state.capturing) return;

    const cleanMag = Math.max(0, mag - (state.zeroZoneOffset || 3.2));
    if (typeof window.updateLiveGauge === 'function') window.updateLiveGauge(cleanMag);

    rollingHistory.push({ magnitude: cleanMag, dt: dt, time: currentTime });
    if (rollingHistory.length > SENSOR_CONFIG.ROLLING_SAMPLE_LIMIT) {
        rollingHistory.shift();
    }

    // 4. Impact Detection Trigger
    if (cleanMag > SENSOR_CONFIG.TRIGGER_THRESHOLD && !isTrackingStrike) {
        isTrackingStrike = true;
        strikeStartTime = currentTime;
        
        let startIndex = rollingHistory.length - 1;
        for (let i = rollingHistory.length - 1; i >= 0; i--) {
            if (rollingHistory[i].magnitude < 1.0) { 
                startIndex = i; 
                break; 
            }
        }
        strikeBuffer = rollingHistory.slice(startIndex);
    }

    // 5. Processing Impact
    if (isTrackingStrike) {
        strikeBuffer.push({ magnitude: cleanMag, dt: dt, time: currentTime });
        const elapsed = currentTime - strikeStartTime;

        if (strikeBuffer.length > 3) {
            const currentSample = strikeBuffer[strikeBuffer.length - 1];
            const previousSample = strikeBuffer[strikeBuffer.length - 3];
            const accelDelta = previousSample.magnitude - currentSample.magnitude;
            const timeDelta = (currentSample.time - previousSample.time) / 1000;
            
            // Protect against divide-by-zero
            const decelerationSlope = timeDelta > 0 ? (accelDelta / timeDelta) : 0;

            if (decelerationSlope > SENSOR_CONFIG.IMPACT_SLOPE_THRESHOLD && elapsed > SENSOR_CONFIG.IMPACT_MIN_TIME_MS) { 
                executeCapture(decelerationSlope, true); // True = High Confidence (Impact)
                return;
            }
        }

        if (elapsed > SENSOR_CONFIG.AIR_PUNCH_TIMEOUT_MS) {
            executeCapture(SENSOR_CONFIG.AIR_PUNCH_DEFAULT_SLOPE, false); // False = Low Confidence (Air Punch)
            return;
        }
    }
}

/**
 * Capture trigger
 * @param {number} impactSlope 
 * @param {boolean} isHighConfidence - Tags punch as impact vs air
 */
function executeCapture(impactSlope, isHighConfidence) {
    isTrackingStrike = false;
    if (typeof state !== 'undefined') {
        state.capturing = true;
        state.lastPunchConfidence = isHighConfidence ? "IMPACT" : "AIR_PUNCH";
    }
    
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    processAdvancedTelemetry(impactSlope);
}

function processAdvancedTelemetry(impactSlope) {
    if (strikeBuffer.length === 0 || typeof state === 'undefined') return;

    const flightMagnitudes = strikeBuffer.map(s => s.magnitude);
    state.peak = Math.max(...flightMagnitudes, SENSOR_CONFIG.TRIGGER_THRESHOLD);

    let maxVelocity = 0;
    let accumulatedVelocity = 0;
    for (let i = 0; i < strikeBuffer.length; i++) {
        accumulatedVelocity += strikeBuffer[i].magnitude * strikeBuffer[i].dt;
        if (accumulatedVelocity > maxVelocity) maxVelocity = accumulatedVelocity;
    }
    state.maxVelocity = maxVelocity;

    if (typeof window.finalizeCapture === 'function') window.finalizeCapture();
}

function resetSensorBuffers() {
    stabilityBuffer = []; 
    rollingHistory = [];
    strikeBuffer = [];
    calibrationBuffer = [];
    isTrackingStrike = false;
    strikeStartTime = 0;
}

// --- EXPORT TO GLOBAL WINDOW OBJECT ---
window.handleMotion = handleMotion;
window.resetSensorBuffers = resetSensorBuffers;