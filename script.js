// ==============================
// MOTO SAFE PRO - FINAL VERSION
// Realtime + Auto Session + G-Force
// ==============================

let monitoring = false;
let braking = false;

let startTime = 0;
let peakDecel = 0;
let duration = 0;
let distance = 0;
let impactForce = 0;

let sessions = [];

const BRAKE_THRESHOLD = 2.5;     // เริ่มเบรก
const STOP_THRESHOLD = 0.8;      // จบเบรก
const MIN_TIME = 0.5;

const G = 9.81; // gravity constant

// ================= TAB SYSTEM =================
function showTab(id) {
    document.querySelectorAll(".tab-content").forEach(tab => {
        tab.style.display = "none";
    });

    const target = document.getElementById(id);
    if (target) target.style.display = "block";
}

// ================= CHART =================
let brakeChart;

window.onload = function () {
    initChart();
    requestPermission();
};

function initChart() {
    const ctx = document.getElementById("brakeChart").getContext("2d");

    brakeChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label: "Deceleration (m/s²)",
                data: [],
                borderWidth: 2,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// ================= PERMISSION =================
function requestPermission() {

    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {

        DeviceMotionEvent.requestPermission()
            .then(state => {
                if (state === "granted") {
                    startMonitoring();
                }
            });

    } else {
        startMonitoring();
    }
}

function startMonitoring() {
    monitoring = true;
    window.addEventListener("devicemotion", handleMotion);
}

// ================= SENSOR =================
function handleMotion(event) {

    if (!monitoring) return;

    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    // ใช้แกน X เป็นทิศหน้า-หลัง
    const decel = Math.abs(acc.x || 0);

    const gForce = decel / G;

    updateText("decel", decel.toFixed(2) + " m/s²");

    // ================= REALTIME GRAPH =================
    const time = new Date().toLocaleTimeString();
    brakeChart.data.labels.push(time);
    brakeChart.data.datasets[0].data.push(decel);

    if (brakeChart.data.labels.length > 40) {
        brakeChart.data.labels.shift();
        brakeChart.data.datasets[0].data.shift();
    }

    brakeChart.update();

    // ================= AUTO BRAKE START =================
    if (!braking && decel > BRAKE_THRESHOLD) {

        braking = true;
        startTime = Date.now();
        peakDecel = 0;
        duration = 0;
        distance = 0;
        impactForce = 0;

        updateText("status", "🚨 Braking Detected");
    }

    // ================= DURING BRAKE =================
    if (braking) {

        duration = (Date.now() - startTime) / 1000;

        if (decel > peakDecel) peakDecel = decel;
        if (gForce > impactForce) impactForce = gForce;

        // Physics integration
        distance = 0.5 * peakDecel * duration * duration;

        updateText("duration", duration.toFixed(2) + " s");
        updateText("distance", distance.toFixed(2) + " m");
        updateText("speed", (peakDecel * duration * 3.6).toFixed(1) + " km/h");

        // ================= AUTO BRAKE END =================
        if (decel < STOP_THRESHOLD && duration > MIN_TIME) {
            finishSession();
        }
    }
}

// ================= FINISH SESSION =================
function finishSession() {

    braking = false;

    updateText("status", "Finished");

    const session = {
        peak: peakDecel,
        distance: distance,
        duration: duration,
        impact: impactForce,
        date: new Date().toLocaleString()
    };

    sessions.push(session);

    updateSessions();
    updateAnalytics();
}

// ================= SESSION LIST =================
function updateSessions() {

    const list = document.getElementById("sessionList");
    if (!list) return;

    list.innerHTML = "";

    sessions.forEach((s, i) => {
        list.innerHTML += `
            <div class="card">
                <h4>Session ${i + 1}</h4>
                <p>${s.date}</p>
                <p>Peak Decel: ${s.peak.toFixed(2)} m/s²</p>
                <p>Impact: ${s.impact.toFixed(2)} g</p>
                <p>Distance: ${s.distance.toFixed(2)} m</p>
                <p>Duration: ${s.duration.toFixed(2)} s</p>
            </div>
        `;
    });
}

// ================= ANALYTICS =================
function updateAnalytics() {

    if (sessions.length === 0) return;

    let total = 0;
    let best = sessions[0].distance;
    let max = sessions[0].peak;

    sessions.forEach(s => {
        total += s.distance;
        if (s.distance < best) best = s.distance;
        if (s.peak > max) max = s.peak;
    });

    updateText("avgDistance", (total / sessions.length).toFixed(2));
    updateText("bestDistance", best.toFixed(2));
    updateText("maxDecel", max.toFixed(2));
}

// ================= SAFE TEXT UPDATE =================
function updateText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}
