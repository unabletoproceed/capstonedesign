// js/public_dashboard.js
import { supabase } from './supabase.js';

// State Variables
let allData = [];       // Stores the raw data from DB
let filteredData = [];  // Stores data after Search/Date filter
let currentPage = 1;
let rowsPerPage = 10;

// DOM Elements
const tableBody = document.getElementById('tableBody');
const loadingDiv = document.getElementById('loading-indicator');
const tableElement = document.getElementById('dataTable');
const pageInfo = document.getElementById('pageInfo');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

// ==========================================
// 1. FETCH DATA
// ==========================================
async function fetchData() {
    try {
        // Fetch last 1000 records (for performance, we limit the initial fetch)
        const { data, error } = await supabase
            .from('sim_data')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(1000);

        if (error) throw error;

        allData = data;
        filteredData = data; // Initially, filtered is same as all
        
        renderTable();
        loadingDiv.style.display = 'none';
        tableElement.style.display = 'table';

    } catch (err) {
        console.error('Error:', err);
        loadingDiv.innerHTML = '<span style="color:red">Gagal memuat data. Periksa koneksi.</span>';
    }
}

// ==========================================
// 2. RENDER TABLE
// ==========================================
function renderTable() {
    tableBody.innerHTML = '';

    // Pagination Logic
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const paginatedData = filteredData.slice(start, end);

    if (paginatedData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center">Tidak ada data ditemukan</td></tr>';
        return;
    }

    paginatedData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Format Date
        const dateObj = new Date(row.timestamp);
        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();

        // Determine Status Logic (Example: Alert if Discharge > 10)
        let statusBadge = '<span class="badge badge-normal">Normal</span>';
        if (row.discharge > 10 && row.discharge <= 15) {
            statusBadge = '<span class="badge badge-warning">Siaga</span>';
        } else if (row.discharge > 15) {
            statusBadge = '<span class="badge badge-danger">Bahaya</span>';
        }

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><strong>${row.velocity}</strong></td>
            <td>${row.discharge}</td>
            <td>${statusBadge}</td>
        `;
        tableBody.appendChild(tr);
    });

    updatePaginationControls();
}

// ==========================================
// 3. CONTROLS & FILTERS
// ==========================================

// Search Filter
document.getElementById('searchInput').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    filteredData = allData.filter(row => {
        // Search in date or values
        return row.timestamp.toLowerCase().includes(term) || 
               row.velocity.toString().includes(term);
    });
    currentPage = 1; // Reset to page 1
    renderTable();
});

// Date Filter
document.getElementById('dateFilter').addEventListener('change', (e) => {
    const selectedDate = e.target.value; // YYYY-MM-DD
    if (!selectedDate) {
        filteredData = allData; // Reset if empty
    } else {
        filteredData = allData.filter(row => row.timestamp.startsWith(selectedDate));
    }
    currentPage = 1;
    renderTable();
});

// Rows Per Page
document.getElementById('rowsPerPage').addEventListener('change', (e) => {
    rowsPerPage = parseInt(e.target.value);
    currentPage = 1;
    renderTable();
});

// ==========================================
// 4. PAGINATION
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
// 5. CSV DOWNLOAD
// ==========================================
window.downloadCSV = () => {
    if (filteredData.length === 0) {
        alert("Tidak ada data untuk diunduh");
        return;
    }

    let csv = 'Timestamp,Velocity (m/s),Discharge (m3/s)\n';
    
    filteredData.forEach(row => {
        csv += `${row.timestamp},${row.velocity},${row.discharge}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'river_data_export.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// Initialize
fetchData();