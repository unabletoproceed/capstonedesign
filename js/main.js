import { supabase } from './supabase.js';

// =========================================
// 1. DEFINISI DOM ELEMENTS & VARIABEL GLOBAL
// =========================================

// Elemen Dropdown & Status
const deviceSelect = document.getElementById('deviceSelect');
const elWaterLevel = document.getElementById('val-water-level');
const elVelocity   = document.getElementById('val-velocity');
const elDischarge  = document.getElementById('val-discharge');
const elTimestamp  = document.getElementById('val-timestamp');
const elStatusDot  = document.querySelector('.status-indicator'); // Untuk indikator Live

// Variabel Global untuk Chart & Map (agar bisa di-update/reset)
let velocityChartInstance = null;
let dischargeChartInstance = null;
let mapInstance = null;

// =========================================
// 2. FUNGSI UTAMA (INIT)
// =========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log("Aplikasi dimulai...");

    // 1. Inisialisasi Peta (Fitur sebelumnya)
    initMap();

    // 2. Muat Data Awal (Ambil ID dari dropdown, default biasanya 4)
    const initialDeviceId = deviceSelect.value;
    loadDashboardData(initialDeviceId);
});

// Event Listener saat Dropdown diganti
deviceSelect.addEventListener('change', (e) => {
    const selectedId = e.target.value;
    console.log(`Mengganti tampilan ke Device ID: ${selectedId}`);
    
    // Panggil fungsi pemuat data ulang
    loadDashboardData(selectedId);
});

// Fungsi Wrapper untuk memanggil semua data (Status & Grafik)
function loadDashboardData(deviceId) {
    // Reset tampilan ke "Loading..."
    elTimestamp.innerText = "Memuat...";
    
    // Ambil Data Terkini (Single Row)
    fetchLatestStatus(deviceId);
    
    // Ambil Data Historis (Untuk Grafik)
    fetchChartData(deviceId);
}

// =========================================
// 3. LOGIKA SUPABASE: DATA TERKINI
// =========================================

async function fetchLatestStatus(deviceId) {
    try {
        const { data, error } = await supabase
            .from('sensor_readings')
            .select('*')
            .eq('device_id', deviceId)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        if (error) throw error;

        if (data) {
            // Update UI
            elWaterLevel.innerText = data.water_level ? data.water_level.toFixed(3) : "0";
            elVelocity.innerText   = data.velocity ? data.velocity.toFixed(3) : "0";
            elDischarge.innerText  = data.discharge ? data.discharge.toFixed(3) : "0";

            // Format Waktu (Indonesia)
            const dateObj = new Date(data.timestamp);
            elTimestamp.innerText = dateObj.toLocaleString('id-ID', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            // Update status visual (Hijau jika data baru < 5 menit, Merah jika lama)
            checkConnectionStatus(dateObj);
        } else {
            resetValues();
            elTimestamp.innerText = "Tidak ada data";
        }

    } catch (err) {
        console.error("Error fetch status:", err.message);
        elTimestamp.innerText = "Error koneksi";
    }
}

function resetValues() {
    elWaterLevel.innerText = "-";
    elVelocity.innerText = "-";
    elDischarge.innerText = "-";
}

function checkConnectionStatus(lastDate) {
    const now = new Date();
    const diffMinutes = (now - lastDate) / 1000 / 60;
    
    // Jika data lebih lama dari 10 menit, ubah indikator jadi offline (opsional)
    if (diffMinutes > 10) {
        elStatusDot.innerHTML = '<span class="dot" style="background-color: red;"></span> Offline';
    } else {
        elStatusDot.innerHTML = '<span class="dot" style="background-color: #2ecc71;"></span> Live';
    }
}

// =========================================
// 4. LOGIKA SUPABASE: GRAFIK (CHART.JS)
// =========================================

async function fetchChartData(deviceId) {
    try {
        // Ambil 50 data terakhir untuk grafik
        const { data, error } = await supabase
            .from('sensor_readings')
            .select('timestamp, velocity, discharge')
            .eq('device_id', deviceId)
            .order('timestamp', { ascending: false })
            .limit(50); // Sesuaikan jumlah titik grafik

        if (error) throw error;

        if (data && data.length > 0) {
            // Data dari Supabase urutannya DESC (Terbaru dulu), 
            // Untuk grafik kita butuh ASC (Kiri ke Kanan berdasarkan waktu)
            const sortedData = data.reverse();

            const labels = sortedData.map(row => {
                const d = new Date(row.timestamp);
                return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            });
            const velData = sortedData.map(row => row.velocity);
            const disData = sortedData.map(row => row.discharge);

            updateCharts(labels, velData, disData);
        } else {
            // Jika tidak ada data grafik, kosongkan chart
            updateCharts([], [], []);
        }

    } catch (err) {
        console.error("Error fetch chart:", err.message);
    }
}

function updateCharts(labels, velocityData, dischargeData) {
    // 1. Grafik Kecepatan
    const ctxVel = document.getElementById('velocityChart').getContext('2d');
    
    // Hancurkan chart lama jika ada (agar tidak menumpuk saat ganti device)
    if (velocityChartInstance) {
        velocityChartInstance.destroy();
    }

    velocityChartInstance = new Chart(ctxVel, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Kecepatan (m/s)',
                data: velocityData,
                borderColor: 'rgba(52, 152, 219, 1)',
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                borderWidth: 2,
                tension: 0.4, // Membuat garis melengkung halus
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { display: true }
            },
            scales: {
                x: { display: true },
                y: { beginAtZero: true }
            }
        }
    });

    // 2. Grafik Debit
    const ctxDis = document.getElementById('dischargeChart').getContext('2d');

    if (dischargeChartInstance) {
        dischargeChartInstance.destroy();
    }

    dischargeChartInstance = new Chart(ctxDis, {
        type: 'bar', // Menggunakan Bar Chart untuk debit (opsional, bisa line juga)
        data: {
            labels: labels,
            datasets: [{
                label: 'Debit (m³/s)',
                data: dischargeData,
                backgroundColor: 'rgba(46, 204, 113, 0.6)',
                borderColor: 'rgba(46, 204, 113, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// =========================================
// 5. FITUR PETA (LEAFLET JS)
// =========================================

function initMap() {
    // Koordinat Default (Misal: Bandung / Telkom University)
    // Silakan sesuaikan koordinat ini dengan lokasi alat Anda yang sebenarnya
    const defaultLat = -6.9744; 
    const defaultLng = 107.6303;

    if (!document.getElementById('map')) return; // Cek jika elemen map ada

    mapInstance = L.map('map').setView([defaultLat, defaultLng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance);

    // Marker Statis (Bisa dikembangkan jadi dinamis mengambil lat/long dari database devices)
    L.marker([defaultLat, defaultLng])
        .addTo(mapInstance)
        .bindPopup('<b>Lokasi Utama</b><br>Sensor Radar Terpasang Disini.')
        .openPopup();
}