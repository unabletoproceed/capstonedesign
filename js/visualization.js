import { supabase } from './supabase.js';

// --- CONFIG ---
const REAL_DEVICE_ID = 6; // Target Device ID dari Python
const TABLE_NAME = 'sensor_readings'; // <--- NAMA TABEL YANG BENAR
let isSimulation = false;
let updateInterval;

// Instance Chart
let chartInstance = null; // Main Chart (Live Trend)
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
            modeDesc.innerHTML = "Mode: <strong>SIMULATION</strong>. Menampilkan data Dummy/Python.";
            modeDesc.style.color = "#e65100";
        } else {
            modeDesc.innerHTML = `Mode: <strong>REAL SITE</strong>. Data Device ID: ${REAL_DEVICE_ID}`;
            modeDesc.style.color = "#525f7f";
        }
        // Reset tampilan saat ganti mode
        if(chartInstance) {
            chartInstance.data.labels = [];
            chartInstance.data.datasets.forEach(ds => ds.data = []);
            chartInstance.update();
        }
        fetchData(); // Refresh immediate
        startLoop();
    });
}

// Tech Dashboard Toggle
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

// ==========================================
// 2. DATA FETCHING
// ==========================================
async function fetchData() {
    if (isSimulation) {
        // --- MODE SIMULASI (Dummy Generator) ---
        generateDummyData();
    } else {
        // --- MODE REAL SITE (Supabase) ---
        try {
            // 1. Ambil 1 data terbaru untuk angka-angka detail
            const { data: latestData, error: errLatest } = await supabase
                .from(TABLE_NAME) // <--- PAKE VARIABLE TABLE_NAME
                .select('*')
                .eq('device_id', REAL_DEVICE_ID)
                .order('timestamp', { ascending: false })
                .limit(1);

            if (errLatest) throw errLatest;

            // 2. Ambil history untuk grafik trend (20 data terakhir)
            const { data: historyData, error: errHist } = await supabase
                .from(TABLE_NAME) // <--- PAKE VARIABLE TABLE_NAME
                .select('timestamp, velocity, discharge')
                .eq('device_id', REAL_DEVICE_ID)
                .order('timestamp', { ascending: false })
                .limit(20);

            if (errHist) throw errHist;

            // Update UI jika ada data
            if (latestData && latestData.length > 0) {
                const row = latestData[0];
                // Asumsi row.water_level ada, jika tidak pakai 0
                updateUI(row.velocity, row.discharge, row.water_level || 0); 
                
                // Update Tech Charts jika ada raw_json
                if (row.raw_json) {
                    updateTechnicalCharts(row.raw_json);
                } else {
                    // Jika data real tidak punya raw_json, tampilkan dummy halus
                    generateDummyTechData(); 
                }
            } else {
                if(modeDesc) modeDesc.innerHTML = `Mode: <strong>REAL SITE</strong>. Menunggu data (ID: ${REAL_DEVICE_ID})... Tabel: ${TABLE_NAME}`;
            }

            if (historyData) {
                updateMainChart(historyData.reverse());
            }

        } catch (err) {
            console.error("Fetch Error:", err.message);
            if(modeDesc) modeDesc.innerText = `Error: ${err.message}`;
        }
    }
}

// --- FUNGSI GENERATOR DUMMY (SIMULASI) ---
function generateDummyData() {
    const simVel = (Math.random() * 2).toFixed(3);
    const simDis = (simVel * 15).toFixed(2);
    const simLevel = (0.5 + Math.random() * 0.1).toFixed(2);

    updateUI(simVel, simDis, simLevel);

    const now = new Date().toLocaleTimeString('id-ID');
    if (chartInstance) {
        chartInstance.data.labels.push(now);
        chartInstance.data.datasets[0].data.push(simVel);
        chartInstance.data.datasets[1].data.push(simDis);
        if (chartInstance.data.labels.length > 20) {
            chartInstance.data.labels.shift();
            chartInstance.data.datasets[0].data.shift();
            chartInstance.data.datasets[1].data.shift();
        }
        chartInstance.update('none');
    }
    generateDummyTechData();
}

function generateDummyTechData() {
    const dummyArr = Array.from({length: 100}, (_, i) => Math.sin(i * 0.2 + Date.now()/100) * 50 + 50);
    const dummySpec = Array.from({length: 100}, (_, i) => i===10 ? 1000 : Math.random()*50);
    
    const dummyJson = {
        raw_i: dummyArr, 
        raw_q: dummyArr.map(x => x + 20),
        range_fft: dummyArr,
        mag_history: dummyArr,
        phase_history: dummyArr.map(x => (x/50)-1),
        doppler_spec: dummySpec
    };
    updateTechnicalCharts(dummyJson);
}

// ==========================================
// 3. UI UPDATER
// ==========================================
function updateUI(vel, dis, level) {
    if(velDisplay) velDisplay.innerHTML = `${Number(vel).toFixed(3)} <small>m/s</small>`;
    if(disDisplay) disDisplay.innerHTML = `${Number(dis).toFixed(2)} <small>m³/s</small>`;

    // Update Summary Banner
    if(elIndex) elIndex.textContent = (Math.random() + 1).toFixed(4); // Dummy Index (karena tidak ada di DB)
    if(elTinggi) elTinggi.textContent = Number(level).toFixed(2);
    if(elFreq) elFreq.textContent = (Number(vel) * 50).toFixed(2); // Estimasi
    if(elSnr) elSnr.textContent = (10 + Math.random() * 5).toFixed(2);

    // Update Status
    if(floodStatus) {
        if (dis > 20) {
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
        chartInstance.update();
    } else {
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Kecepatan', data: velData, borderColor: '#3498db', yAxisID: 'y' },
                    { label: 'Debit', data: disData, borderColor: '#2ecc71', yAxisID: 'y1' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
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
    renderLineChart('chartRaw', chartRaw, c => chartRaw = c, ['I', 'Q'], [json.raw_i, json.raw_q], ['blue', 'red']);
    renderFilledChart('chartRange', chartRange, c => chartRange = c, 'Magnitudo', json.range_fft, 'green');
    renderLineChart('chartMag', chartMag, c => chartMag = c, ['History'], [json.mag_history], ['#2d8a38']);
    renderLineChart('chartPhase', chartPhase, c => chartPhase = c, ['Fasa'], [json.phase_history], ['magenta'], {min:-3.5, max:3.5});
    renderFilledChart('chartDoppler', chartDoppler, c => chartDoppler = c, 'Spectrum', json.doppler_spec, 'black');
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

// --- LOOP CONTROL ---
function startLoop() {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(fetchData, 1000); // 1 Detik Refresh Rate
}

// Start
fetchData();
startLoop();