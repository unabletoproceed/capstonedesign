// js/public_dashboard.js
import { supabase } from './supabase.js';

// State Variables
let allData = [];
let filteredData = [];
let currentPage = 1;
let rowsPerPage = 10;

// DOM Elements
const tableBody = document.getElementById('tableBody');
const loadingDiv = document.getElementById('loading-indicator');
const tableElement = document.getElementById('dataTable');
const pageInfo = document.getElementById('pageInfo');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const deviceFilter = document.getElementById('deviceFilter');

// INIT
async function init() {
    await fetchDevices();
    await fetchData();
}

// 1. FETCH DEVICES
async function fetchDevices() {
    try {
        const { data, error } = await supabase.from('devices').select('id, name').order('name');
        if (error) throw error;

        // Kosongkan opsi lama kecuali default
        deviceFilter.innerHTML = '<option value="">Semua Lokasi</option>';
        
        data.forEach(dev => {
            const option = document.createElement('option');
            option.value = dev.name;
            option.textContent = dev.name;
            deviceFilter.appendChild(option);
        });
    } catch (err) {
        console.error("Gagal load devices:", err);
    }
}

// 2. FETCH DATA (Dengan Debugging & Fallback)
async function fetchData() {
    try {
        loadingDiv.style.display = 'block';
        tableElement.style.display = 'none';

        console.log("Fetching Data...");

        // Query JOIN: sensor_readings -> devices
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
            .limit(1000);

        if (error) {
            console.error("Supabase Error:", error);
            throw error;
        }

        console.log("Raw Data Loaded:", data.length, "rows");

        if (data.length === 0) {
            console.warn("Tabel sensor_readings KOSONG atau RLS memblokir.");
        }

        // Mapping Data (Handle jika relasi devices NULL)
        allData = data.map(row => {
            // Cek apakah relasi devices berhasil diambil?
            const devName = (row.devices && row.devices.name) ? row.devices.name : 'Unknown/Deleted Device';
            
            return {
                ...row,
                device_name: devName
            };
        });

        filteredData = allData;
        renderTable();
        
        loadingDiv.style.display = 'none';
        tableElement.style.display = 'table';

    } catch (err) {
        console.error('Critical Error:', err);
        loadingDiv.innerHTML = `<span style="color:red">Error: ${err.message} <br> Cek Console (F12) untuk detail.</span>`;
    }
}

// 3. RENDER TABLE
function renderTable() {
    tableBody.innerHTML = '';

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const paginatedData = filteredData.slice(start, end);

    if (paginatedData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Tidak ada data ditemukan.</td></tr>';
        return;
    }

    paginatedData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Format Tanggal
        const dateObj = new Date(row.timestamp);
        const dateStr = dateObj.toLocaleDateString('id-ID') + ' ' + dateObj.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});

        // Handle Null
        const vel = row.velocity != null ? row.velocity.toFixed(2) : '-';
        const dis = row.discharge != null ? row.discharge.toFixed(2) : '-';
        const lvl = row.water_level != null ? row.water_level.toFixed(2) : '-';

        // Status Badge Logic
        let statusBadge = '<span class="badge badge-normal" style="background:#2dce89; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem;">Aman</span>';
        
        if (row.discharge > 20) {
            statusBadge = '<span class="badge badge-danger" style="background:#f5365c; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem;">Bahaya</span>';
        } else if (row.discharge > 10) {
            statusBadge = '<span class="badge badge-warning" style="background:#fb6340; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem;">Siaga</span>';
        }

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><strong>${row.device_name}</strong></td>
            <td>${lvl}</td>
            <td>${vel}</td>
            <td>${dis}</td>
            <td>${statusBadge}</td>
        `;
        tableBody.appendChild(tr);
    });

    updatePaginationControls();
}

// 4. FILTER FUNCTION
function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const dateVal = document.getElementById('dateFilter').value;
    const deviceVal = document.getElementById('deviceFilter').value;

    filteredData = allData.filter(row => {
        // Cek Nama Alat & Timestamp string
        const matchesSearch = 
            (row.timestamp && row.timestamp.toLowerCase().includes(searchTerm)) || 
            (row.device_name && row.device_name.toLowerCase().includes(searchTerm));

        // Cek Tanggal (StartWith YYYY-MM-DD)
        const matchesDate = dateVal ? row.timestamp.startsWith(dateVal) : true;

        // Cek Dropdown Device
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

// Pagination Helpers
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
    if (filteredData.length === 0) {
        alert("Tidak ada data untuk diunduh");
        return;
    }
    let csv = 'Timestamp,Device Name,Water Level (m),Velocity (m/s),Discharge (m3/s)\n';
    filteredData.forEach(row => {
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

// Start
init();