// js/admin.js
import { supabase } from './supabase.js';

let currentDevices = [];

// 1. AUTH & INIT
async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) window.location.href = 'login.html';
    loadDevices();
}
init();

// DOM Elements
const deviceTableBody = document.getElementById('device-table-body');
const addForm = document.getElementById('add-device-form');
const editForm = document.getElementById('edit-device-form');
const manualForm = document.getElementById('manual-data-form');
const historyTableBody = document.getElementById('history-table-body');

// LOGOUT
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
});

// =========================================
//  LOAD DEVICES
// =========================================
async function loadDevices() {
    try {
        const { data, error } = await supabase.from('devices').select('*').order('id', { ascending: true });
        if (error) throw error;
        currentDevices = data;
        renderTable(data);
        updateStats(data);
    } catch (err) { console.error(err); }
}

function renderTable(devices) {
    if (!devices.length) {
        deviceTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center">Data kosong.</td></tr>`;
        return;
    }
    let html = '';
    devices.forEach(dev => {
        const statusColor = dev.status === 'online' ? 'online' : 'offline';
        const ipDisplay = dev.tailscale_ip ? `<code style="background:#eee;padding:2px 5px;border-radius:4px">${dev.tailscale_ip}</code>` : '-';

        html += `
            <tr>
                <td>#${dev.id}</td>
                <td><strong>${dev.name}</strong><br><small>${dev.location_lat.toFixed(4)}, ${dev.location_lng.toFixed(4)}</small></td>
                <td>${ipDisplay}</td>
                <td><span class="status-dot ${statusColor}"></span> ${dev.status.toUpperCase()}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-data" onclick="window.openManualData(${dev.id})" title="Input Data"><i class="fas fa-plus-circle"></i></button>
                        <button class="btn-icon btn-hist" onclick="window.openDataHistory(${dev.id})" title="Riwayat Data"><i class="fas fa-history"></i></button>
                        <button class="btn-icon btn-edit" onclick="window.openEditDevice(${dev.id})" title="Edit"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon btn-del" onclick="window.deleteDevice(${dev.id})" title="Hapus Alat"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
    });
    deviceTableBody.innerHTML = html;
}

function updateStats(devices) {
    const total = devices.length;
    const online = devices.filter(d => d.status === 'online').length;
    document.getElementById('total-devices').textContent = total;
    document.getElementById('online-devices').textContent = online;
    document.getElementById('offline-devices').textContent = total - online;
}

// =========================================
//  CREATE & EDIT DEVICE
// =========================================
addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    // ... (Logika sama seperti sebelumnya) ...
    const name = document.getElementById('dev-name').value;
    const lat = document.getElementById('dev-lat').value;
    const lng = document.getElementById('dev-lng').value;
    const ip = document.getElementById('dev-ip').value;
    const desc = document.getElementById('dev-desc').value;
    try {
        await supabase.from('devices').insert([{ name, location_lat: lat, location_lng: lng, tailscale_ip: ip, description: desc, status: 'offline' }]);
        document.getElementById('addDeviceModal').style.display = 'none';
        addForm.reset(); loadDevices();
    } catch (err) { alert(err.message); }
});

// =========================================
//  UPDATE: EDIT DEVICE
// =========================================

// 1. Buka Modal & Isi Data Lama
window.openEditDevice = (id) => {
    const dev = currentDevices.find(d => d.id === id);
    if (!dev) return;
c 
    // Simpan ID Asli (Primary Key lama) untuk referensi "WHERE"
    document.getElementById('original-id').value = dev.id;
    
    // Isi Form
    document.getElementById('edit-new-id').value = dev.id; // Defaultnya sama
    document.getElementById('edit-name').value = dev.name;
    document.getElementById('edit-lat').value = dev.location_lat;
    document.getElementById('edit-lng').value = dev.location_lng;
    document.getElementById('edit-ip').value = dev.tailscale_ip || '';
    document.getElementById('edit-status').value = dev.status;

    document.getElementById('editDeviceModal').style.display = 'flex';
};

// 2. Simpan Perubahan (Termasuk ID Baru)
editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const originalId = document.getElementById('original-id').value; // ID Lama (Target)
    const newId = document.getElementById('edit-new-id').value;      // ID Baru (Value)
    
    const updates = {
        id: newId, // Kita paksa update ID
        name: document.getElementById('edit-name').value,
        location_lat: document.getElementById('edit-lat').value,
        location_lng: document.getElementById('edit-lng').value,
        tailscale_ip: document.getElementById('edit-ip').value,
        status: document.getElementById('edit-status').value
    };

    try {
        // Cek dulu apakah ID Baru sudah dipakai alat lain?
        if (originalId !== newId) {
            const { data: existing } = await supabase
                .from('devices')
                .select('id')
                .eq('id', newId)
                .single();
            
            if (existing) {
                throw new Error(`Device ID ${newId} sudah digunakan oleh alat lain! Ganti angka lain.`);
            }
        }

        // Lakukan Update: "Ubah baris yang ID-nya Original-ID"
        const { error } = await supabase
            .from('devices')
            .update(updates)
            .eq('id', originalId);

        if (error) throw error;

        alert(`Berhasil! Device ID berubah dari ${originalId} menjadi ${newId}.`);
        document.getElementById('editDeviceModal').style.display = 'none';
        loadDevices(); // Refresh tabel

    } catch (err) {
        alert("Gagal update: " + err.message);
    }
});

// =========================================
//  MANUAL DATA ENTRY (WITH TIME)
// =========================================
window.openManualData = (id) => {
    const dev = currentDevices.find(d => d.id === id);
    document.getElementById('manual-dev-id').value = id;
    document.getElementById('manual-dev-name').textContent = dev.name;
    document.getElementById('manualDataModal').style.display = 'flex';
};

manualForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const device_id = document.getElementById('manual-dev-id').value;
    const velocity = document.getElementById('man-vel').value;
    const discharge = document.getElementById('man-dis').value;
    const water_level = document.getElementById('man-lvl').value || null;
    
    // AMBIL WAKTU MANUAL (Jika kosong, gunakan NOW)
    const timeInput = document.getElementById('man-time').value;
    const timestamp = timeInput ? new Date(timeInput).toISOString() : new Date().toISOString();

    try {
        const { error } = await supabase.from('sensor_readings').insert([{
            device_id, velocity, discharge, water_level, timestamp
        }]);
        if (error) throw error;
        alert("Data manual berhasil disimpan!");
        document.getElementById('manualDataModal').style.display = 'none';
        manualForm.reset();
    } catch (err) { alert("Gagal: " + err.message); }
});

// =========================================
//  DATA HISTORY & DELETE DATA (BARU)
// =========================================
window.openDataHistory = async (deviceId) => {
    const dev = currentDevices.find(d => d.id === deviceId);
    document.getElementById('history-dev-name').textContent = dev.name;
    
    // Tampilkan Modal dulu dengan status loading
    document.getElementById('dataHistoryModal').style.display = 'flex';
    historyTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center">Memuat riwayat...</td></tr>`;

    try {
        // Ambil data sensor_readings
        const { data, error } = await supabase
            .from('sensor_readings')
            .select('*')
            .eq('device_id', deviceId)
            .order('timestamp', { ascending: false }); // Paling baru diatas

        if (error) throw error;

        renderHistoryTable(data, deviceId); // Pass deviceId untuk reload nanti

    } catch (err) {
        historyTableBody.innerHTML = `<tr><td colspan="4" style="color:red">Error: ${err.message}</td></tr>`;
    }
};

function renderHistoryTable(data, deviceId) {
    if (!data || data.length === 0) {
        historyTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center">Belum ada data sensor.</td></tr>`;
        return;
    }

    let html = '';
    data.forEach(row => {
        const dateObj = new Date(row.timestamp);
        // Format Tanggal: DD/MM/YYYY HH:mm
        const dateStr = dateObj.toLocaleDateString('id-ID') + ' ' + dateObj.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});

        html += `
            <tr>
                <td>${dateStr}</td>
                <td style="font-weight:bold">${row.discharge.toFixed(2)}</td>
                <td>${row.velocity.toFixed(2)}</td>
                <td>
                    <button class="btn-icon btn-del" onclick="window.deleteReading(${row.id}, ${deviceId})" title="Hapus Data Ini">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    historyTableBody.innerHTML = html;
}

// DELETE SINGLE READING ROW
window.deleteReading = async (readingId, deviceId) => {
    if(!confirm("Hapus baris data ini?")) return;

    try {
        const { error } = await supabase
            .from('sensor_readings')
            .delete()
            .eq('id', readingId);

        if(error) throw error;

        // Reload tabel history tanpa tutup modal
        window.openDataHistory(deviceId); 

    } catch (err) {
        alert("Gagal menghapus: " + err.message);
    }
};

// =========================================
//  DELETE DEVICE (Dan semua datanya)
// =========================================
window.deleteDevice = async (id) => {
    if (!confirm("Hapus alat ini? SEMUA DATA SENSORNYA AKAN HILANG PERMANEN.")) return;
    try {
        await supabase.from('devices').delete().eq('id', id);
        loadDevices();
    } catch (err) { alert(err.message); }
};