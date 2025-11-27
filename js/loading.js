// js/loading.js

const loadingText = document.getElementById('loadingText');
const portalLayer = document.getElementById('portalLayer');

// 1. Wait for the water animation to fill screen (approx 3.5s - 4s)
setTimeout(() => {
    // Hide "Memuat..."
    loadingText.style.opacity = '0';
    
    // Show the Portal Cards
    portalLayer.classList.add('active');
    
    // Optional: Stop the water animation or just let it sit as the background
    // (Letting it sit is better, it acts as the blue background)

}, 4000); // 4 seconds matches your CSS animation duration