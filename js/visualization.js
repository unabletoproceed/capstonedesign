// ==========================================
// KONFIGURASI SUPABASE
// ==========================================
const SUPABASE_URL = "https://ohbpqbhphpdlqzdnvtov.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYnBxYmhwaHBkbHF6ZG52dG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2ODM0MTIsImV4cCI6MjA3OTI1OTQxMn0.wh_4j201Ci6C3cR-gCnwwe6mt3hyS_BAqs_7mExezqY";

// Inisialisasi Client
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
// 1. TOGGLE LOGIC & STATUS UI
// ==========================================

// Fungsi Update Teks Status (Dipisah agar bisa dipanggil saat start)
function updateStatusUI() {
    if (isSimulation) {
        currentDeviceId = DEVICE_ID_SIM;
        if(modeDesc) {
            modeDesc.innerHTML = `Mode: <strong>SIMULATION</strong>. Menampilkan data dari 'simulation-sender.py' (ID: ${DEVICE_ID_SIM})`;
            modeDesc.style.color = "#e65100";
        }
    } else {
        currentDeviceId = DEVICE_ID_REAL;
        if(modeDesc) {
            modeDesc.innerHTML = `Mode: <strong>REAL SITE</strong>. Menampilkan data dari 'main_pi.py' (ID: ${DEVICE_ID_REAL})`;
            modeDesc.style.color = "#525f7f";
        }
    }
}

// [PENTING] Jalankan fungsi ini SATU KALI saat awal load agar status langsung muncul
updateStatusUI();

if (toggleBtn) {
    toggleBtn.addEventListener('change', (e) => {
        isSimulation = e.target.checked;
        updateStatusUI(); // Update teks saat tombol digeser
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
// 2. DATA FETCHING
// ==========================================
async function fetchData() {
    try {
        // Ambil Data Terbaru
        const { data: latest, error: errLatest } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .eq('device_id', currentDeviceId)
            .order('timestamp', { ascending: false })
            .limit(1);

        if (errLatest) throw errLatest;

        // Ambil History untuk Trend
        const { data: history, error: errHist } = await supabase
            .from(TABLE_NAME)
            .select('timestamp, velocity, discharge')
            .eq('device_id', currentDeviceId)
            .order('timestamp', { ascending: false })
            .limit(20);

        if (errHist) throw errHist;

        // Update UI
        if (latest && latest.length > 0) {
            const row = latest[0];
            updateUI(row);
            
            // Cek apakah ada data sinyal di dalam JSON
            if (row.raw_json && row.raw_json.signal_analysis) {
                renderTechCharts(row.raw_json.signal_analysis);
            } else {
                console.warn("Data masuk, tapi 'signal_analysis' tidak ditemukan di JSON.", row.raw_json);
            }
        } else {
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
        if(velDisplay) velDisplay.innerHTML = "-";
        if(disDisplay) disDisplay.innerHTML = "-";
        return;
    }

    if(velDisplay) velDisplay.innerHTML = `${Number(row.velocity).toFixed(3)} <small>m/s</small>`;
    if(disDisplay) disDisplay.innerHTML = `${Number(row.discharge).toFixed(3)} <small>m³/s</small>`;

    const json = row.raw_json || {};
    if(elIndex) elIndex.textContent = json.chirp_count ? json.chirp_count : "-";
    if(elTinggi) elTinggi.textContent = row.water_level ? Number(row.water_level).toFixed(2) : "-";
    if(elFreq) elFreq.textContent = json.sampling_rate_hz ? json.sampling_rate_hz.toFixed(1) : "-";
    if(elSnr) elSnr.textContent = "-";

    if(floodStatus) {
        if (row.water_level > 2.0) {
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

function updateTrendChart(data) {
    const ctx = document.getElementById('realtimeChart')?.getContext('2d');
    if (!ctx) return;

    const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString('id-ID'));
    const velData = data.map(d => d.velocity);

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

function renderTechCharts(signals) {
    renderSingleLine('chartMag', chartMag, c => chartMag = c, signals.magnitude_history, '#2d8a38');
    renderSingleLine('chartPhase', chartPhase, c => chartPhase = c, signals.phase_history, '#9c27b0', {min: -3.5, max: 3.5});
    
    const dummyZero = new Array(128).fill(0);
    renderComplexChart('chartComplex', chartComplex, c => chartComplex = c, dummyZero, dummyZero);
    
    renderSingleLine('chartDoppler', chartDoppler, c => chartDoppler = c, signals.doppler_spectrum, '#000000');
}

function renderSingleLine(id, chartObj, setChart, dataArr, color, yScaleOpt = {}) {
    const canvas = document.getElementById(id);
    if (!canvas || !dataArr) return;
    const ctx = canvas.getContext('2d');
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

function renderComplexChart(id, chartObj, setChart, realArr, imagArr) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
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

// Start Loop
function startLoop() {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(fetchData, 5000); 
}

// Init
fetchData();
startLoop();