// js/main.js
import { supabase } from './supabase.js';

// ==========================================
// 1. LOGIKA TRANSISI PORTAL (KHUSUS INDEX.HTML)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("Website Dimuat - Memulai Timer Menu...");

    const portal = document.getElementById('portalLayer');
    const loadingText = document.getElementById('loadingText');

    // Cek apakah kita di halaman depan (index.html)
    if (portal) {
        // Timer 3 detik (Waktu air naik)
        setTimeout(() => {
            console.log("Waktu Habis! Memunculkan Menu.");
            
            // 1. Sembunyikan Teks Loading
            if (loadingText) loadingText.style.opacity = '0';
            
            // 2. Munculkan Menu Portal
            portal.classList.add('show');
            
        }, 3000); 
    }
});

// ==========================================
// 2. INITIALIZE MAP (Hanya jika ada elemen map)
// ==========================================
function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return; // Stop jika tidak ada peta

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
// 3. REAL DATA LOGIC
// ==========================================
const statusBox = document.getElementById('latest-status');

async function loadLatestData() {
    // Jika tidak ada kotak status (berarti di index), stop biar ringan
    if (!statusBox) return; 

    try {
        // PERBAIKAN: Menggunakan tabel 'radar_data'
        const { data, error } = await supabase
            .from('radar_data') 
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
            statusBox.innerHTML = `<div style="color:orange;">Menunggu Data...</div>`;
            return;
        }

        const latest = data[0];
        statusBox.innerHTML = `
            <div><strong>Kecepatan:</strong> ${latest.velocity} m/s</div>
            <div><strong>Debit:</strong> ${latest.discharge} m³/s</div>
            <div style="font-size:0.8rem; color:#777; margin-top:5px">
                Last Update: ${new Date(latest.timestamp).toLocaleTimeString()}
            </div>
        `;
    } catch (err) {
        console.error("Error loading status:", err);
    }
}

// --- B. Load Charts ---
async function loadChartData() {
    if (!document.getElementById('velocityChart')) return;

    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
            .from('radar_data')
            .select('*')
            .gte('timestamp', oneHourAgo)
            .order('timestamp', { ascending: true });

        if (error) throw error;

        const labels = data.map(row => new Date(row.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
        const velocity = data.map(row => row.velocity);
        const discharge = data.map(row => row.discharge);

        renderCharts(labels, velocity, discharge);
    } catch (err) {
        console.error("Error loading charts:", err);
    }
}

function renderCharts(labels, velocity, discharge) {
    const vCanvas = document.getElementById('velocityChart');
    const dCanvas = document.getElementById('dischargeChart');

    if (!vCanvas || !dCanvas) return;

    const vCtx = vCanvas.getContext('2d');
    const dCtx = dCanvas.getContext('2d');

    if (velocityChartInstance) velocityChartInstance.destroy();
    if (dischargeChartInstance) dischargeChartInstance.destroy();

    velocityChartInstance = new Chart(vCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Kecepatan', data: velocity, borderColor: '#0A3D52', fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    dischargeChartInstance = new Chart(dCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Debit', data: discharge, borderColor: '#5aaec2', fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// ==========================================
// 4. START SYSTEM
// ==========================================
function init() {
    console.log("System Initializing...");
    
    // 1. Jalankan Transisi Menu (Sekarang fungsi ini SUDAH ADA)
    handlePortalTransition();

    // 2. Load Data Dashboard
    loadLatestData(); 
    
    // 3. Peta & Grafik
    initMap();
    loadChartData();
}

// Jalankan saat script dimuat
init();

// Refresh data setiap 5 detik (Hanya jika bukan di index)
if (!document.getElementById('portalLayer')) {
    setInterval(() => {
        loadLatestData();
        loadChartData();
    }, 5000);
}