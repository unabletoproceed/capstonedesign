// js/home_public.js
import { supabase } from './supabase.js';

// --- KONFIGURASI BATAS (THRESHOLD) ---
const THRESHOLD_SIAGA = 10.0;  // Di atas 10 = SIAGA
const THRESHOLD_BAHAYA = 20.0; // Di atas 20 = BAHAYA

// Elemen DOM
const locationName = document.getElementById('location-name');
const statusText = document.getElementById('status-text');
const statusBadge = document.getElementById('status-badge');
const sceneBox = document.getElementById('scene-box');
const mainIcon = document.getElementById('main-icon');

const valDischarge = document.getElementById('val-discharge');
const valVelocity = document.getElementById('val-velocity');
const valTime = document.getElementById('val-time');
const adviceTitle = document.getElementById('advice-title');
const adviceDesc = document.getElementById('advice-desc');
const waLink = document.getElementById('wa-link');

// 1. Tangkap ID dari URL
const urlParams = new URLSearchParams(window.location.search);
const deviceId = urlParams.get('id');

// Redirect jika tidak ada ID
if (!deviceId) {
    alert("Pilih lokasi dulu!");
    window.location.href = 'public_map.html';
}

// ==========================================
// 2. FETCH DATA LENGKAP
// ==========================================
async function updateData() {
    try {
        // A. Ambil Info Lokasi (Nama Alat)
        const { data: device, error: devError } = await supabase
            .from('devices')
            .select('name')
            .eq('id', deviceId)
            .single();
            
        if (device) locationName.textContent = device.name;

        // B. Ambil Data Sensor (Readings)
        const { data: readings, error: readError } = await supabase
            .from('sensor_readings')
            .select('discharge, velocity, timestamp')
            .eq('device_id', deviceId)
            .order('timestamp', { ascending: false })
            .limit(1);

        if (readError) throw readError;

        if (readings && readings.length > 0) {
            const latest = readings[0];
            const discharge = latest.discharge;
            const velocity = latest.velocity;
            const time = new Date(latest.timestamp).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});

            // Update Angka
            valDischarge.textContent = discharge.toFixed(2);
            valVelocity.textContent = velocity.toFixed(2);
            valTime.textContent = time;

            // --- LOGIKA PENENTUAN STATUS ---
            if (discharge > THRESHOLD_BAHAYA) {
                setStatus('BAHAYA', discharge);
            } else if (discharge > THRESHOLD_SIAGA) {
                setStatus('SIAGA', discharge);
            } else {
                setStatus('AMAN', discharge);
            }

            // Update Link WA
            const textWA = `Info Banjir ${device?.name}: Status saat ini ${statusText.textContent} (Debit: ${discharge} m³/s).`;
            waLink.href = `https://wa.me/?text=${encodeURIComponent(textWA)}`;

        } else {
            // Data Kosong
            setOffline();
        }

    } catch (err) {
        console.error("Error:", err);
        statusText.textContent = "ERROR KONEKSI";
    }
}

// ==========================================
// 3. FUNGSI GANTI TAMPILAN (VISUAL)
// ==========================================
function setStatus(status, discharge) {
    // Reset kelas lama
    sceneBox.className = "scene-box"; 
    
    if (status === 'AMAN') {
        // 1. Tampilan AMAN
        statusText.textContent = "AMAN TERKENDALI";
        statusText.style.color = "#2dce89";
        
        statusBadge.textContent = "NORMAL";
        statusBadge.style.background = "#2dce89";
        
        sceneBox.classList.add('level-aman');
        mainIcon.className = "fas fa-check-circle"; // Centang

        adviceTitle.textContent = "Sungai Aman";
        adviceDesc.textContent = "Arus sungai tenang dan debit air rendah. Aman untuk beraktivitas.";
        adviceTitle.style.color = "#2dce89";

    } else if (status === 'SIAGA') {
        // 2. Tampilan SIAGA
        statusText.textContent = "STATUS SIAGA";
        statusText.style.color = "#FBC02D";
        
        statusBadge.textContent = "WASPADA";
        statusBadge.style.background = "#FBC02D";
        
        sceneBox.classList.add('level-siaga');
        mainIcon.className = "fas fa-exclamation-triangle"; // Tanda Seru

        adviceTitle.textContent = "Harap Waspada";
        adviceDesc.textContent = `Debit air meningkat (${discharge} m³/s). Arus mulai kencang. Hindari tepian sungai.`;
        adviceTitle.style.color = "#FBC02D";

    } else if (status === 'BAHAYA') {
        // 3. Tampilan BAHAYA
        statusText.textContent = "BAHAYA BANJIR!";
        statusText.style.color = "#c62828";
        
        statusBadge.textContent = "EVAKUASI";
        statusBadge.style.background = "#c62828";
        
        sceneBox.classList.add('level-bahaya');
        mainIcon.className = "fas fa-ban"; // Tanda Larangan

        adviceTitle.textContent = "JAUHI AREA SUNGAI!";
        adviceDesc.textContent = "Debit air kritis! Arus sangat kencang. Segera cari tempat yang lebih tinggi.";
        adviceTitle.style.color = "#c62828";
    }
}

function setOffline() {
    statusText.textContent = "DATA KOSONG";
    statusBadge.textContent = "OFFLINE";
    statusBadge.style.background = "#999";
    sceneBox.className = "scene-box level-aman"; // Default tampilan aman tapi abu
    mainIcon.className = "fas fa-plug";
    adviceTitle.textContent = "Sensor Tidak Aktif";
    adviceDesc.textContent = "Belum ada data yang dikirim dari lokasi ini.";
}

// Jalan!
updateData();
setInterval(updateData, 5000);