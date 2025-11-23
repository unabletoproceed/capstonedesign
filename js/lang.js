// js/lang.js

const translations = {
    id: {
        nav_home: "Beranda",
        nav_dash: "Dasbor Publik",
        nav_vis: "Visualisasi",
        nav_login: "Masuk",
        hero_title: "Sistem Estimasi Debit Air Sungai Berbasis Radar untuk Mendukung Mitigasi Dini Banjir",
        hero_desc: "Monitoring kecepatan arus dan debit sungai berbasis radar & IoT.",
        status_title: "Status Terkini",
        status_loading: "Memuat data...",
        map_title: "Lokasi Sungai",
        chart_vel_title: "Grafik Kecepatan (1 Jam Terakhir)",
        chart_dis_title: "Grafik Debit (1 Jam Terakhir)",
        toggle_btn: "EN",
        nav_learn: "Pelajari Selengkapnya",
        cta_text: "Ingin mengetahui detail teknis tentang pengolahan sinyal radar dan FFT?",
        cta_btn: "Ketuk Pelajari Selengkapnya →",
        dash_title: "Dasbor Langsung"
    },
    en: {
        nav_home: "Home",
        nav_dash: "Public Dashboard",
        nav_vis: "Visualization",
        nav_login: "Login",
        hero_title: "Radar-Based River Water Discharge Estimation System to Support Early Flood Mitigation",
        hero_desc: "Monitoring river current velocity and discharge based on radar & IoT.",
        status_title: "Current Status",
        status_loading: "Loading data...",
        map_title: "River Location",
        chart_vel_title: "Velocity Chart (Last 1 Hour)",
        chart_dis_title: "Discharge Chart (Last 1 Hour)",
        toggle_btn: "ID",
        nav_learn: "Learn More",
        cta_text: "Want to know technical details about radar signal processing and FFT?",
        cta_btn: "Tap to Learn More →",
        dash_title: "Live Dashboard"
    }
};

// 1. Check LocalStorage or default to 'id'
let currentLang = localStorage.getItem('language') || 'id';

// 2. Function to apply language
function applyLanguage(lang) {
    // Update all text elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[lang][key]) {
            element.textContent = translations[lang][key];
        }
    });

    // Update the Toggle Button text
    const btn = document.getElementById('lang-toggle');
    if (btn) btn.textContent = translations[lang].toggle_btn;

    // Save preference
    localStorage.setItem('language', lang);
    currentLang = lang;
}

// 3. Event Listener for the Button
document.addEventListener('DOMContentLoaded', () => {
    applyLanguage(currentLang); // Load saved language on startup

    const toggleBtn = document.getElementById('lang-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const newLang = currentLang === 'id' ? 'en' : 'id';
            applyLanguage(newLang);
        });
    }
});