// js/public_dashboard.js
import { supabase } from './supabase.js';

// State Variables
let allData = [];       // Menyimpan data mentah dari DB
let filteredData = [];  // Menyimpan data setelah difilter
let currentPage = 1;
let rowsPerPage = 10;

// DOM Elements
const tableBody = document.getElementById('tableBody');
const loadingDiv = document.getElementById('loading-indicator');
const tableElement = document.getElementById('dataTable');
const pageInfo = document.getElementById('pageInfo');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const deviceFilter = document.getElementById('deviceFilter'); // Elemen Filter Baru

// ==========================================
// 0. INIT (Load Devices dulu, baru Data)
// ==========================================
async function init() {
    await fetchDevices();
    await fetchData();
}

// ==========================================
// 1. FETCH DEVICES (Untuk Dropdown Filter)
// ==========================================
async function fetchDevices() {
    try {
        const { data, error } = await supabase
            .from('devices')
            .select('id, name')
            .order('name');

        if (error) throw error;

        // Isi Dropdown
        data.forEach(dev => {
            const option = document.createElement('option');
            option.value = dev.name; // Kita filter berdasarkan nama agar mudah di search box juga
            option.textContent = dev.name;
            deviceFilter.appendChild(option);
        });

    } catch (err) {
        console.error("Gagal load devices:", err);
    }
}

// ==========================================
// 2. FETCH DATA SENSOR
// ==========================================
async function fetchData() {
    try {
        loadingDiv.style.display = 'block';
        tableElement.style.display = 'none';

        // Fetch dari sensor_readings dan JOIN ke devices untuk ambil nama alat
        const { data, error } = await supabase
            .from('sensor_readings')
            .select(`
                timestamp,
                velocity,
                discharge,
                water_level,
                devices ( name ) 
            `)
            .order('timestamp', { ascending: false })
            .limit(2000); // Limit diperbesar sedikit

        if (error) throw error;

        // Flatten data structure (memindahkan nama device ke root object biar mudah)
        allData = data.map(row => ({
            ...row,
            device_name: row.devices ? row.devices.name : 'Unknown Device'
        }));

        filteredData = allData; 
        
        renderTable();
        loadingDiv.style.display = 'none';
        tableElement.style.display = 'table';

    } catch (err) {
        console.error('Error:', err);
        loadingDiv.innerHTML = '<span style="color:red">Gagal memuat data. Periksa koneksi.</span>';
    }
}

// ==========================================
// 3. RENDER TABLE
// ==========================================
function renderTable() {
    tableBody.innerHTML = '';

    // Pagination Logic
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const paginatedData = filteredData.slice(start, end);

    if (paginatedData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center">Tidak ada data ditemukan</td></tr>';
        return;
    }

    paginatedData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Format Date
        const dateObj = new Date(row.timestamp);
        const dateStr = dateObj.toLocaleDateString('id-ID') + ' ' + dateObj.toLocaleTimeString('id-ID');

        // Handle Null Values
        const velocity = row.velocity !== null ? row.velocity.toFixed(2) : '-';
        const discharge = row.discharge !== null ? row.discharge.toFixed(2) : '-';
        const waterLevel = row.water_level !== null ? row.water_level.toFixed(2) : '-';

        // Logic Status (Contoh: Berdasarkan Water Level atau Discharge)
        // Sesuaikan logika ini dengan kebutuhan lapangan Anda
        let statusBadge = '<span class="badge badge-normal" style="background:#2dce89; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem;">Aman</span>';
        
        // Contoh Logika Status (Ganti angka ini sesuai kebutuhan)
        if (row.discharge > 20) {
            statusBadge = '<span class="badge badge-danger" style="background:#f5365c; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem;">Bahaya</span>';
        } else if (row.discharge > 10) {
            statusBadge = '<span class="badge badge-warning" style="background:#fb6340; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem;">Siaga</span>';
        }

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><strong>${row.device_name}</strong></td>
            <td>${waterLevel}</td>
            <td>${velocity}</td>
            <td>${discharge}</td>
            <td>${statusBadge}</td>
        `;
        tableBody.appendChild(tr);
    });

    updatePaginationControls();
}

// ==========================================
// 4. CONTROLS & FILTERS
// ==========================================

// Fungsi Filter Utama (Menggabungkan semua filter)
function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const dateVal = document.getElementById('dateFilter').value;
    const deviceVal = document.getElementById('deviceFilter').value;

    filteredData = allData.filter(row => {
        // 1. Filter Search (Text)
        const matchesSearch = 
            row.timestamp.toLowerCase().includes(searchTerm) || 
            row.device_name.toLowerCase().includes(searchTerm);

        // 2. Filter Tanggal
        const matchesDate = dateVal ? row.timestamp.startsWith(dateVal) : true;

        // 3. Filter Device Dropdown
        const matchesDevice = deviceVal ? row.device_name === deviceVal : true;

        return matchesSearch && matchesDate && matchesDevice;
    });

    currentPage = 1; // Reset ke halaman 1 setiap filter berubah
    renderTable();
}

// Event Listeners untuk Filter
document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('dateFilter').addEventListener('change', applyFilters);
document.getElementById('deviceFilter').addEventListener('change', applyFilters);

// Rows Per Page
document.getElementById('rowsPerPage').addEventListener('change', (e) => {
    rowsPerPage = parseInt(e.target.value);
    currentPage = 1;
    renderTable();
});

// ==========================================
// 5. PAGINATION
// ==========================================
window.changePage = (direction) => {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    const newPage = currentPage + direction;

    if (newPage > 0 && newPage <= totalPages) {
        currentPage = newPage;
        renderTable();
    }
};

function updatePaginationControls() {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    
    prevBtn.disabled = (currentPage === 1);
    nextBtn.disabled = (currentPage === totalPages);
}

// ==========================================
// 6. CSV DOWNLOAD
// ==========================================
window.downloadCSV = () => {
    if (filteredData.length === 0) {
        alert("Tidak ada data untuk diunduh");
        return;
    }

    // Header CSV
    let csv = 'Timestamp,Device Name,Water Level (m),Velocity (m/s),Discharge (m3/s)\n';
    
    filteredData.forEach(row => {
        // Handle comma in timestamp or name to prevent CSV break
        const cleanName = row.device_name.replace(/,/g, ''); 
        csv += `${row.timestamp},${cleanName},${row.water_level},${row.velocity},${row.discharge}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `serabi_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// Start App
init();