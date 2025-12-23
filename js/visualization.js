// ==========================================
// KONFIGURASI SUPABASE
// ==========================================
const SUPABASE_URL = "https://ohbpqbhphpdlqzdnvtov.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYnBxYmhwaHBkbHF6ZG52dG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2ODM0MTIsImV4cCI6MjA3OTI1OTQxMn0.wh_4j201Ci6C3cR-gCnwwe6mt3hyS_BAqs_7mExezqY";

// Inisialisasi Client (Menggunakan library dari CDN di HTML)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- CONFIG ---
const DEVICE_ID_REAL = 6;  
const DEVICE_ID_SIM  = 99; 
const TABLE_NAME = 'sensor_readings';

let isSimulation = false;
let currentDeviceId = DEVICE_ID_REAL;
let updateInterval;

// Instance Chart
let chartInstance = null; // Main Trend
let chartMag = null;
let chartPhase = null;
let chartComplex = null;
let chartDoppler = null;

// DOM Elements
const toggleBtn = document.getElementById('simToggle');
const modeDesc = document.getElementById('mode-desc');
const velDisplay = document.getElementById('live-vel');
const disDisplay = document.getElementById('live-dis');
const floodStatus = document.getElementById('flood-status');
const techBtn = document.getElementById('techToggleBtn');
const techDashboard = document.getElementById('tech-dashboard');

// Summary Banner
const elIndex = document.getElementById('val-index');
const elTinggi = document.getElementById('val-tinggi');
const elFreq = document.getElementById('val-freq');
const elSnr = document.getElementById('val-snr');

// ==========================================
// 1. TOGGLE LOGIC
// ==========================================
if (toggleBtn) {
    toggleBtn.addEventListener('change', (e) => {
        isSimulation = e.target.checked;
        if (isSimulation) {
            currentDeviceId = DEVICE_ID_SIM;
            modeDesc.innerHTML = `Mode: <strong>SIMULATION</strong>. Menampilkan data dari 'simulation-sender.py' (ID: ${DEVICE_ID_SIM})`;
            modeDesc.style.color = "#e65100";
        } else {
            currentDeviceId = DEVICE_ID_REAL;
            modeDesc.innerHTML = `Mode: <strong>REAL SITE</strong>. Menampilkan data dari 'main_pi.py' (ID: ${DEVICE_ID_REAL})`;
            modeDesc.style.color = "#525f7f";
        }
        resetCharts();
        fetchData(); 
    });
}

function resetCharts() {
    [chartInstance, chartMag, chartPhase, chartComplex, chartDoppler].forEach(c => {
        if(c) {
            c.data.labels = [];
            c.data.datasets.forEach(ds => ds.data = []);
            c.update();
        }
    });
}

// Tech Dashboard Toggle
if (techBtn) {
    techBtn.addEventListener('click', () => {
        if (techDashboard.style.display === 'none' || techDashboard.style.display === '') {
            techDashboard.style.display = 'grid';
            techBtn.textContent = "❌ Sembunyikan Analisis Sinyal";
            // Trigger resize agar chart pas
            setTimeout(() => {
                [chartMag, chartPhase, chartComplex, chartDoppler].forEach(c => c?.resize());
            }, 100);
        } else {
            techDashboard.style.display = 'none';
            techBtn.textContent = "🛠️ Tampilkan Analisis Sinyal Lengkap (Debug Mode)";
        }
    });
}

// ==========================================
// 2. DATA FETCHING (STRICT DB ONLY)
// ==========================================
async function fetchData() {
    try {
        // 1. Ambil Data Terbaru (KPI & Sinyal)
        const { data: latest, error: errLatest } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .eq('device_id', currentDeviceId)
            .order('timestamp', { ascending: false })
            .limit(1);

        if (errLatest) throw errLatest;

        // 2. Ambil History untuk Trend (20 data)
        const { data: history, error: errHist } = await supabase
            .from(TABLE_NAME)
            .select('timestamp, velocity, discharge')
            .eq('device_id', currentDeviceId)
            .order('timestamp', { ascending: false })
            .limit(20);

        if (errHist) throw errHist;

        // --- UPDATE UI ---
        if (latest && latest.length > 0) {
            const row = latest[0];
            updateUI(row);
            
            // Render Tech Charts jika JSON ada
            // PERBAIKAN: Python menyimpan di signal_analysis
            if (row.raw_json && row.raw_json.signal_analysis) {
                renderTechCharts(row.raw_json.signal_analysis);
            }
        } else {
            // Data kosong
            updateUI(null); 
        }

        if (history && history.length > 0) {
            updateTrendChart(history.reverse());
        }

    } catch (err) {
        console.error("Fetch Error:", err);
    }
}

// ==========================================
// 3. UI UPDATER
// ==========================================
function updateUI(row) {
    if (!row) {
        velDisplay.innerHTML = "-";
        disDisplay.innerHTML = "-";
        return;
    }

    velDisplay.innerHTML = `${Number(row.velocity).toFixed(3)} <small>m/s</small>`;
    disDisplay.innerHTML = `${Number(row.discharge).toFixed(3)} <small>m³/s</small>`;

    // Banner Data
    const json = row.raw_json || {};
    elIndex.textContent = json.chirp_count ? json.chirp_count : "-"; // Contoh mapping lain
    elTinggi.textContent = row.water_level ? Number(row.water_level).toFixed(2) : "-";
    elFreq.textContent = json.sampling_rate_hz ? json.sampling_rate_hz.toFixed(1) : "-";
    elSnr.textContent = "-"; // Python script belum kirim SNR spesifik

    // Status Banjir
    if(floodStatus) {
        if (row.water_level > 2.0) { // Logika status berdasarkan Tinggi Air
            floodStatus.textContent = "BAHAYA";
            floodStatus.className = "status-badge danger";
            floodStatus.style.backgroundColor = "#f5365c";
        } else {
            floodStatus.textContent = "AMAN";
            floodStatus.className = "status-badge safe";
            floodStatus.style.backgroundColor = "#2dce89";
        }
    }
}

// ==========================================
// 4. CHART RENDERERS
// ==========================================

const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    elements: { point: { radius: 0 }, line: { borderWidth: 1.5, tension: 0.1 } },
    scales: {
        x: { grid: { display: true, color: '#f0f0f0' }, ticks: { display: true } },
        y: { grid: { display: true, color: '#f0f0f0' } }
    },
    plugins: { legend: { display: false } }
};

// A. Main Trend Chart
function updateTrendChart(data) {
    const ctx = document.getElementById('realtimeChart')?.getContext('2d');
    if (!ctx) return;

    const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString('id-ID'));
    const velData = data.map(d => d.velocity);
    // const disData = data.map(d => d.discharge); // Opsional: Tampilkan 1 garis saja biar rapi

    if (chartInstance) {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = velData;
        chartInstance.update('none');
    } else {
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Kecepatan (m/s)', data: velData, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true }
                ]
            },
            options: commonOptions
        });
    }
}

// B. Tech Charts (The 4 Grids)
function renderTechCharts(signals) {
    // PERBAIKAN: Menggunakan nama key yang sesuai dengan main_pi.py
    
    // 1. MAGNITUDO (HIJAU)
    renderSingleLine('chartMag', chartMag, c => chartMag = c, signals.magnitude_history, '#2d8a38');

    // 2. FASA (UNGU)
    renderSingleLine('chartPhase', chartPhase, c => chartPhase = c, signals.phase_history, '#9c27b0', {min: -3.5, max: 3.5});

    // 3. KOMPLEKS (KOSONG/DUMMY) 
    // Karena Python tidak mengirim raw I/Q (untuk hemat bandwidth), kita tampilkan garis nol
    const dummyZero = new Array(128).fill(0);
    renderComplexChart('chartComplex', chartComplex, c => chartComplex = c, dummyZero, dummyZero);

    // 4. DOPPLER (HITAM)
    renderSingleLine('chartDoppler', chartDoppler, c => chartDoppler = c, signals.doppler_spectrum, '#000000');
}

// Helper: Grafik 1 Garis
function renderSingleLine(id, chartObj, setChart, dataArr, color, yScaleOpt = {}) {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx || !dataArr) return;
    const xAxis = Array.from({length: dataArr.length}, (_, i) => i);

    if (chartObj) {
        chartObj.data.labels = xAxis;
        chartObj.data.datasets[0].data = dataArr;
        chartObj.update('none');
    } else {
        const config = {
            type: 'line',
            data: {
                labels: xAxis,
                datasets: [{ data: dataArr, borderColor: color, borderWidth: 1.2, fill: false }]
            },
            options: { ...commonOptions, scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, ...yScaleOpt } } }
        };
        setChart(new Chart(ctx, config));
    }
}

// Helper: Grafik Kompleks
function renderComplexChart(id, chartObj, setChart, realArr, imagArr) {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx) return;
    const xAxis = Array.from({length: realArr.length}, (_, i) => i);

    if (chartObj) {
        chartObj.data.datasets[0].data = realArr;
        chartObj.data.datasets[1].data = imagArr;
        chartObj.update('none');
    } else {
        const config = {
            type: 'line',
            data: {
                labels: xAxis,
                datasets: [
                    { label: 'Real', data: realArr, borderColor: '#00bcd4', borderWidth: 1 }, 
                    { label: 'Imag', data: imagArr, borderColor: '#ffc107', borderWidth: 1 }  
                ]
            },
            options: { ...commonOptions, plugins: { legend: { display: true } } }
        };
        setChart(new Chart(ctx, config));
    }
}

// --- LOOP CONTROL ---
function startLoop() {
    if (updateInterval) clearInterval(updateInterval);
    // Refresh setiap 5 detik (Cukup karena data masuk tiap 60 detik)
    updateInterval = setInterval(fetchData, 5000); 
}

// Start
fetchData();
startLoop();