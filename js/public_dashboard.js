// js/public_dashboard.js
import { supabase } from './supabase.js';

// State Variables
let allData = [];
let filteredData = [];
let currentPage = 1;
let rowsPerPage = 10;

// DOM Elements
const tableBody = document.getElementById('tableBody');
const deviceFilter = document.getElementById('deviceFilter');
const pageInfo = document.getElementById('pageInfo');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

// ==========================================
// 0. INIT (PARALLEL FETCHING)
// ==========================================
async function init() {
    try {
        // Optimasi: Jalankan fetchDevices DAN fetchData secara bersamaan
        // Ini mengurangi waktu tunggu network secara signifikan
        await Promise.all([
            fetchDevices(),
            fetchData()
        ]);
    } catch (err) {
        console.error("Init Error:", err);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red; padding:20px;">Gagal memuat data. Cek koneksi.</td></tr>`;
    }
}

// 1. FETCH DEVICES
async function fetchDevices() {
    const { data, error } = await supabase.from('devices').select('name').order('name');
    if (error) throw error;

    // Simpan skeleton option pertama, tambahkan sisanya
    deviceFilter.innerHTML = '<option value="">Semua Lokasi</option>';
    data.forEach(dev => {
        const option = document.createElement('option');
        option.value = dev.name;
        option.textContent = dev.name;
        deviceFilter.appendChild(option);
    });
}

// 2. FETCH DATA SENSOR
async function fetchData() {
    // Fetch Data
    const { data, error } = await supabase
        .from('sensor_readings')
        .select(`timestamp, velocity, discharge, water_level, devices ( name )`)
        .order('timestamp', { ascending: false })
        .limit(1000);

    if (error) throw error;

    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Data Kosong</td></tr>';
        return;
    }

    // Mapping Data
    allData = data.map(row => ({
        ...row,
        device_name: (row.devices && row.devices.name) ? row.devices.name : 'Unknown'
    }));

    filteredData = allData;
    renderTable();
}

// 3. RENDER TABLE
function renderTable() {
    // Hapus Skeleton Loader
    tableBody.innerHTML = '';

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const paginatedData = filteredData.slice(start, end);

    if (paginatedData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Tidak ada data ditemukan.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment(); // Optimasi DOM render

    paginatedData.forEach(row => {
        const tr = document.createElement('tr');
        
        const dateObj = new Date(row.timestamp);
        // Format ringan agar JS tidak berat processnya
        const dateStr = dateObj.toLocaleString('id-ID', {
            timeZone: 'UTC', // <--- KUNCI: Paksa gunakan zona waktu UTC (+0)
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        const vel = row.velocity != null ? row.velocity.toFixed(2) : '-';
        const dis = row.discharge != null ? row.discharge.toFixed(2) : '-';
        const lvl = row.water_level != null ? row.water_level.toFixed(2) : '-';

        let badgeClass = 'badge-normal';
        let badgeText = 'Aman';
        
        if (row.discharge > 20) {
            badgeClass = 'badge-danger'; badgeText = 'Bahaya';
        } else if (row.discharge > 10) {
            badgeClass = 'badge-warning'; badgeText = 'Siaga';
        }

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><strong>${row.device_name}</strong></td>
            <td>${lvl}</td>
            <td>${vel}</td>
            <td>${dis}</td>
            <td><span class="badge ${badgeClass}">${badgeText}</span></td>
        `;
        fragment.appendChild(tr);
    });

    tableBody.appendChild(fragment);
    updatePaginationControls();
}

// 4. FILTER FUNCTION
function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const dateVal = document.getElementById('dateFilter').value;
    const deviceVal = document.getElementById('deviceFilter').value;

    filteredData = allData.filter(row => {
        const matchesSearch = 
            (row.timestamp && row.timestamp.toLowerCase().includes(searchTerm)) || 
            (row.device_name && row.device_name.toLowerCase().includes(searchTerm));
        const matchesDate = dateVal ? row.timestamp.startsWith(dateVal) : true;
        const matchesDevice = deviceVal ? row.device_name === deviceVal : true;
        return matchesSearch && matchesDate && matchesDevice;
    });

    currentPage = 1;
    renderTable();
}

// Event Listeners
document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('dateFilter').addEventListener('change', applyFilters);
document.getElementById('deviceFilter').addEventListener('change', applyFilters);
document.getElementById('rowsPerPage').addEventListener('change', (e) => {
    rowsPerPage = parseInt(e.target.value);
    currentPage = 1;
    renderTable();
});

// Pagination
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

// Download CSV
window.downloadCSV = () => {
    if (filteredData.length === 0) return alert("Tidak ada data");
    let csv = 'Timestamp,Device Name,Water Level (m),Velocity (m/s),Discharge (m3/s)\n';
    filteredData.forEach(r => csv += `${r.timestamp},${r.device_name},${r.water_level},${r.velocity},${r.discharge}\n`);
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `serabi_data.csv`;
    a.click();
};

// Start
init();