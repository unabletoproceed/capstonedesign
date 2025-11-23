// js/admin.js
import { supabase } from './supabase.js';

// DOM Elements
const tableBody = document.getElementById('adminTableBody');
const totalCountEl = document.getElementById('totalCount');
const lastStatusEl = document.getElementById('lastStatus');
const userInfoEl = document.getElementById('userInfo');

// Inputs
const inVelocity = document.getElementById('inVelocity');
const inDischarge = document.getElementById('inDischarge');
const addBtn = document.getElementById('addDataBtn');

// 1. AUTH GUARD (Security)
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = 'login.html'; // Kick out
    } else {
        userInfoEl.textContent = session.user.email;
        loadData(); // Load data only if logged in
    }
}

// 2. FETCH DATA & STATS
async function loadData() {
    try {
        // A. Get Total Count
        const { count } = await supabase
            .from('river_data_real')
            .select('*', { count: 'exact', head: true });
        
        totalCountEl.textContent = count || 0;

        // B. Get Table Data (Last 50)
        const { data, error } = await supabase
            .from('river_data_real')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(50);

        if (error) throw error;

        renderTable(data);
        updateLatestStatus(data[0]);

    } catch (err) {
        console.error("Error loading data:", err);
    }
}

// 3. RENDER TABLE
function renderTable(data) {
    tableBody.innerHTML = '';

    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Belum ada data.</td></tr>';
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        const dateStr = new Date(row.timestamp).toLocaleString();

        tr.innerHTML = `
            <td>#${row.id}</td>
            <td>${dateStr}</td>
            <td><strong>${row.velocity}</strong> m/s</td>
            <td>${row.discharge} m³/s</td>
            <td class="action-td">
                <button class="btn-delete" onclick="deleteRow(${row.id})">Hapus</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function updateLatestStatus(latest) {
    if (latest) {
        lastStatusEl.textContent = `V: ${latest.velocity} | Q: ${latest.discharge}`;
    } else {
        lastStatusEl.textContent = "Offline";
    }
}

// 4. DELETE FUNCTION (Attached to Window for onclick access)
window.deleteRow = async (id) => {
    if (confirm(`Yakin ingin menghapus data ID #${id}?`)) {
        try {
            const { error } = await supabase
                .from('river_data_real')
                .delete()
                .eq('id', id);

            if (error) throw error;
            
            // Refresh table
            loadData(); 

        } catch (err) {
            alert("Gagal menghapus: " + err.message);
        }
    }
};

// 5. MANUAL INSERT FUNCTION
addBtn.addEventListener('click', async () => {
    const vel = parseFloat(inVelocity.value);
    const dis = parseFloat(inDischarge.value);

    if (isNaN(vel) || isNaN(dis)) {
        alert("Mohon isi angka yang valid!");
        return;
    }

    addBtn.disabled = true;
    addBtn.textContent = "Menyimpan...";

    try {
        const { error } = await supabase
            .from('river_data_real')
            .insert({
                timestamp: new Date().toISOString(),
                velocity: vel,
                discharge: dis,
                moving_flag: true
                // We don't add raw_json here for manual entry, it will just be null
            });

        if (error) throw error;

        // Reset Inputs
        inVelocity.value = '';
        inDischarge.value = '';
        loadData(); // Refresh UI

    } catch (err) {
        alert("Error: " + err.message);
    } finally {
        addBtn.disabled = false;
        addBtn.textContent = "➕ Tambah Data Manual";
    }
});

// 6. LOGOUT
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
});

// Start
checkSession();