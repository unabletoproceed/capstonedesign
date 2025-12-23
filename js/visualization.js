import { supabase } from './supabase.js';

// --- CONFIG ---
const DEVICE_ID_REAL = 6;  // Sesuai main_pi.py
const DEVICE_ID_SIM  = 99; // ID Khusus untuk Simulation Sender
const TABLE_NAME = 'sensor_readings';

let isSimulation = false;
let currentDeviceId = DEVICE_ID_REAL;
let updateInterval;

// Instance Chart
let chartInstance = null; // Main Chart
let chartRaw = null;
let chartRange = null;
let chartMag = null;
let chartPhase = null;
let chartDoppler = null;

// DOM Elements
const toggleBtn = document.getElementById('simToggle');
const modeDesc = document.getElementById('mode-desc');
const velDisplay = document.getElementById('live-vel');
const disDisplay = document.getElementById('live-dis');
const floodStatus = document.getElementById('flood-status');
const techBtn = document.getElementById('techToggleBtn');
const techDashboard = document.getElementById('tech-dashboard');

// Summary Banner Elements
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
            modeDesc.innerHTML = `Mode: <strong>SIMULATION</strong>. Menunggu data dari 'simulation-sender.py' (ID: ${DEVICE_ID_SIM})`;
            modeDesc.style.color = "#e65100";
        } else {
            currentDeviceId = DEVICE_ID_REAL;
            modeDesc.innerHTML = `Mode: <strong>REAL SITE</strong>. Menunggu data dari 'main_pi.py' (ID: ${DEVICE_ID_REAL})`;
            modeDesc.style.color = "#525f7f";
        }

        // Reset Grafik agar bersih saat ganti mode
        resetCharts();
        
        // Refresh data langsung
        fetchData();
    });
}

function resetCharts() {
    if(chartInstance) {
        chartInstance.data.labels = [];
        chartInstance.data.datasets.forEach(ds => ds.data = []);
        chartInstance.update();
    }
    // Bersihkan chart teknis juga jika perlu
    // [chartRaw, chartRange...].forEach(...)
}

// ==========================================
// 2. DATA FETCHING (STRICT DATABASE ONLY)
// ==========================================
async function fetchData() {
    try {
        // A. Ambil 1 data terbaru (KPI & Tech Charts)
        const { data: latestData, error: errLatest } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .eq('device_id', currentDeviceId) // Filter sesuai mode
            .order('timestamp', { ascending: false })
            .limit(1);

        if (errLatest) throw errLatest;

        // B. Ambil History untuk Grafik Trend (20 data terakhir)
        const { data: historyData, error: errHist } = await supabase
            .from(TABLE_NAME)
            .select('timestamp, velocity, discharge')
            .eq('device_id', currentDeviceId) // Filter sesuai mode
            .order('timestamp', { ascending: false })
            .limit(50); // Ambil lebih banyak biar grafik smooth

        if (errHist) throw errHist;

        // --- UPDATE UI ---
        
        if (latestData && latestData.length > 0) {
            const row = latestData[0];
            updateUI(row.velocity, row.discharge, row.water_level, row.raw_json);
            
            // Update Tech Charts (Hanya jika JSON tersedia)
            if (row.raw_json) {
                updateTechnicalCharts(row.raw_json);
            }
        } else {
            // Jika data kosong di DB
            if(velDisplay) velDisplay.innerHTML = "-";
            if(disDisplay) disDisplay.innerHTML = "-";
        }

        if (historyData && historyData.length > 0) {
            updateMainChart(historyData.reverse());
        }

    } catch (err) {
        console.error("Fetch Error:", err.message);
        // Jangan update UI error agar tidak flickering, cukup console log
    }
}

// ==========================================
// 3. UI UPDATER
// ==========================================
function updateUI(vel, dis, level, json) {
    if(velDisplay) velDisplay.innerHTML = `${Number(vel).toFixed(3)} <small>m/s</small>`;
    if(disDisplay) disDisplay.innerHTML = `${Number(dis).toFixed(2)} <small>m³/s</small>`;

    // Update Summary Banner (Dari JSON jika ada, atau estimasi)
    if(json) {
        if(elIndex) elIndex.textContent = json.peak_index ? json.peak_index.toFixed(4) : "-";
        if(elFreq) elFreq.textContent = json.doppler_freq ? json.doppler_freq.toFixed(2) : "-";
        if(elSnr) elSnr.textContent = json.snr ? json.snr.toFixed(2) : "-";
    }
    if(elTinggi) elTinggi.textContent = level ? Number(level).toFixed(2) : "-";

    // Update Status Banjir
    if(floodStatus) {
        if (dis > 20) {
            floodStatus.textContent = "BAHAYA";
            floodStatus.className = "status-badge danger";
            floodStatus.style.backgroundColor = "#f5365c";
        } else if (dis > 10) {
            floodStatus.textContent = "SIAGA";
            floodStatus.className = "status-badge warning";
            floodStatus.style.backgroundColor = "#fb6340";
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

// A. Main Real-time Chart
function updateMainChart(data) {
    const ctx = document.getElementById('realtimeChart')?.getContext('2d');
    if (!ctx) return;

    const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString('id-ID'));
    const velData = data.map(d => d.velocity);
    const disData = data.map(d => d.discharge);

    if (chartInstance) {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = velData;
        chartInstance.data.datasets[1].data = disData;
        chartInstance.update('none'); // Animasi dimatikan agar responsif
    } else {
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Kecepatan', data: velData, borderColor: '#3498db', backgroundColor: 'rgba(52, 152, 219, 0.1)', yAxisID: 'y', fill: true, pointRadius: 0 },
                    { label: 'Debit', data: disData, borderColor: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.1)', yAxisID: 'y1', fill: true, pointRadius: 0 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    x: { display: false },
                    y: { type: 'linear', display: true, position: 'left' },
                    y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
                }
            }
        });
    }
}

// B. Technical Charts Updater
function updateTechnicalCharts(json) {
    if(!json) return;
    
    // Pastikan data JSON array tersedia, jika tidak (misal null), chart jangan update
    if(json.raw_i) renderLineChart('chartRaw', chartRaw, c => chartRaw = c, ['I', 'Q'], [json.raw_i, json.raw_q], ['blue', 'red']);
    if(json.range_fft) renderFilledChart('chartRange', chartRange, c => chartRange = c, 'Magnitudo', json.range_fft, 'green');
    if(json.mag_history) renderLineChart('chartMag', chartMag, c => chartMag = c, ['History'], [json.mag_history], ['#2d8a38']);
    if(json.phase_history) renderLineChart('chartPhase', chartPhase, c => chartPhase = c, ['Fasa'], [json.phase_history], ['magenta'], {min:-3.5, max:3.5});
    if(json.doppler_spec) renderFilledChart('chartDoppler', chartDoppler, c => chartDoppler = c, 'Spectrum', json.doppler_spec, 'black');
}

// --- Helper Chart Functions ---
function renderLineChart(id, chartObj, setChart, labels, dataArr, colors, yOpt) {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx || !dataArr || !dataArr[0]) return;
    const xAxis = Array.from({length: dataArr[0].length}, (_,i)=>i);

    if (chartObj) {
        dataArr.forEach((d, i) => { if(chartObj.data.datasets[i]) chartObj.data.datasets[i].data = d; });
        chartObj.update('none');
    } else {
        const datasets = labels.map((l, i) => ({
            label: l, data: dataArr[i], borderColor: colors[i], borderWidth: 1.5, pointRadius: 0
        }));
        const opts = { animation: false, plugins:{legend:{display:false}}, scales:{x:{display:false}, y:{...yOpt}} };
        setChart(new Chart(ctx, { type: 'line', data: { labels: xAxis, datasets }, options: opts }));
    }
}

function renderFilledChart(id, chartObj, setChart, label, data, color) {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx || !data) return;
    const xAxis = Array.from({length: data.length}, (_,i)=>i);

    if (chartObj) {
        chartObj.data.datasets[0].data = data;
        chartObj.update('none');
    } else {
        setChart(new Chart(ctx, {
            type: 'line',
            data: { labels: xAxis, datasets: [{ label, data, borderColor: color, backgroundColor: color, borderWidth: 1, pointRadius: 0, fill: true }] },
            options: { animation: false, plugins:{legend:{display:false}}, scales:{x:{display:false}} }
        }));
    }
}

// Tech Dashboard Toggle Listener
if (techBtn) {
    techBtn.addEventListener('click', () => {
        if (techDashboard.style.display === 'none') {
            techDashboard.style.display = 'grid';
            techBtn.textContent = "❌ Sembunyikan Analisis Sinyal";
            setTimeout(() => {
                [chartRaw, chartRange, chartMag, chartPhase, chartDoppler].forEach(c => c?.resize());
            }, 100);
        } else {
            techDashboard.style.display = 'none';
            techBtn.textContent = "🛠️ Tampilkan Analisis Sinyal Lengkap (Debug Mode)";
        }
    });
}

// --- LOOP CONTROL ---
function startLoop() {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(fetchData, 1000); // 1 Detik Refresh Rate
}

// Start Default
fetchData();
startLoop();