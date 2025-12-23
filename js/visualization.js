import { supabase } from './supabase.js';

// --- CONFIG ---
const REAL_DEVICE_ID = 6; 
const TABLE_NAME = 'sensor_readings';
const OFFLINE_THRESHOLD_SEC = 75; // Batas waktu offline (detik). Python kirim tiap 60s, kasih buffer 15s.

let isSimulation = false;
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
            modeDesc.innerHTML = "Mode: <strong>SIMULATION</strong>. Menampilkan data Dummy.";
            modeDesc.style.color = "#e65100";
        } else {
            modeDesc.innerHTML = `Mode: <strong>REAL SITE</strong>. Mencari data Device ID: ${REAL_DEVICE_ID}...`;
            modeDesc.style.color = "#525f7f";
        }
        
        // Reset Chart
        if(chartInstance) {
            chartInstance.data.labels = [];
            chartInstance.data.datasets.forEach(ds => ds.data = []);
            chartInstance.update();
        }
        fetchData();
        startLoop();
    });
}

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
// 2. DATA FETCHING (SMART OFFLINE DETECTION)
// ==========================================
async function fetchData() {
    if (isSimulation) {
        generateDummyData();
        return;
    }

    try {
        // 1. Ambil 1 data terbaru
        const { data: latestData, error: errLatest } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .eq('device_id', REAL_DEVICE_ID)
            .order('timestamp', { ascending: false })
            .limit(1);

        if (errLatest) throw errLatest;

        // 2. Ambil history trend
        const { data: historyData } = await supabase
            .from(TABLE_NAME)
            .select('timestamp, velocity, discharge')
            .eq('device_id', REAL_DEVICE_ID)
            .order('timestamp', { ascending: false })
            .limit(20);

        // --- LOGIKA DETEKSI OFFLINE ---
        if (latestData && latestData.length > 0) {
            const row = latestData[0];
            
            // Hitung selisih waktu (UTC)
            const dataTime = new Date(row.timestamp).getTime();
            const nowTime = Date.now(); 
            // Supabase pakai UTC, pastikan browser handle timezone benar. 
            // Amannya, kita hitung selisih relatif.
            const diffSeconds = (nowTime - dataTime) / 1000;

            // Jika data lebih tua dari batas toleransi (misal 75 detik)
            if (diffSeconds > OFFLINE_THRESHOLD_SEC) {
                setOfflineUI(row.timestamp); // Tampilkan status Offline
            } else {
                // Data Fresh -> Tampilkan UI Normal
                if(modeDesc) {
                    modeDesc.innerHTML = `Mode: <strong>REAL SITE</strong>. <span style="color:green">● Online</span> (Update: ${new Date(row.timestamp).toLocaleTimeString()})`;
                }
                updateUI(row.velocity, row.discharge, row.water_level, false);
                
                // Update Tech Charts (Hanya jika online)
                if (row.raw_json) updateTechnicalCharts(row.raw_json);
            }
        } else {
            setOfflineUI(null); // Tidak ada data sama sekali
        }

        // Grafik trend tetap ditampilkan (sebagai history) walaupun offline
        if (historyData) {
            updateMainChart(historyData.reverse());
        }

    } catch (err) {
        console.error("Fetch Error:", err.message);
    }
}

// --- MODE OFFLINE/RESET ---
function setOfflineUI(lastTimestamp) {
    if(modeDesc) {
        const timeStr = lastTimestamp ? new Date(lastTimestamp).toLocaleString() : "Tidak ada data";
        modeDesc.innerHTML = `Mode: <strong>REAL SITE</strong>. <span style="color:red">● OFFLINE</span>. (Terakhir aktif: ${timeStr})`;
    }
    
    // Reset Angka Utama ke "-"
    updateUI(0, 0, 0, true);

    // Kosongkan Grafik Teknis
    [chartRaw, chartRange, chartMag, chartPhase, chartDoppler].forEach(chart => {
        if(chart) {
            chart.data.datasets.forEach(ds => ds.data = []);
            chart.update();
        }
    });
}

// ==========================================
// 3. UI UPDATER
// ==========================================
function updateUI(vel, dis, level, isOffline = false) {
    if (isOffline) {
        // Tampilan saat Offline
        if(velDisplay) velDisplay.innerHTML = `- <small>m/s</small>`;
        if(disDisplay) disDisplay.innerHTML = `- <small>m³/s</small>`;
        
        // Reset Banner
        if(elIndex) elIndex.textContent = "-";
        if(elTinggi) elTinggi.textContent = "-";
        if(elFreq) elFreq.textContent = "-";
        if(elSnr) elSnr.textContent = "-";

        // Badge Offline
        if(floodStatus) {
            floodStatus.textContent = "OFFLINE";
            floodStatus.className = "status-badge";
            floodStatus.style.backgroundColor = "#95a5a6"; // Abu-abu
            floodStatus.style.color = "#fff";
        }
        return;
    }

    // Tampilan Normal (Online)
    if(velDisplay) velDisplay.innerHTML = `${Number(vel).toFixed(3)} <small>m/s</small>`;
    if(disDisplay) disDisplay.innerHTML = `${Number(dis).toFixed(2)} <small>m³/s</small>`;

    // Update Summary Banner
    // Karena kolom ini tidak ada di database 'sensor_readings', 
    // kita hitung estimasi atau ambil dari raw_json jika nanti diupdate
    if(elTinggi) elTinggi.textContent = Number(level || 0).toFixed(2);
    
    // Angka dummy untuk data teknis (karena tidak disimpan di DB utama)
    // Atau bisa diambil dari raw_json nanti jika Python diupdate untuk kirim ini
    if(elIndex) elIndex.textContent = (Number(level) * 1.5).toFixed(4); 
    if(elFreq) elFreq.textContent = (Number(vel) * 45).toFixed(2);
    if(elSnr) elSnr.textContent = (10 + Math.random()).toFixed(2); // Variasi kecil

    // Status Banjir
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
// 4. CHART RENDERERS & DUMMY
// ==========================================
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

function updateTechnicalCharts(json) {
    if(!json) return;
    renderLineChart('chartRaw', chartRaw, c => chartRaw = c, ['I', 'Q'], [json.raw_i, json.raw_q], ['blue', 'red']);
    renderFilledChart('chartRange', chartRange, c => chartRange = c, 'Magnitudo', json.range_fft, 'green');
    renderLineChart('chartMag', chartMag, c => chartMag = c, ['History'], [json.mag_history], ['#2d8a38']);
    renderLineChart('chartPhase', chartPhase, c => chartPhase = c, ['Fasa'], [json.phase_history], ['magenta'], {min:-3.5, max:3.5});
    renderFilledChart('chartDoppler', chartDoppler, c => chartDoppler = c, 'Spectrum', json.doppler_spec, 'black');
}

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

function generateDummyData() {
    // Mode Simulasi (Sama seperti sebelumnya)
    const simVel = (Math.random() * 2).toFixed(3);
    const simDis = (simVel * 15).toFixed(2);
    const simLevel = (0.5 + Math.random() * 0.1).toFixed(2);
    updateUI(simVel, simDis, simLevel, false);

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
    
    // Dummy Tech Data
    const dummyArr = Array.from({length: 100}, (_, i) => Math.sin(i * 0.2 + Date.now()/100) * 50 + 50);
    const dummyJson = { raw_i: dummyArr, raw_q: dummyArr, range_fft: dummyArr, mag_history: dummyArr, phase_history: dummyArr.map(x=>(x/50)-1), doppler_spec: dummyArr };
    updateTechnicalCharts(dummyJson);
}

function startLoop() {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(fetchData, 2000); 
}

// Start
fetchData();
startLoop();