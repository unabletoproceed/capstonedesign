import { supabase } from './supabase.js';

// --- CONFIG ---
let isSimulation = false;
let activeTable = 'radar_data'; 
let chartInstance = null; // Main Chart

// Technical Chart Instances
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

// ==========================================
// 1. TOGGLE LOGIC (REAL VS SIM)
// ==========================================
toggleBtn.addEventListener('change', (e) => {
    isSimulation = e.target.checked;
    
    if (isSimulation) {
        activeTable = 'sim_data';
        modeDesc.innerHTML = "Mode: <strong>SIMULATION (Python)</strong>. Menggunakan data dummy.";
        modeDesc.style.color = "#e65100"; // Orange
    } else {
        activeTable = 'radar_data';
        modeDesc.innerHTML = "Mode: <strong>REAL SITE</strong>. Data historis dari sensor.";
        modeDesc.style.color = "#525f7f";
    }
    velDisplay.innerHTML = "...";
    refreshData(); // Instant refresh
});

// ==========================================
// 2. TOGGLE LOGIC (TECH DASHBOARD)
// ==========================================
techBtn.addEventListener('click', () => {
    if (techDashboard.style.display === 'none') {
        techDashboard.style.display = 'grid';
        techBtn.textContent = "❌ Sembunyikan Analisis Sinyal";
        setTimeout(() => {
            // Resize charts to fit grid
            if(chartRaw) chartRaw.resize();
            if(chartRange) chartRange.resize();
            if(chartMag) chartMag.resize();
            if(chartPhase) chartPhase.resize();
            if(chartDoppler) chartDoppler.resize();
        }, 100);
    } else {
        techDashboard.style.display = 'none';
        techBtn.textContent = "🛠️ Tampilkan Analisis Sinyal Lengkap (Debug Mode)";
    }
});

// ==========================================
// 3. DATA FETCHING LOOP
// ==========================================
async function refreshData() {
    try {
        // Fetch last 20 rows for the MAIN chart history
        const { data, error } = await supabase
            .from(activeTable)
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (data && data.length > 0) {
            const latest = data[0];

            // A. Update KPI Numbers
            velDisplay.innerHTML = `${latest.velocity} <small>m/s</small>`;
            disDisplay.innerHTML = `${latest.discharge} <small>m³/s</small>`;

            // B. Flood Logic (Threshold example: 20)
            if (latest.discharge > 20) {
                floodStatus.textContent = "BAHAYA BANJIR";
                floodStatus.className = "status-badge danger";
            } else {
                floodStatus.textContent = "AMAN";
                floodStatus.className = "status-badge safe";
            }

            // C. Update Main Chart
            const reversedData = [...data].reverse(); // Copy and reverse for chart
            updateMainChart(reversedData);

            // D. Update Technical Charts (Using raw_json from the LATEST row only)
            if (latest.raw_json) {
                updateTechnicalCharts(latest.raw_json);
            }
        }
    } catch (err) {
        console.error("Error fetching data:", err);
    }
}

// ==========================================
// 4. MAIN CHART RENDERER
// ==========================================
function updateMainChart(data) {
    const ctx = document.getElementById('realtimeChart').getContext('2d');
    const labels = data.map(row => new Date(row.timestamp).toLocaleTimeString());
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
                    borderColor: '#93DCEC',
                    backgroundColor: 'rgba(147, 220, 236, 0.2)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { intersect: false, mode: 'index' },
                scales: { x: { display: false }, y: { grid: { color: '#f0f0f0' } } }
            }
        });
    }
}

// ==========================================
// 5. TECHNICAL CHARTS RENDERER (5 Charts)
// ==========================================
function updateTechnicalCharts(json) {
    
    // 1. RAW I/Q
    renderLineChart('chartRaw', chartRaw, 
        (c) => chartRaw = c, 
        ['I', 'Q'], 
        [json.raw_i, json.raw_q], 
        ['blue', 'red']
    );

    // 2. RANGE FFT
    renderFilledChart('chartRange', chartRange, 
        (c) => chartRange = c, 
        'Magnitudo', json.range_fft, 'green'
    );

    // 3. MAG HISTORY
    renderLineChart('chartMag', chartMag, 
        (c) => chartMag = c, 
        ['History'], [json.mag_history], ['black']
    );

    // 4. PHASE HISTORY
    renderLineChart('chartPhase', chartPhase, 
        (c) => chartPhase = c, 
        ['Phase (Rad)'], [json.phase_history], ['magenta'], 
        { min: -3.5, max: 3.5 }
    );

    // 5. DOPPLER SPECTRUM
    renderFilledChart('chartDoppler', chartDoppler, 
        (c) => chartDoppler = c, 
        'Spectrum', json.doppler_spec, '#333'
    );
}

// Helper: Standard Line Chart (supports multiple datasets)
function renderLineChart(canvasId, chartObj, setChart, labels, dataArrays, colors, yScales = null) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    // Create simple labels 0, 1, 2...
    const xAxis = Array.from({length: dataArrays[0].length}, (_, i) => i);

    if (chartObj) {
        dataArrays.forEach((data, i) => {
            chartObj.data.datasets[i].data = data;
        });
        chartObj.update('none');
    } else {
        const datasets = labels.map((l, i) => ({
            label: l,
            data: dataArrays[i],
            borderColor: colors[i],
            borderWidth: 1.5,
            pointRadius: 0
        }));

        const options = { 
            animation: false, 
            plugins: { legend: { display: labels.length > 1 } }, 
            scales: { x: { display: false } } 
        };
        if(yScales) options.scales.y = yScales;

        setChart(new Chart(ctx, { type: 'line', data: { labels: xAxis, datasets }, options }));
    }
}

// Helper: Filled Area Chart
function renderFilledChart(canvasId, chartObj, setChart, label, data, color) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const xAxis = Array.from({length: data.length}, (_, i) => i);

    if (chartObj) {
        chartObj.data.datasets[0].data = data;
        chartObj.update('none');
    } else {
        setChart(new Chart(ctx, {
            type: 'line',
            data: {
                labels: xAxis,
                datasets: [{
                    label: label,
                    data: data,
                    borderColor: color,
                    backgroundColor: color.replace(')', ', 0.1)').replace('rgb', 'rgba').replace('#333', 'rgba(0,0,0,0.1)'), // Hacky opacity
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: true
                }]
            },
            options: { animation: false, plugins: { legend: { display: false } }, scales: { x: { display: false } } }
        }));
    }
}

// Run loop every 2 seconds
setInterval(refreshData, 2000);
refreshData();