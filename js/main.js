// js/main.js
import { supabase } from './supabase.js';

// ==========================================
// 1. INITIALIZE MAP (Telkom University / Bojongsoang)
// ==========================================
const mapElement = document.getElementById('map');

if (mapElement) {
    // Coordinates: -6.97197, 107.62969
    const targetLat = -6.97197;
    const targetLng = 107.62969;

    const map = L.map('map').setView([targetLat, targetLng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    L.marker([targetLat, targetLng]).addTo(map)
        .bindPopup('<b>Sensor Lokasi</b><br>Titik Pantau (Bojongsoang)')
        .openPopup();

    setTimeout(() => { map.invalidateSize(); }, 500);
}

// ==========================================
// 2. REAL DATA LOGIC
// ==========================================
const statusBox = document.getElementById('latest-status');
let velocityChartInstance = null;
let dischargeChartInstance = null;

// --- A. Load the Single Latest Value (Status Box) ---
async function loadLatestData() {
    try {
        // Fetch 1 row, ordered by latest timestamp
        const { data, error } = await supabase
            .from('radar_data')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(1);

        if (error) throw error;

        // If table is empty
        if (!data || data.length === 0) {
            statusBox.innerHTML = `
                <div style="color:orange;">Menunggu Data...</div>
                <div style="font-size:0.8rem;">Database Connected. No rows found.</div>
            `;
            return;
        }

        const latest = data[0];
        
        // Update the HTML
        statusBox.innerHTML = `
            <div><strong>Kecepatan:</strong> ${latest.velocity} m/s</div>
            <div><strong>Debit:</strong> ${latest.discharge} m³/s</div>
            <div style="font-size:0.8rem; color:#777; margin-top:5px">
                Last Update: ${new Date(latest.timestamp).toLocaleTimeString()}
            </div>
        `;

    } catch (err) {
        console.error("Error loading status:", err);
        statusBox.innerHTML = `<div style="color:red;">Connection Error</div>`;
    }
}

// --- B. Load Historical Data (Charts - Last 1 Hour) ---
async function loadChartData() {
    try {
        // Calculate time 1 hour ago
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('radar_data')
            .select('*')
            .gte('timestamp', oneHourAgo)
            .order('timestamp', { ascending: true });

        if (error) throw error;

        // Format data for Chart.js
        const labels = data.map(row => new Date(row.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
        const velocity = data.map(row => row.velocity);
        const discharge = data.map(row => row.discharge);

        renderCharts(labels, velocity, discharge);

    } catch (err) {
        console.error("Error loading charts:", err);
    }
}

// --- C. Draw Charts (Visuals) ---
function renderCharts(labels, velocity, discharge) {
    const vCtx = document.getElementById('velocityChart').getContext('2d');
    const dCtx = document.getElementById('dischargeChart').getContext('2d');

    if (velocityChartInstance) velocityChartInstance.destroy();
    if (dischargeChartInstance) dischargeChartInstance.destroy();

    // Gradients
    let gradientV = vCtx.createLinearGradient(0, 0, 0, 400);
    gradientV.addColorStop(0, 'rgba(147, 220, 236, 0.6)'); 
    gradientV.addColorStop(1, 'rgba(147, 220, 236, 0.0)'); 

    let gradientD = dCtx.createLinearGradient(0, 0, 0, 400);
    gradientD.addColorStop(0, 'rgba(90, 174, 194, 0.6)'); 
    gradientD.addColorStop(1, 'rgba(90, 174, 194, 0.0)');

    // Velocity Chart
    velocityChartInstance = new Chart(vCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Kecepatan (m/s)',
                data: velocity,
                borderColor: '#0A3D52',
                borderWidth: 2,
                backgroundColor: gradientV,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#0A3D52'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#f0f0f0' } } } }
    });

    // Discharge Chart
    dischargeChartInstance = new Chart(dCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Debit (m³/s)',
                data: discharge,
                borderColor: '#5aaec2',
                borderWidth: 2,
                backgroundColor: gradientD,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#5aaec2'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#f0f0f0' } } } }
    });
}

// --- D. Start System ---
function init() {
    loadLatestData();
    loadChartData();
}

// Run immediately
init();

// Auto-refresh every 5 seconds
setInterval(init, 5000);