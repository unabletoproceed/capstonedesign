// js/simulation.js

// === SETUP MAIN CANVAS ===
const canvas = document.getElementById('riverCanvas');
const ctx = canvas.getContext('2d');

// === SETUP SCOPE CANVAS ===
const scopeCanvas = document.getElementById('scopeCanvas');
const scopeCtx = scopeCanvas.getContext('2d');

// Resize handling
function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    scopeCanvas.width = scopeCanvas.offsetWidth;
    scopeCanvas.height = scopeCanvas.offsetHeight;
}
window.addEventListener('resize', resize);
resize();

// === STATE VARIABLES ===
const state = {
    rainLevel: 0,      // 0 to 100
    flowSpeed: 0.5,    // m/s
    riverWidth: 5.0,   // m
    waterLevel: 50,    // Current visual height (pixels from bottom)
    targetLevel: 50,   // Target visual height based on rain
    time: 0            // For animation
};

// === DOM ELEMENTS ===
const sliderRain = document.getElementById('sliderRain');
const sliderSpeed = document.getElementById('sliderSpeed');
const sliderWidth = document.getElementById('sliderWidth');

const dispSpeed = document.getElementById('dispSpeed');
const dispWidth = document.getElementById('dispWidth');

const valLevel = document.getElementById('val-level');
const valArea = document.getElementById('val-area');
const valDischarge = document.getElementById('val-discharge');

// === EVENT LISTENERS ===
sliderRain.addEventListener('input', (e) => {
    state.rainLevel = parseInt(e.target.value);
    // Logic: More rain = Higher water target
    // Base level 50px + (Rain * 2.5)
    state.targetLevel = 50 + (state.rainLevel * 2.5);
});

sliderSpeed.addEventListener('input', (e) => {
    state.flowSpeed = parseFloat(e.target.value);
    dispSpeed.textContent = state.flowSpeed.toFixed(1) + " m/s";
});

sliderWidth.addEventListener('input', (e) => {
    state.riverWidth = parseFloat(e.target.value);
    dispWidth.textContent = state.riverWidth.toFixed(1) + " m";
});

// === PHYSICS & DRAWING LOOP ===
const rainParticles = [];

function updatePhysics() {
    // 1. Smooth Water Level Transition (Lerp)
    state.waterLevel += (state.targetLevel - state.waterLevel) * 0.05;

    // 2. Calculate Math Metrics
    // Visual pixels to Meters ratio (Approx: 100px = 2 meters depth)
    const depthMeters = state.waterLevel / 50; 
    const area = depthMeters * state.riverWidth;
    const discharge = area * state.flowSpeed;

    // 3. Update Text
    valLevel.textContent = depthMeters.toFixed(2) + " m";
    valArea.textContent = area.toFixed(2) + " m²";
    valDischarge.textContent = discharge.toFixed(2) + " m³/s";

    // 4. Update Time
    // Speed slider affects animation speed
    state.time += 0.05 + (state.flowSpeed * 0.1);
}

function drawRiver() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = canvas.width;
    const h = canvas.height;
    const waterY = h - state.waterLevel;

    // --- 1. DRAW BRIDGE / SENSOR ---
    ctx.fillStyle = "#333";
    ctx.fillRect(w/2 - 20, 40, 40, 10); // Sensor body
    
    // --- 2. DRAW RADAR WAVES (Animated) ---
    ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
    ctx.lineWidth = 2;
    const waveCount = 3;
    const maxRadius = waterY - 50; // Distance to water
    
    for(let i=0; i<waveCount; i++) {
        // Create expanding effect loop
        let progress = (state.time * 2 + i * (100/waveCount)) % 100; 
        let radius = (progress / 100) * maxRadius;
        let alpha = 1 - (progress / 100);

        ctx.beginPath();
        ctx.arc(w/2, 50, radius, 0, Math.PI, false); // Half circle down
        ctx.strokeStyle = `rgba(220, 53, 69, ${alpha})`;
        ctx.stroke();
    }

    // --- 3. DRAW WATER ---
    ctx.beginPath();
    ctx.moveTo(0, h);
    
    // Create Waves on top
    for (let x = 0; x <= w; x += 10) {
        // Sine wave formula: y = Amplitude * sin(Frequency * x + Phase)
        // Frequency increases with FlowSpeed (Doppler visual metaphor)
        const waveHeight = 5 + (state.flowSpeed * 2); 
        const waveFreq = 0.02;
        const phase = state.time; // Moves the wave
        
        const y = waterY + Math.sin(x * waveFreq + phase) * waveHeight;
        ctx.lineTo(x, y);
    }

    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();

    // Gradient Water
    const grad = ctx.createLinearGradient(0, waterY, 0, h);
    grad.addColorStop(0, "#93DCEC");
    grad.addColorStop(1, "#0A3D52");
    ctx.fillStyle = grad;
    ctx.fill();

    // --- 4. DRAW RAIN ---
    // Spawn new rain based on slider intensity
    if (Math.random() * 100 < state.rainLevel) {
        rainParticles.push({
            x: Math.random() * w,
            y: 0,
            len: Math.random() * 20 + 10,
            speed: Math.random() * 10 + 10
        });
    }

    ctx.strokeStyle = "rgba(100, 150, 255, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = rainParticles.length - 1; i >= 0; i--) {
        let p = rainParticles[i];
        p.y += p.speed;
        
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y + p.len);

        // Remove if hits water
        if (p.y > waterY) {
            rainParticles.splice(i, 1);
            // Optional: Draw splash?
        }
    }
    ctx.stroke();
}

// === OSCILLOSCOPE (DOPPLER) ===
function drawScope() {
    const w = scopeCanvas.width;
    const h = scopeCanvas.height;
    scopeCtx.fillStyle = "#000";
    scopeCtx.fillRect(0, 0, w, h);

    scopeCtx.beginPath();
    scopeCtx.strokeStyle = "#0f0"; // Matrix Green
    scopeCtx.lineWidth = 2;

    for (let x = 0; x < w; x++) {
        // Frequency of sine wave depends on Flow Speed (Doppler Effect)
        // Static water = Flat line. Fast water = High freq.
        const freq = state.flowSpeed * 0.5; 
        const amp = (h/2) - 5;
        
        const y = (h/2) + Math.sin((x + state.time * 20) * freq) * amp;
        
        if (x===0) scopeCtx.moveTo(x, y);
        else scopeCtx.lineTo(x, y);
    }
    scopeCtx.stroke();
}

// === MASTER LOOP ===
function animate() {
    updatePhysics();
    drawRiver();
    drawScope();
    requestAnimationFrame(animate);
}

// Start
animate();