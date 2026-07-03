/**
 * First Fist — Device Sensor & Biomechanical Telemetry Engine
 * Upgraded with Impact Confidence tagging.
 */

const TRIGGER_THRESHOLD = 18.0;       
const ROLLING_SAMPLE_LIMIT = 30;     
const STABILITY_SAMPLE_LIMIT = 20;

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
    const gAcc = event.accelerationIncludingGravity;
    if (!gAcc || gAcc.x === null) return;

    // 1. Stability Tracking
    const rawMag = Math.sqrt(gAcc.x**2 + gAcc.y**2 + gAcc.z**2);
    if (state.armed && !state.capturing && !isTrackingStrike) {
        stabilityBuffer.push(rawMag);
        if (stabilityBuffer.length > STABILITY_SAMPLE_LIMIT) stabilityBuffer.shift();
    }

    // 2. Vector Isolation
    const rawAccel = event.acceleration; 
    let mx = 0, my = 0, mz = 0;

    if (rawAccel && rawAccel.x !== null) {
        mx = rawAccel.x; my = rawAccel.y; mz = rawAccel.z;
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
        if (typeof updateLiveGauge === 'function') updateLiveGauge(0);
        return;
    }

    if (!state.armed || state.capturing) return;

    const cleanMag = Math.max(0, mag - state.zeroZoneOffset);
    if (typeof updateLiveGauge === 'function') updateLiveGauge(cleanMag);

    rollingHistory.push({ magnitude: cleanMag, dt: dt, time: currentTime });
    if (rollingHistory.length > ROLLING_SAMPLE_LIMIT) rollingHistory.shift();

    // 4. Impact Detection Trigger
    if (cleanMag > TRIGGER_THRESHOLD && !isTrackingStrike) {
        isTrackingStrike = true;
        strikeStartTime = currentTime;
        
        let startIndex = rollingHistory.length - 1;
        for (let i = rollingHistory.length - 1; i >= 0; i--) {
            if (rollingHistory[i].magnitude < 1.0) { startIndex = i; break; }
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
            const decelerationSlope = timeDelta > 0 ? (accelDelta / timeDelta) : 0;

            if (decelerationSlope > 180.0 && elapsed > 40) { 
                executeCapture(decelerationSlope, true); // True = High Confidence (Impact)
                return;
            }
        }

        if (elapsed > 200) {
            executeCapture(80.0, false); // False = Low Confidence (Air Punch)
            return;
        }
    }
}

/**
 * Capture trigger
 * @param {number} impactSlope 
 * @param {boolean} isHighConfidence - New Feature: Tags punch as impact vs air
 */
function executeCapture(impactSlope, isHighConfidence) {
    isTrackingStrike = false;
    state.capturing = true;
    state.lastPunchConfidence = isHighConfidence ? "IMPACT" : "AIR_PUNCH"; // New tag for app.js
    
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    processAdvancedTelemetry(impactSlope);
}

function processAdvancedTelemetry(impactSlope) {
    if (strikeBuffer.length === 0) return;

    const flightMagnitudes = strikeBuffer.map(s => s.magnitude);
    state.peak = Math.max(...flightMagnitudes, TRIGGER_THRESHOLD);

    let maxVelocity = 0;
    let accumulatedVelocity = 0;
    for (let i = 0; i < strikeBuffer.length; i++) {
        accumulatedVelocity += strikeBuffer[i].magnitude * strikeBuffer[i].dt;
        if (accumulatedVelocity > maxVelocity) maxVelocity = accumulatedVelocity;
    }
    state.maxVelocity = maxVelocity;

    if (typeof finalizeCapture === 'function') finalizeCapture();
}

function resetSensorBuffers() {
    stabilityBuffer = []; 
    rollingHistory = [];
    strikeBuffer = [];
    calibrationBuffer = [];
    isTrackingStrike = false;
    strikeStartTime = 0;
}