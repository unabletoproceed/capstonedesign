import { supabase } from './supabase.js';

// --- CONFIGURATION ---
// IMPORTANT: Set this to match your "Safety Limit"
const DANGER_THRESHOLD = 20.0; // Discharge in m3/s

// DOM Elements
const statusTitle = document.getElementById('status-title');
const statusBadge = document.getElementById('status-badge');
const sceneBox = document.getElementById('scene-box');
const adviceTitle = document.getElementById('advice-title');
const adviceDesc = document.getElementById('advice-desc');
const adviceCard = document.querySelector('.advice-card');
const valDischarge = document.getElementById('val-discharge');
const valTime = document.getElementById('val-time');

// --- MAIN FUNCTION ---
async function updatePublicStatus() {
    try {
        // Fetch only the absolute latest data point
        const { data, error } = await supabase
            .from('radar_data') // Use REAL table
            .select('discharge, timestamp')
            .order('timestamp', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            const latest = data[0];
            const discharge = latest.discharge;
            const time = new Date(latest.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

            // Update Numbers
            valDischarge.textContent = discharge.toFixed(2);
            valTime.textContent = time;

            // --- LOGIC: SAFE OR DANGER? ---
            if (discharge > DANGER_THRESHOLD) {
                setDangerMode();
            } else {
                setSafeMode();
            }
        } else {
            statusTitle.textContent = "OFFLINE";
            adviceDesc.textContent = "Sensor sedang tidak mengirim data.";
        }

    } catch (err) {
        console.error("Public Error:", err);
        statusTitle.textContent = "ERROR";
    }
}

// --- UI HELPERS ---

function setSafeMode() {
    // 1. Header
    statusTitle.textContent = "AMAN";
    statusTitle.style.color = "#2dce89"; // Green
    
    statusBadge.textContent = "NORMAL";
    statusBadge.style.background = "#2dce89";

    // 2. Animation Scene
    sceneBox.classList.remove('danger-mode'); // Removes storm, shows sun & swimmer

    // 3. Advice Card
    adviceCard.className = "advice-card safe";
    adviceTitle.textContent = "Sungai Aman Dikunjungi";
    adviceDesc.textContent = "Arus sungai tenang. Aman untuk aktivitas memancing atau rekreasi air.";
}

function setDangerMode() {
    // 1. Header
    statusTitle.textContent = "BAHAYA";
    statusTitle.style.color = "#f5365c"; // Red
    
    statusBadge.textContent = "SIAGA 1";
    statusBadge.style.background = "#f5365c";

    // 2. Animation Scene
    sceneBox.classList.add('danger-mode'); // Adds storm, hides swimmer, shows warning

    // 3. Advice Card
    adviceCard.className = "advice-card danger";
    adviceTitle.textContent = "Hindari Area Sungai!";
    adviceDesc.textContent = "Debit air tinggi terdeteksi. Dilarang berenang atau mendekati bantaran sungai.";
}

// Update every 5 seconds
setInterval(updatePublicStatus, 5000);
updatePublicStatus();