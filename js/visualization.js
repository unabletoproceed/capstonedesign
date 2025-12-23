import { supabase } from './supabase.js';

// --- CONFIG ---
const REAL_DEVICE_ID = 6;
const DEVICE_ID_SIM = 99;
const TABLE_NAME = 'sensor_readings';

let isSimulation = false;
let currentDeviceId = REAL_DEVICE_ID;
let updateInterval;

// Instance Chart
let chartInstance = null; // Trend Chart
let chartMag = null;      // Chart 1 (Hijau)
let chartPhase = null;    // Chart 2 (Ungu)
let chartRaw = null;      // Chart 3 (Complex - Biru/Kuning)
let chartDoppler = null;  // Chart 4 (Hitam)

// DOM Elements
const toggleBtn = document.getElementById('simToggle');
const modeDesc = document.getElementById('mode-desc');
const velDisplay = document.getElementById('val-vel'); // Pindah ke banner atas
// Element Banner
const elIndex = document.getElementById('val-index');
const elTinggi = document.getElementById('val-tinggi');
const elFreq = document.getElementById('val-freq');
const elSnr = document.getElementById('val-snr');
const elChirp = document.getElementById('val-chirp');

// ==========================================
// 1. CHART CONFIGURATION (STYLE WINDOWS)
// ==========================================
const commonChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // Matikan animasi agar snappy seperti desktop app
    elements: {
        point: { radius: 0 }, // Hilangkan titik bulat
        line: { borderWidth: 1.5, tension: 0 } // Garis tipis & tajam (bukan kurva)
    },
    scales: {
        x: {
            grid: { display: true, color: '#e0e0e0' }, // Tampilkan Grid X
            ticks: { color: '#333', font: { size: 10 } }
        },
        y: {
            grid: { display: true, color: '#e0e0e0' }, // Tampilkan Grid Y
            ticks: { color: '#333', font: { size: 10 } }
        }
    },
    plugins: { legend: { display: false } } // Hide legend default
};

// ==========================================
// 2. TOGGLE LOGIC
// ==========================================
if (toggleBtn) {
    toggleBtn.addEventListener('change', (e) => {
        isSimulation = e.target.checked;
        currentDeviceId = isSimulation ? DEVICE_ID_SIM : REAL_DEVICE_ID;
        modeDesc.innerHTML = isSimulation 
            ? `Mode: <strong>SIMULATION</strong> (ID: ${DEVICE_ID_SIM})` 
            : `Mode: <strong>REAL SITE</strong> (ID: ${REAL_DEVICE_ID})`;
        
        fetchData(); // Refresh immediate
    });
}

// ==========================================
// 3. DATA FETCHING
// ==========================================
async function fetchData() {
    try {
        // Ambil data terbaru
        const { data: latestData, error } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .eq('device_id', currentDeviceId)
            .order('timestamp', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (latestData && latestData.length > 0) {
            const row = latestData[0];
            updateBannerUI(row);
            
            // Update Grafik Teknis (Jika ada JSON)
            if (row.raw_json) {
                updateWindowsCharts(row.raw_json);
            } else if (isSimulation) {
                generateDummyTechData(); // Fallback untuk simulasi jika JSON kosong
            }
        }

        // Ambil trend history (untuk grafik bawah)
        const { data: historyData } = await supabase
            .from(TABLE_NAME)
            .select('timestamp, velocity, discharge')
            .eq('device_id', currentDeviceId)
            .order('timestamp', { ascending: false })
            .limit(50);

        if (historyData) updateTrendChart(historyData.reverse());

    } catch (err) {
        console.error("Fetch Error:", err.message);
    }
}

// ==========================================
// 4. UI UPDATER
// ==========================================
function updateBannerUI(row) {
    // Update angka-angka di atas sesuai gambar
    if(elIndex) elIndex.textContent = row.raw_json?.peak_index?.toFixed(4) || "-";
    if(elTinggi) elTinggi.textContent = row.water_level?.toFixed(2) || "-";
    if(elFreq) elFreq.textContent = row.raw_json?.doppler_freq?.toFixed(2) || "-";
    if(velDisplay) velDisplay.textContent = row.velocity?.toFixed(4) || "-";
    if(elSnr) elSnr.textContent = row.raw_json?.snr?.toFixed(2) || "-";
    if(elChirp) elChirp.textContent = "36.54"; // Hardcode atau ambil dari JSON jika ada
}

// ==========================================
// 5. WINDOWS STYLE CHART RENDERERS
// ==========================================
function updateWindowsCharts(json) {
    // 1. Chart A: History Magnitudo (HIJAU)
    renderChart('chartMag', chartMag, c => chartMag = c, 
        [json.mag_history || []], 
        ['#2d8a38'], // Hijau Tua
        { min: 90, max: 130 } // Range Y custom jika perlu
    );

    // 2. Chart B: History Fasa (UNGU)
    renderChart('chartPhase', chartPhase, c => chartPhase = c, 
        [json.phase_history || []], 
        ['#9c27b0'], // Ungu
        { min: -3.5, max: 3.5 } // Range Y Fase (-Pi sampai Pi)
    );

    // 3. Chart C: Sinyal Kompleks (BIRU & ORANYE)
    // Di sini kita butuh 2 dataset (Real & Imaginer)
    renderComplexChart('chartRaw', chartRaw, c => chartRaw = c, 
        json.raw_i || [], // Real
        json.raw_q || []  // Imag
    );

    // 4. Chart D: Spektrum Doppler (HITAM)
    renderChart('chartDoppler', chartDoppler, c => chartDoppler = c, 
        [json.doppler_spec || []], 
        ['#000000'], // Hitam
        { beginAtZero: true }
    );
}

// --- Helper: Standard Single Line Chart ---
function renderChart(id, chartObj, setChart, dataArrays, colors, yScales={}) {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx || !dataArrays[0]) return;
    
    // X Axis Labels (Index 0, 1, 2...)
    const labels = Array.from({length: dataArrays[0].length}, (_, i) => i);

    if (chartObj) {
        chartObj.data.labels = labels;
        chartObj.data.datasets[0].data = dataArrays[0];
        chartObj.options.scales.y = { ...chartObj.options.scales.y, ...yScales };
        chartObj.update('none');
    } else {
        const config = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: dataArrays[0],
                    borderColor: colors[0],
                    borderWidth: 1.5,
                    fill: false
                }]
            },
            options: { ...commonChartOptions }
        };
        // Apply custom Y scale if any
        if(Object.keys(yScales).length > 0) config.options.scales.y = { ...config.options.scales.y, ...yScales };
        
        setChart(new Chart(ctx, config));
    }
}

// --- Helper: Complex Chart (2 Lines: Real/Imag) ---
function renderComplexChart(id, chartObj, setChart, dataReal, dataImag) {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx) return;
    const labels = Array.from({length: dataReal.length}, (_, i) => i);

    if (chartObj) {
        chartObj.data.labels = labels;
        chartObj.data.datasets[0].data = dataReal;
        chartObj.data.datasets[1].data = dataImag;
        chartObj.update('none');
    } else {
        setChart(new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Real', data: dataReal, borderColor: '#00bcd4', borderWidth: 1.5 }, // Cyan
                    { label: 'Imag', data: dataImag, borderColor: '#ffc107', borderWidth: 1.5 }  // Kuning
                ]
            },
            options: {
                ...commonChartOptions,
                plugins: { legend: { display: true, position: 'top' } } // Tampilkan legenda khusus chart ini
            }
        }));
    }
}

// --- Dummy Generator untuk Demo ---
function generateDummyTechData() {
    const len = 250;
    const dummyJson = {
        mag_history: Array.from({length: len}, () => 105 + Math.random()*10),
        phase_history: Array.from({length: len}, () => (Math.random()-0.5)*0.5),
        raw_i: Array.from({length: len}, () => 100 + Math.random()*5),
        raw_q: Array.from({length: len}, () => -20 + Math.random()*10),
        doppler_spec: Array.from({length: len}, (_, i) => i===5 ? 14000 : Math.random()*100),
        peak_index: 1.0648,
        doppler_freq: 0.15,
        snr: 15.52
    };
    updateWindowsCharts(dummyJson);
    updateBannerUI({raw_json: dummyJson, velocity: 0.0028, water_level: 0.56});
}

// Trend Chart (Bawah)
function updateTrendChart(data) {
    const ctx = document.getElementById('realtimeChart')?.getContext('2d');
    if(!ctx) return;
    const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString());
    const vals = data.map(d => d.discharge);

    if (chartInstance) {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = vals;
        chartInstance.update('none');
    } else {
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Debit', data: vals, borderColor: '#3498db', fill: true }] },
            options: { ...commonChartOptions, maintainAspectRatio: false }
        });
    }
}

// Loop
function startLoop() {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(fetchData, 2000); // Cek data tiap 2 detik
}

fetchData();
startLoop();