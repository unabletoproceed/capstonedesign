// Fade loading text to white as water rises
setTimeout(() => {
    document.querySelector(".loading-text").style.color = "white";
}, 2000);

// Redirect after water fills
setTimeout(() => {
    window.location.href = "index.html";
}, 4200);

