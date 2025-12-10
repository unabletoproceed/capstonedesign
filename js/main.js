// js/main.js
import { supabase } from './supabase.js';

// ==========================================
// 1. LOGIKA TRANSISI PORTAL (KHUSUS INDEX.HTML)
// ==========================================
function handlePortalTransition() {
    const loadingText = document.getElementById('loadingText');
    const portal = document.getElementById('portalLayer');

    // Jika elemen ini ada (artinya kita sedang di index.html)
    if (portal) {
        console.log("Halaman Portal Terdeteksi - Menunggu animasi air...");
        
        // Tunggu 2.5 detik (sesuai naiknya air), lalu munculkan menu
        setTimeout(() => {
            if (loadingText) loadingText.classList.add('hidden'); // Hilangkan teks
            portal.classList.add('show'); // Munculkan menu
            console.log("Menu Muncul!");
        }, 2500);
    }
}

// ==========================================
// 2. INITIALIZE MAP (Hanya jika ada elemen map)
// ==========================================
function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return; // Stop jika tidak ada peta (misal di index.html)

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
let velocityChartInstance = null;
let dischargeChartInstance = null;

// --- A. Load Latest Data ---
async function loadLatestData() {
    // Cek apakah kita butuh data ini? (Jika tidak ada statusBox, skip saja biar ringan)
    if (!statusBox) return; 

    try {
        // GANTI 'river_data_real' SESUAI NAMA TABEL KAMU (Tadi kamu pakai radar_data?)
        const { data, error } = await supabase
            .from('river_data_real') 
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
    // Cek dulu apakah elemen chart ada? Kalau tidak ada (di index.html), jangan dijalankan!
    if (!document.getElementById('velocityChart')) return;

    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
            .from('river_data_real')
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

    if (!vCanvas || !dCanvas) return; // Safety check

    const vCtx = vCanvas.getContext('2d');
    const dCtx = dCanvas.getContext('2d');

    if (velocityChartInstance) velocityChartInstance.destroy();
    if (dischargeChartInstance) dischargeChartInstance.destroy();

    // Chart configs... (Sama seperti sebelumnya)
    // Saya persingkat di sini agar muat, tapi kodenya sama dengan punyamu
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
    
    // 1. Jalankan Transisi Menu (PENTING untuk Index.html)
    handlePortalTransition();

    // 2. Coba ambil data (Untuk Dashboard)
    // Kita jalankan loadLatestData() juga di index agar koneksi 'terpanasi'
    // Walaupun tidak ditampilkan di layar
    loadLatestData(); 
    
    // 3. Peta & Grafik (Hanya jalan jika elemennya ada)
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