import { supabase } from './supabase.js';

// --- CONFIG ---
const REAL_DEVICE_ID = 6;  
const SIM_DEVICE_ID = 99;  
const TABLE_NAME = 'sensor_readings';

let isSimulation = false;
let currentDeviceId = REAL_DEVICE_ID;
let updateInterval;

// Instance Chart
let chartInstance = null; // Trend Chart
let chartMag = null;      // 1. Hijau
let chartPhase = null;    // 2. Ungu
let chartKompleks = null; // 3. Biru/Kuning
let chartDoppler = null;  // 4. Hitam

// DOM Elements
const toggleBtn = document.getElementById('simToggle');
const modeDesc = document.getElementById('mode-desc');

// Summary Banner Elements
const elIndex = document.getElementById('val-index');
const elTinggi = document.getElementById('val-tinggi');
const elFreq = document.getElementById('val-freq');
const elVel = document.getElementById('val-vel');
const elSnr = document.getElementById('val-snr');

// ==========================================
// 1. TOGGLE LOGIC
// ==========================================
if (toggleBtn) {
    toggleBtn.addEventListener('change', (e) => {
        isSimulation = e.target.checked;
        if (isSimulation) {
            currentDeviceId = SIM_DEVICE_ID;
            modeDesc.innerHTML = `Mode: <strong>SIMULATION</strong>. Menampilkan data dari Python Sender (ID: ${SIM_DEVICE_ID})`;
            modeDesc.style.color = "#e65100";
        } else {
            currentDeviceId = REAL_DEVICE_ID;
            modeDesc.innerHTML = `Mode: <strong>REAL SITE</strong>. Menampilkan data Lapangan (ID: ${REAL_DEVICE_ID})`;
            modeDesc.style.color = "#525f7f";
        }
        resetCharts(); // Kosongkan grafik saat ganti mode
        fetchData();   // Ambil data baru
    });
}

function resetCharts() {
    [chartInstance, chartMag, chartPhase, chartKompleks, chartDoppler].forEach(chart => {
        if(chart) {
            chart.data.labels = [];
            chart.data.datasets.forEach(ds => ds.data = []);
            chart.update();
        }
    });
    // Reset angka
    [elIndex, elTinggi, elFreq, elVel, elSnr].forEach(el => el.textContent = "-");
}

// ==========================================
// 2. DATA FETCHING (STRICT DB ONLY)
// ==========================================
async function fetchData() {
    try {
        // Ambil 1 data terbaru (termasuk JSON array besar)
        const { data: latestData, error } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .eq('device_id', currentDeviceId)
            .order('timestamp', { ascending: false })
            .limit(1);

        if (error) throw error;

        // Ambil 50 data history untuk trend bawah
        const { data: historyData } = await supabase
            .from(TABLE_NAME)
            .select('timestamp, velocity, discharge')
            .eq('device_id', currentDeviceId)
            .order('timestamp', { ascending: false })
            .limit(50);

        // --- UPDATE UI ---
        if (latestData && latestData.length > 0) {
            const row = latestData[0];
            updateBanner(row);
            
            // PENTING: Update grafik 4 kotak hanya jika ada raw_json
            if (row.raw_json) {
                updateWindowsCharts(row.raw_json);
            }
        } 

        if (historyData && historyData.length > 0) {
            updateTrendChart(historyData.reverse());
        }

    } catch (err) {
        console.error("Fetch Error:", err.message);
    }
}

// ==========================================
// 3. UI & CHART UPDATERS
// ==========================================

function updateBanner(row) {
    const json = row.raw_json || {};
    // Prioritas ambil dari JSON jika ada (lebih akurat dari python), kalau tidak dari kolom biasa
    elIndex.textContent = json.peak_index ? json.peak_index.toFixed(4) : "-";
    elTinggi.textContent = row.water_level ? Number(row.water_level).toFixed(2) : "-";
    elFreq.textContent = json.doppler_freq ? json.doppler_freq.toFixed(2) : "-";
    elVel.textContent = row.velocity ? Number(row.velocity).toFixed(4) : "-";
    elSnr.textContent = json.snr ? json.snr.toFixed(2) : "-";
}

// Render 4 Grafik Ala Windows
function updateWindowsCharts(json) {
    if(!json) return;

    // 1. MAGNITUDO (Hijau)
    renderLineChart('chartMag', chartMag, c => chartMag = c, 
        ['Magnitudo'], [json.mag_history], ['#2d8a38']); // Hijau Tua

    // 2. FASA (Ungu) - Range Y fix -3 s/d 3
    renderLineChart('chartPhase', chartPhase, c => chartPhase = c, 
        ['Fasa'], [json.phase_history], ['#9c27b0'], {min:-3.5, max:3.5});

    // 3. KOMPLEKS (Biru & Kuning)
    // Asumsi json mengirim raw_i dan raw_q
    renderLineChart('chartKompleks', chartKompleks, c => chartKompleks = c, 
        ['Real (I)', 'Imag (Q)'], [json.raw_i, json.raw_q], ['#00bcd4', '#ffc107']);

    // 4. DOPPLER (Hitam)
    renderLineChart('chartDoppler', chartDoppler, c => chartDoppler = c, 
        ['Spectrum'], [json.doppler_spec], ['#000000']);
}

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
                datasets: [{ label: 'Kecepatan Arus (m/s)', data: velData, borderColor: '#3498db', backgroundColor: 'rgba(52, 152, 219, 0.1)', fill: true, pointRadius: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { x: { display: false } } }
        });
    }
}

// Helper Chart
function renderLineChart(id, chartObj, setChart, labels, dataArr, colors, yOpt) {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx || !dataArr || !dataArr[0]) return;
    const xAxis = Array.from({length: dataArr[0].length}, (_,i)=>i);

    if (chartObj) {
        dataArr.forEach((d, i) => { if(chartObj.data.datasets[i]) chartObj.data.datasets[i].data = d; });
        chartObj.update('none');
    } else {
        const datasets = labels.map((l, i) => ({
            label: l, data: dataArr[i], borderColor: colors[i], borderWidth: 1.2, pointRadius: 0, fill: false
        }));
        const opts = { 
            responsive: true, 
            maintainAspectRatio: false,
            animation: false, 
            plugins:{legend:{display: labels.length > 1}}, // Tampilkan legend cuma kalau dataset > 1
            scales:{
                x:{display:true, grid:{color:'#f0f0f0'}}, 
                y:{display:true, grid:{color:'#f0f0f0'}, ...yOpt}
            },
            elements: { line: { tension: 0 } } // Garis tajam (bukan curve)
        };
        setChart(new Chart(ctx, { type: 'line', data: { labels: xAxis, datasets }, options: opts }));
    }
}

// Loop 2 detik sekali (Cukup untuk real-site yg update 1 menit)
function startLoop() {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(fetchData, 2000); 
}

// Start
fetchData();
startLoop();