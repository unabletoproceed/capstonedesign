// js/simulation.js

const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
const scopeCanvas = document.getElementById('scopeCanvas');
const scopeCtx = scopeCanvas.getContext('2d');

function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    scopeCanvas.width = scopeCanvas.parentElement.clientWidth;
    scopeCanvas.height = scopeCanvas.parentElement.clientHeight;
    animate();
}
window.addEventListener('resize', resize);

// --- STATE ---
const inputs = {
    // Speed is now derived from Rain, so we don't need a slider input for it
    width: document.getElementById('slider-width'),
    rain: document.getElementById('slider-rain'),
    angle: document.getElementById('slider-angle'),
    threshold: document.getElementById('slider-threshold')
};

const display = {
    vel: document.getElementById('val-vel'),
    target: document.getElementById('val-target'),
    snr: document.getElementById('val-snr'),
    discharge: document.getElementById('val-discharge')
};

let time = 0;
let raindrops = [];
let waveOffset = 0;
let animationId;

// Add Listeners
Object.values(inputs).forEach(input => {
    input.addEventListener('input', () => {
        if (!animationId) animate();
    });
});

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    time += 0.05;

    // 1. GET INPUTS
    const riverWidth = parseFloat(inputs.width.value);
    const rainLevel = parseFloat(inputs.rain.value);
    const angleDeg = parseFloat(inputs.angle.value);
    const threshold = parseFloat(inputs.threshold.value);

    // 2. CALCULATE DYNAMIC PHYSICS
    // Flow Speed increases with Rain
    let flowSpeed = 0.5 + (rainLevel / 100) * 3.5; 
    flowSpeed += Math.sin(time * 0.5) * 0.1; // Organic variation

    // Water Level Rises with Rain
    // Base level (low tide) = canvas.height - 100
    // Max Rise = 80px higher
    const baseWaterY = canvas.height - 100;
    const waterRise = (rainLevel / 100) * 80;
    const currentWaterY = baseWaterY - waterRise;

    // 3. DRAW SCENE
    drawBackground(rainLevel);
    
    // Draw River at the calculated height
    drawRiver(flowSpeed, currentWaterY);
    
    // Draw Bridge (Fixed position)
    drawBridgeLeft();

    // Draw Rain (Stops at water surface)
    if (rainLevel > 0) drawRain(rainLevel, currentWaterY);

    // 4. RADAR LOGIC
    const radarX = 100; 
    const radarY = 150; 
    const poleHeight = 60; 
    const headX = radarX + 20; 
    const headY = radarY - poleHeight;

    const angleRad = (angleDeg * Math.PI) / 180;

    // Raycast Logic
    let beamLen = 800;
    let hitType = "AIR";
    
    // Calculate vertical distance to the CURRENT water level
    const dy = currentWaterY - headY;
    
    if (angleDeg > 5) {
        const distToWater = dy / Math.sin(angleRad);
        if (distToWater < beamLen) {
            beamLen = distToWater;
            hitType = "WATER";
        }
    } else {
        hitType = "STATIONARY";
        beamLen = (canvas.width - headX) / Math.cos(angleRad);
    }

    drawTripod(radarX, radarY, poleHeight);
    drawRadarBox(headX, headY, angleRad);
    drawBeam(headX, headY, angleRad, beamLen, hitType);

    // 5. SIGNAL PROCESSING
    let measuredVel = 0;
    let signalStrength = 100 - rainLevel;
    let noiseFloor = rainLevel * 0.8; 
    
    if (hitType === "WATER") {
        const cosFactor = Math.cos(angleRad);
        measuredVel = flowSpeed * cosFactor;

        // Rain Noise Logic
        if (noiseFloor > threshold) {
            measuredVel += (Math.random() - 0.5) * 4.0; // Heavy jitter
            signalStrength -= 50;
        } else {
            measuredVel += (Math.random() - 0.5) * 0.02; // Clean signal
        }

    } else if (hitType === "STATIONARY") {
        measuredVel = 0;
    }

    // Threshold Cutoff
    let amplitude = 80;
    if (rainLevel > 50) amplitude = 40;
    
    if (amplitude < threshold) measuredVel = 0;

    // 6. UPDATE UI
    let finalVel = Math.abs(measuredVel);
    display.vel.innerText = finalVel.toFixed(2) + " m/s";
    display.target.innerText = hitType;
    display.target.style.color = hitType === "WATER" ? "#00d2ff" : "orange";
    display.snr.innerText = Math.max(0, signalStrength.toFixed(0)) + "%";

    // Dynamic Depth Calculation (Water Rises = More Depth)
    const baseDepth = 2.0;
    const addedDepth = (waterRise / 20); // Scale pixels to meters approx
    const currentDepth = baseDepth + addedDepth;
    
    const Q = finalVel * riverWidth * currentDepth;
    display.discharge.innerText = Q.toFixed(2) + " m³/s";

    // 7. DRAW SCOPE
    drawScope(amplitude, noiseFloor, threshold);

    if (rainLevel > 0 || flowSpeed > 0) {
        animationId = setTimeout(() => requestAnimationFrame(animate), 1000 / 45);
    } else {
        animationId = null;
    }
}

// --- DRAWING HELPERS ---

function drawBackground(rain) {
    const dark = Math.min(rain/150, 0.7);
    ctx.fillStyle = `rgba(20, 30, 45, ${1-dark})`; // Darker storm sky
    ctx.fillRect(0,0, canvas.width, canvas.height);
}

function drawBridgeLeft() {
    // Pillar (Z-index: behind water, but we draw simple shapes)
    // Actually, to make water look like it rises ON the pillar, 
    // we draw the pillar top part, but the water draws over the bottom part.
    
    const bridgeY = 150;
    
    // Concrete Pillar (Upper visible part)
    ctx.fillStyle = "#666";
    ctx.fillRect(0, bridgeY, 140, canvas.height); 
    
    // Road Deck
    ctx.fillStyle = "#333";
    ctx.fillRect(0, bridgeY, 180, 25); 
    
    // Railing
    ctx.strokeStyle = "#999"; 
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, bridgeY - 20); ctx.lineTo(180, bridgeY - 20);
    ctx.stroke();
    for(let i=0; i<180; i+=25) {
        ctx.beginPath(); ctx.moveTo(i, bridgeY - 20); ctx.lineTo(i, bridgeY); ctx.stroke();
    }
}

function drawRiver(speed, waterY) {
    // Water Logic
    waveOffset += speed * 2;

    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    // Start at dynamic water level
    ctx.lineTo(0, waterY);

    // Turbulent Surface
    for (let x = 0; x <= canvas.width; x += 10) {
        // Higher waves when speed is higher
        const waveAmp = 2 + (speed * 1.5); 
        
        const w1 = Math.sin((x + waveOffset) * 0.02) * waveAmp;
        const w2 = Math.cos((x + waveOffset * 1.5) * 0.03) * (waveAmp * 0.5);
        
        ctx.lineTo(x, waterY + w1 + w2);
    }

    ctx.lineTo(canvas.width, canvas.height);
    ctx.closePath();

    // Gradient
    const grad = ctx.createLinearGradient(0, waterY, 0, canvas.height);
    grad.addColorStop(0, "rgba(0, 160, 230, 0.9)"); // Lighter top
    grad.addColorStop(1, "rgba(0, 40, 70, 1)"); // Dark bottom
    ctx.fillStyle = grad;
    ctx.fill();

    // Surface Foam/Highlight
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += 15) {
        const waveAmp = 2 + (speed * 1.5);
        const w1 = Math.sin((x + waveOffset + 30) * 0.02) * waveAmp;
        const y = waterY + w1 + 5;
        if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
}

function drawRain(level, waterY) {
    // Limit drops for performance
    if (raindrops.length < level * 4) {
        raindrops.push({
            x: Math.random() * canvas.width,
            y: -50,
            v: 15 + Math.random() * 10
        });
    }

    ctx.strokeStyle = "rgba(170, 210, 255, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    raindrops.forEach((r, index) => {
        // Draw drop
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x - 1, r.y + 15);
        
        // Move drop
        r.y += r.v;
        
        // COLLISION CHECK: Did it hit the water?
        if (r.y >= waterY) {
            // "Splash" - just reset it for now to save performance
            // Or move it way off screen so it gets reset by the logic below
            r.y = canvas.height + 100; 
        }

        // Reset if off screen
        if (r.y > canvas.height) {
            r.y = -50;
            r.x = Math.random() * canvas.width;
        }
    });
    ctx.stroke();

    // Cleanup
    if(raindrops.length > level * 4) raindrops.pop();
}

function drawTripod(x, y, h) {
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 20, y); ctx.lineTo(x + 20, y - h);
    ctx.moveTo(x + 20, y - h/2); ctx.lineTo(x, y);
    ctx.moveTo(x + 20, y - h/2); ctx.lineTo(x + 40, y);
    ctx.stroke();
}

function drawRadarBox(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "#fff";
    ctx.fillRect(-10, -10, 40, 25);
    ctx.fillStyle = "#333";
    ctx.fillRect(30, -5, 5, 15);
    ctx.restore();
}

function drawBeam(x, y, angle, len, type) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const color = type === "WATER" ? "rgba(0, 255, 150, 0.2)" : "rgba(255, 150, 0, 0.1)";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(len, -30);
    ctx.lineTo(len, 30);
    ctx.closePath();
    ctx.fill();

    const pulseX = (time * 150) % len;
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, pulseX, -0.15, 0.15);
    ctx.stroke();

    ctx.restore();

    if (type === "WATER") {
        const hitX = x + Math.cos(angle)*len;
        const hitY = y + Math.sin(angle)*len;
        ctx.fillStyle = "#00ffcc";
        ctx.beginPath(); ctx.arc(hitX, hitY, 4, 0, Math.PI*2); ctx.fill();
    }
}

function drawScope(sig, noise, thresh) {
    const w = scopeCanvas.width;
    const h = scopeCanvas.height;
    scopeCtx.fillStyle = "#000";
    scopeCtx.fillRect(0,0,w,h);

    const thY = h - (thresh/100 * h);
    scopeCtx.strokeStyle = "orange";
    scopeCtx.setLineDash([5,3]);
    scopeCtx.beginPath(); scopeCtx.moveTo(0, thY); scopeCtx.lineTo(w, thY); scopeCtx.stroke();
    scopeCtx.setLineDash([]);

    scopeCtx.strokeStyle = "#0f0";
    scopeCtx.lineWidth = 2;
    scopeCtx.beginPath();
    
    const peakX = w/2;
    for(let x=0; x<w; x++) {
        const dist = Math.abs(x - peakX);
        let signalH = 0;
        if (sig > 0) signalH = (1 / (1 + 0.05*dist*dist)) * (sig/100 * h);
        
        let noiseH = Math.random() * (noise/100 * h);
        let y = h - (signalH + noiseH);
        if(x==0) scopeCtx.moveTo(x,y); else scopeCtx.lineTo(x,y);
    }
    scopeCtx.stroke();
}

resize();