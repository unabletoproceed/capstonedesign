// js/visualization.js
import { supabase } from './supabase.js';

// --- CONFIG ---
let isSimulation = false;
let updateInterval;
let chartInstance = null; // Main Trend Chart

// Technical Charts Instances
let chartMag = null;
let chartPhase = null;
let chartRaw = null; // Complex Signal
let chartDoppler = null;

// DOM Elements
const toggleBtn = document.getElementById('simToggle');
const modeDesc = document.getElementById('mode-desc');

// Summary Values
const valStatus = document.getElementById('val-status');
const valTinggi = document.getElementById('val-tinggi');
const valVel = document.getElementById('val-vel');
const valDis = document.getElementById('val-dis');
const valSnr = document.getElementById('val-snr');
const valTime = document.getElementById('val-time');

// ==========================================
// 1. TOGGLE LOGIC (REAL VS SIMULATION)
// ==========================================
if(toggleBtn) {
    toggleBtn.addEventListener('change', (e) => {
        isSimulation = e.target.checked;
        if (isSimulation) {
            modeDesc.innerHTML = "Mode: <strong>SIMULATION</strong>. Data Dummy / Generator.";
            modeDesc.style.color = "#e67e22"; 
        } else {
            modeDesc.innerHTML = "Mode: <strong>REAL SITE</strong>. Data historis dari sensor.";
            modeDesc.style.color = "#555";
        }
        runCycle(); // Instant refresh
    });
}

// ==========================================
// 2. DATA FETCHING & LOGIC
// ==========================================
async function runCycle() {
    if (isSimulation) {
        generateSimulationData();
    } else {
        await fetchRealData();
    }
}

async function fetchRealData() {
    try {
        // Ambil 20 data terakhir untuk Tren
        const { data, error } = await supabase
            .from('sensor_readings')
            .select('*') // Mengambil semua kolom termasuk raw_json (jika ada)
            .order('timestamp', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (data && data.length > 0) {
            const latest = data[0]; // Data paling baru

            // A. Update Summary Banner
            updateSummaryUI(latest);

            // B. Update Main Trend Chart (Perlu data array)
            // Reverse agar urutan waktu dari kiri (lama) ke kanan (baru)
            updateMainChart([...data].reverse());

            // C. Update Technical Charts
            // Jika kolom raw_json ada isinya, pakai itu. Jika tidak, pakai dummy.
            if (latest.raw_json) {
                updateTechnicalCharts(latest.raw_json);
            } else {
                generateDummyTechData(); // Fallback agar grafik tidak kosong
            }
        }
    } catch (err) {
        console.error("Error fetching data:", err);
    }
}

function generateSimulationData() {
    // Generate Random Values
    const simVel = (Math.random() * 2).toFixed(3);
    const simDis = (simVel * 15).toFixed(2);
    const simLevel = (Math.random() * 5).toFixed(2);
    
    // Fake Data Object
    const fakeData = {
        velocity: simVel,
        discharge: simDis,
        water_level: simLevel,
        timestamp: new Date().toISOString()
    };

    updateSummaryUI(fakeData);
    
    // Untuk chart trend, kita butuh array history palsu (atau push manual)
    // Di sini kita pakai update dummy tech data saja
    generateDummyTechData();
}

// ==========================================
// 3. UI UPDATE FUNCTIONS
// ==========================================
function updateSummaryUI(data) {
    valVel.innerText = parseFloat(data.velocity || 0).toFixed(3);
    valDis.innerText = parseFloat(data.discharge || 0).toFixed(2);
    valTinggi.innerText = parseFloat(data.water_level || 0).toFixed(2);
    
    const time = new Date(data.timestamp);
    valTime.innerText = time.toLocaleTimeString('id-ID');

    // Status Logika Sederhana
    const dis = parseFloat(data.discharge);
    if(dis > 20) {
        valStatus.innerText = "BAHAYA"; valStatus.style.color = "red";
    } else if (dis > 10) {
        valStatus.innerText = "SIAGA"; valStatus.style.color = "orange";
    } else {
        valStatus.innerText = "AMAN"; valStatus.style.color = "green";
    }
}

// ==========================================
// 4. CHART RENDERERS
// ==========================================

// --- A. MAIN TREND CHART (Line Chart Biasa) ---
function updateMainChart(data) {
    const ctx = document.getElementById('realtimeChart')?.getContext('2d');
    if(!ctx) return;

    const labels = data.map(row => new Date(row.timestamp).toLocaleTimeString('id-ID'));
    const values = data.map(row => row.discharge);

    if (chartInstance) {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = values;
        chartInstance.update();
    } else {
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Debit Air (m³/s)',
                    data: values,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { display: false }, y: { grid: { color: '#f0f0f0' } } },
                plugins: { legend: { display: false } }
            }
        });
    }
}

// --- B. TECHNICAL CHARTS UPDATER ---
function updateTechnicalCharts(json) {
    // 1. Mag History (Hijau)
    renderLineChart('chartMag', chartMag, (c) => chartMag = c, 
        ['Magnitudo'], [json.mag_history], ['#2d8a38']); // Hijau Tua

    // 2. Phase History (Ungu)
    renderLineChart('chartPhase', chartPhase, (c) => chartPhase = c, 
        ['Fasa'], [json.phase_history], ['#9c27b0'], { min: -3.5, max: 3.5 }); // Ungu

    // 3. Complex Signal (Biru & Oranye)
    // Di sini kita mapping raw_i dan raw_q ke satu chart
    renderLineChart('chartRaw', chartRaw, (c) => chartRaw = c, 
        ['Real', 'Imag'], [json.raw_i, json.raw_q], ['#03a9f4', '#ff9800']); // Biru Muda & Oranye

    // 4. Doppler Spectrum (Hitam)
    renderLineChart('chartDoppler', chartDoppler, (c) => chartDoppler = c, 
        ['Spectrum'], [json.doppler_spec], ['#000000']); // Hitam
}

// --- C. DUMMY DATA GENERATOR (Simulasi Visual) ---
function generateDummyTechData() {
    const len = 250;
    const dummyMag = Array.from({length: len}, () => 105 + (Math.random() - 0.5) * 10);
    const dummyPhase = Array.from({length: len}, () => (Math.random() - 0.5) * 0.5);
    const dummyReal = Array.from({length: len}, () => 100 + Math.random()*5);
    const dummyImag = Array.from({length: len}, () => -25 + Math.random()*10);
    
    // Doppler peak
    const dummyDoppler = Array(len).fill(10);
    dummyDoppler[0] = 14000; 
    dummyDoppler[50] = 500;

    const dummyJson = {
        mag_history: dummyMag,
        phase_history: dummyPhase,
        raw_i: dummyReal,
        raw_q: dummyImag,
        doppler_spec: dummyDoppler
    };
    updateTechnicalCharts(dummyJson);
}

// --- D. HELPER: GENERIC CHART RENDERER ---
// Fungsi sakti untuk membuat/update grafik Chart.js
function renderLineChart(canvasId, chartObj, setChartInstance, labels, dataArrays, colors, yAxisConfig = {}) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if(!ctx) return;

    // Buat sumbu X angka (0, 1, 2...)
    const dataLength = dataArrays[0]?.length || 0;
    const xAxis = Array.from({length: dataLength}, (_, i) => i);

    if (chartObj) {
        // Update Data Existing
        dataArrays.forEach((data, i) => {
            if(chartObj.data.datasets[i]) {
                chartObj.data.datasets[i].data = data;
            }
        });
        chartObj.update('none'); // Update tanpa animasi agar performa tinggi
    } else {
        // Buat Chart Baru
        const datasets = labels.map((l, i) => ({
            label: l,
            data: dataArrays[i],
            borderColor: colors[i],
            borderWidth: 1.5,
            pointRadius: 0, // Garis mulus tanpa titik
            fill: false,
            tension: 0 // Garis tajam (bukan kurva)
        }));

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { 
                legend: { display: labels.length > 1 } // Tampilkan legenda jika ada >1 garis
            },
            scales: {
                x: { 
                    display: true, 
                    grid: { display: true, color: '#f0f0f0' },
                    ticks: { maxTicksLimit: 10 }
                },
                y: { 
                    display: true, 
                    grid: { display: true, color: '#f0f0f0' },
                    ...yAxisConfig // Merge config tambahan (misal min/max)
                }
            }
        };

        setChartInstance(new Chart(ctx, { type: 'line', data: { labels: xAxis, datasets }, options }));
    }
}

// --- INIT ---
// Jalankan loop setiap 2 detik
setInterval(runCycle, 2000);
runCycle(); // Jalankan sekali di awal