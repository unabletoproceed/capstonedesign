// js/home_public.js
import { supabase } from './supabase.js';

// --- KONFIGURASI ---
const THRESHOLD_SIAGA = 10.0;
const THRESHOLD_BAHAYA = 20.0;

// DOM Elements
const locationName = document.getElementById('location-name');
const statusText = document.getElementById('status-text');
const statusBadge = document.getElementById('status-badge');
const sceneBox = document.getElementById('scene-box');
const mainIcon = document.getElementById('main-icon'); // Ini sekarang elemen <svg>

const valDischarge = document.getElementById('val-discharge');
const valVelocity = document.getElementById('val-velocity');
const valTime = document.getElementById('val-time');
const adviceTitle = document.getElementById('advice-title');
const adviceDesc = document.getElementById('advice-desc');
const waLink = document.getElementById('wa-link');

// DATA PATH ICON (Pengganti Class FontAwesome)
// Kita simpan kode gambar SVG-nya di sini
const ICONS = {
    // Icon Centang (Check Circle) - 512x512
    AMAN: {
        viewBox: "0 0 512 512",
        d: "M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628 0z"
    },
    // Icon Segitiga Seru (Exclamation Triangle) - 576x512
    SIAGA: {
        viewBox: "0 0 576 512",
        d: "M569.517 440.013C587.975 472.007 564.806 512 527.94 512H48.054c-36.937 0-59.999-40.055-41.577-71.987L246.423 23.985c18.467-32.009 64.72-31.951 83.154 0l239.94 416.028zM288 354c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z"
    },
    // Icon Larangan (Ban) - 512x512
    BAHAYA: {
        viewBox: "0 0 512 512",
        d: "M256 8C119.034 8 8 119.033 8 256s111.034 248 248 248 248-111.034 248-248S392.967 8 256 8zm130.108 117.892c65.448 65.448 70 165.481 20.677 235.637L150.47 105.216c70.204-49.356 170.226-44.735 235.638 20.676zM125.892 394.108c-65.448-65.448-70-165.481-20.677-235.637L361.53 406.784c-70.203 49.356-170.226 44.736-235.638-20.676z"
    },
    // Icon Silang / Offline (Times Circle) - 512x512
    OFFLINE: {
        viewBox: "0 0 512 512",
        d: "M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm121.6 313.1c4.7 4.7 4.7 12.3 0 17L338 377.6c-4.7 4.7-12.3 4.7-17 0L256 312l-65.1 65.6c-4.7 4.7-12.3 4.7-17 0L134.4 338c-4.7-4.7-4.7-12.3 0-17l65.6-65-65.6-65.1c-4.7-4.7-4.7-12.3 0-17l39.6-39.6c4.7-4.7 12.3-4.7 17 0l65.1 65.6 65.1-65.6c4.7-4.7 12.3-4.7 17 0l39.6 39.6c4.7 4.7 4.7 12.3 0 17L312 256l65.6 65.1z"
    }
};

// 1. TANGKAP ID
const urlParams = new URLSearchParams(window.location.search);
const deviceId = urlParams.get('id');
if (!deviceId) {
    alert("Pilih lokasi dulu!");
    window.location.href = 'public_map.html';
}

// 2. FETCH DATA
async function updateData() {
    try {
        const { data: device } = await supabase.from('devices').select('name').eq('id', deviceId).single();
        if (device) locationName.textContent = device.name;

        const { data: readings, error } = await supabase
            .from('sensor_readings')
            .select('*')
            .eq('device_id', deviceId)
            .order('timestamp', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (readings && readings.length > 0) {
            const latest = readings[0];
            const discharge = latest.discharge;
            const velocity = latest.velocity;
            const time = new Date(latest.timestamp).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});

            valDischarge.textContent = discharge.toFixed(2);
            valVelocity.textContent = velocity.toFixed(2);
            valTime.textContent = time;

            if (discharge > THRESHOLD_BAHAYA) {
                setStatus('BAHAYA', discharge);
            } else if (discharge > THRESHOLD_SIAGA) {
                setStatus('SIAGA', discharge);
            } else {
                setStatus('AMAN', discharge);
            }

            const textWA = `Info Banjir ${device?.name}: Status saat ini ${statusText.textContent} (Debit: ${discharge} m³/s).`;
            waLink.href = `https://wa.me/?text=${encodeURIComponent(textWA)}`;
        } else {
            setOffline();
        }
    } catch (err) {
        console.error("Error:", err);
        statusText.textContent = "KONEKSI ERROR";
    }
}

// 3. FUNGSI GANTI VISUAL (Updated for SVG)
function setStatus(status, discharge) {
    // Reset kelas container
    sceneBox.className = "scene-box"; 
    
    // Matikan Animasi Spinner Loading
    mainIcon.classList.remove('icon-spin'); 

    // Helper untuk ganti Path SVG
    const updateIcon = (type) => {
        const iconData = ICONS[type];
        mainIcon.setAttribute('viewBox', iconData.viewBox);
        // Kita cari elemen <path> di dalam <svg> dan ganti atribut 'd' nya
        const pathEl = mainIcon.querySelector('path');
        if(pathEl) pathEl.setAttribute('d', iconData.d);
    };

    if (status === 'AMAN') {
        statusText.textContent = "AMAN TERKENDALI";
        statusText.style.color = "#2dce89";
        statusBadge.textContent = "NORMAL";
        statusBadge.style.background = "#2dce89";
        
        sceneBox.classList.add('level-aman');
        
        // GANTI ICON: AMAN
        updateIcon('AMAN');

        adviceTitle.textContent = "Sungai Aman";
        adviceDesc.textContent = "Arus sungai tenang dan debit air rendah. Aman untuk beraktivitas.";
        adviceTitle.style.color = "#2dce89";

    } else if (status === 'SIAGA') {
        statusText.textContent = "STATUS SIAGA";
        statusText.style.color = "#FBC02D";
        statusBadge.textContent = "WASPADA";
        statusBadge.style.background = "#FBC02D";
        
        sceneBox.classList.add('level-siaga');
        
        // GANTI ICON: SIAGA
        updateIcon('SIAGA');

        adviceTitle.textContent = "Harap Waspada";
        adviceDesc.textContent = `Debit air meningkat (${discharge} m³/s). Arus mulai kencang. Hindari tepian sungai.`;
        adviceTitle.style.color = "#FBC02D";

    } else if (status === 'BAHAYA') {
        statusText.textContent = "BAHAYA BANJIR!";
        statusText.style.color = "#c62828";
        statusBadge.textContent = "EVAKUASI";
        statusBadge.style.background = "#c62828";
        
        sceneBox.classList.add('level-bahaya');
        
        // GANTI ICON: BAHAYA
        updateIcon('BAHAYA');

        adviceTitle.textContent = "JAUHI AREA SUNGAI!";
        adviceDesc.textContent = "Debit air kritis! Arus sangat kencang. Segera cari tempat yang lebih tinggi.";
        adviceTitle.style.color = "#c62828";
    }
}

function setOffline() {
    statusText.textContent = "DATA KOSONG";
    statusBadge.textContent = "OFFLINE";
    statusBadge.style.background = "#999";
    sceneBox.className = "scene-box level-aman"; 
    
    mainIcon.classList.remove('icon-spin');
    // GANTI ICON: OFFLINE
    const iconData = ICONS['OFFLINE'];
    mainIcon.setAttribute('viewBox', iconData.viewBox);
    const pathEl = mainIcon.querySelector('path');
    if(pathEl) pathEl.setAttribute('d', iconData.d);

    adviceTitle.textContent = "Sensor Tidak Aktif";
    adviceDesc.textContent = "Belum ada data yang dikirim dari lokasi ini.";
}

updateData();
setInterval(updateData, 5000);