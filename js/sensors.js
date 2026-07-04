/**
 * First Fist — Device Sensor & Biomechanical Telemetry Engine
 */

const SENSOR_CONFIG = Object.freeze({
    TRIGGER_THRESHOLD: 18.0,
    ROLLING_SAMPLE_LIMIT: 30,
    STABILITY_SAMPLE_LIMIT: 20,
    IMPACT_SLOPE_THRESHOLD: 180.0,
    IMPACT_MIN_TIME_MS: 40,
    AIR_PUNCH_TIMEOUT_MS: 200,
    AIR_PUNCH_DEFAULT_SLOPE: 80.0
});

let stabilityBuffer = []; 
let rollingHistory = [];             
let strikeBuffer = [];               
let calibrationBuffer = []; 
let isTrackingStrike = false;
let strikeStartTime = 0;

function handleMotion(event) {
    if (typeof state === 'undefined') return;

    const gAcc = event.accelerationIncludingGravity;
    if (!gAcc || gAcc.x === null) return;

    const rawMag = Math.sqrt(gAcc.x**2 + gAcc.y**2 + gAcc.z**2);
    if (state.armed && !state.capturing && !isTrackingStrike) {
        stabilityBuffer.push(rawMag);
        if (stabilityBuffer.length > SENSOR_CONFIG.STABILITY_SAMPLE_LIMIT) {
            stabilityBuffer.shift();
        }
    }

    const rawAccel = event.acceleration; 
    let mx = 0, my = 0, mz = 0;

    if (rawAccel && rawAccel.x !== null) {
        mx = rawAccel.x; my = rawAccel.y; mz = rawAccel.z;
    } else {
        const alpha = 0.85;
        if (!state.hasGravityEstimate) {
            state.gravity = { x: gAcc.x, y: gAcc.y, z: gAcc.z };
            state.hasGravityEstimate = true;
        } else {
            state.gravity.x = alpha * state.gravity.x + (1 - alpha) * gAcc.x;
            state.gravity.y = alpha * state.gravity.y + (1 - alpha) * gAcc.y;
            state.gravity.z = alpha * state.gravity.z + (1 - alpha) * gAcc.z;
        }
        mx = gAcc.x - state.gravity.x; my = gAcc.y - state.gravity.y; mz = gAcc.z - state.gravity.z;
    }

    const mag = Math.sqrt(mx*mx + my*my + mz*mz);
    const dt = event.interval ? event.interval / 1000 : 0.016;
    const currentTime = performance.now();

    if (state.isCalibrating) {
        calibrationBuffer.push(mag);
        if (typeof window.updateLiveGauge === 'function') window.updateLiveGauge(0);
        return;
    }

    if (!state.armed || state.capturing) return;

    const cleanMag = Math.max(0, mag - (state.zeroZoneOffset || 3.2));
    if (typeof window.updateLiveGauge === 'function') window.updateLiveGauge(cleanMag);

    // CHANGED: We now save x, y, and z into the history buffer
    rollingHistory.push({ magnitude: cleanMag, x: mx, y: my, z: mz, dt: dt, time: currentTime });
    if (rollingHistory.length > SENSOR_CONFIG.ROLLING_SAMPLE_LIMIT) {
        rollingHistory.shift();
    }

    if (cleanMag > SENSOR_CONFIG.TRIGGER_THRESHOLD && !isTrackingStrike) {
        isTrackingStrike = true;
        strikeStartTime = currentTime;
        
        let startIndex = rollingHistory.length - 1;
        for (let i = rollingHistory.length - 1; i >= 0; i--) {
            if (rollingHistory[i].magnitude < 1.0) { startIndex = i; break; }
        }
        strikeBuffer = rollingHistory.slice(startIndex);
    }

    if (isTrackingStrike) {
        // CHANGED: Save axes to strike buffer
        strikeBuffer.push({ magnitude: cleanMag, x: mx, y: my, z: mz, dt: dt, time: currentTime });
        const elapsed = currentTime - strikeStartTime;

        if (strikeBuffer.length > 3) {
            const currentSample = strikeBuffer[strikeBuffer.length - 1];
            const previousSample = strikeBuffer[strikeBuffer.length - 3];
            const accelDelta = previousSample.magnitude - currentSample.magnitude;
            const timeDelta = (currentSample.time - previousSample.time) / 1000;
            const decelerationSlope = timeDelta > 0 ? (accelDelta / timeDelta) : 0;

            if (decelerationSlope > SENSOR_CONFIG.IMPACT_SLOPE_THRESHOLD && elapsed > SENSOR_CONFIG.IMPACT_MIN_TIME_MS) { 
                executeCapture(decelerationSlope, true); return;
            }
        }

        if (elapsed > SENSOR_CONFIG.AIR_PUNCH_TIMEOUT_MS) {
            executeCapture(SENSOR_CONFIG.AIR_PUNCH_DEFAULT_SLOPE, false); return;
        }
    }
}

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

    // CHANGED: Find the specific sample containing the highest magnitude
    let peakSample = strikeBuffer[0];
    let maxVelocity = 0;
    let accumulatedVelocity = 0;

    for (let i = 0; i < strikeBuffer.length; i++) {
        if (strikeBuffer[i].magnitude > peakSample.magnitude) {
            peakSample = strikeBuffer[i];
        }
        accumulatedVelocity += strikeBuffer[i].magnitude * strikeBuffer[i].dt;
        if (accumulatedVelocity > maxVelocity) maxVelocity = accumulatedVelocity;
    }

    // Save the peak and its 3D axes to the global state
    state.peak = Math.max(peakSample.magnitude, SENSOR_CONFIG.TRIGGER_THRESHOLD);
    state.peakX = peakSample.x;
    state.peakY = peakSample.y;
    state.peakZ = peakSample.z;
    state.maxVelocity = maxVelocity;

    if (typeof window.finalizeCapture === 'function') window.finalizeCapture();
}

function resetSensorBuffers() {
    stabilityBuffer = []; rollingHistory = []; strikeBuffer = []; calibrationBuffer = [];
    isTrackingStrike = false; strikeStartTime = 0;
}

window.handleMotion = handleMotion;
window.resetSensorBuffers = resetSensorBuffers;