// js/background.js

const canvas = document.getElementById('rippleCanvas');
const ctx = canvas.getContext('2d');

let width, height;
let ripples = [];

// 1. Resize Canvas agar Full Screen
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
}
window.addEventListener('resize', resize);
resize();

// 2. Class untuk setiap "Riak" (Gelombang)
class Ripple {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 0;       // Mulai dari kecil
        this.alpha = 1;        // Opacity penuh
        this.maxRadius = 150;   // Seberapa besar riaknya
        this.speed = 1.5;      // Seberapa cepat membesar
    }

    draw() {
        ctx.beginPath();
        // Warna Cyan (#93DCEC) sesuai tema kamu
        ctx.strokeStyle = `rgba(147, 220, 236, ${this.alpha})`; 
        ctx.lineWidth = 2;
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.closePath();
    }

    update() {
        this.radius += this.speed; // Membesar
        this.alpha -= 0.02;        // Memudar perlahan
    }
}

// 3. Deteksi Gerakan Mouse
// Kita gunakan "Throttle" sederhana agar tidak terlalu banyak riak
let lastX = 0;
let lastY = 0;

window.addEventListener('mousemove', (e) => {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const dist = Math.sqrt(dx*dx + dy*dy);

    // Hanya buat riak baru jika mouse bergerak lebih dari 30px
    // Ini mencegah layar penuh warna jika mouse diam
    if (dist > 130) {
        ripples.push(new Ripple(e.clientX, e.clientY));
        lastX = e.clientX;
        lastY = e.clientY;
    }
});

// Juga buat riak saat diklik
window.addEventListener('click', (e) => {
    // Buat riak yang lebih besar dan tebal saat klik
    const r = new Ripple(e.clientX, e.clientY);
    r.maxRadius = 180;
    r.speed = 2;
    ripples.push(r);
});

// 4. Animasi Loop
function animate() {
    // Hapus layar lama tapi tinggalkan jejak tipis (efek smooth)
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < ripples.length; i++) {
        ripples[i].update();
        ripples[i].draw();

        // Hapus riak jika sudah transparan
        if (ripples[i].alpha <= 0) {
            ripples.splice(i, 1);
            i--;
        }
    }
    requestAnimationFrame(animate);
}

animate();