// ==============================
// MOTO SAFE ULTIMATE VERSION
// GPS Speed + Real Brake Analysis + Crash Detection
// ==============================

let monitoring = false;
let braking = false;

let peakDecel = 0;
let startSpeed = 0;
let endSpeed = 0;
let duration = 0;
let startTime = 0;

let sessions = [];

const BRAKE_THRESHOLD = 2.5; // m/s²
const STOP_THRESHOLD = 0.8;
const CRASH_G = 8; // 8g ถือว่า crash
const G = 9.81;

let currentSpeed = 0; // km/h

// ================= START =================
function startMonitoring() {

    if (monitoring) return;

    monitoring = true;

    requestMotion();
    startGPS();

    updateText("status", "Monitoring...");
}

// ================= MOTION =================
function requestMotion() {
    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {

        DeviceMotionEvent.requestPermission()
            .then(state => {
                if (state === "granted") {
                    window.addEventListener("devicemotion", handleMotion);
                }
            });

    } else {
        window.addEventListener("devicemotion", handleMotion);
    }
}

function handleMotion(event) {

    if (!monitoring) return;

    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const decel = Math.abs(acc.x || 0);
    const gForce = decel / G;

    updateText("decel", decel.toFixed(2) + " m/s²");

    // ===== Crash Detection =====
    if (gForce > CRASH_G) {
        updateText("status", "💥 CRASH DETECTED!");
    }

    // ===== Detect Brake Start =====
    if (!braking && decel > BRAKE_THRESHOLD && currentSpeed > 5) {
        braking = true;
        startTime = Date.now();
        peakDecel = 0;
        startSpeed = currentSpeed;
        updateText("status", "🚨 Braking...");
    }

    if (braking) {

        duration = (Date.now() - startTime) / 1000;

        if (decel > peakDecel) peakDecel = decel;

        // End brake
        if (decel < STOP_THRESHOLD && duration > 0.5) {
            endSpeed = currentSpeed;
            finishSession();
        }
    }
}

// ================= GPS =================
function startGPS() {

    if (!navigator.geolocation) {
        alert("GPS not supported");
        return;
    }

    navigator.geolocation.watchPosition(position => {

        let speedMS = position.coords.speed; // m/s

        if (speedMS === null) return;

        currentSpeed = speedMS * 3.6; // convert to km/h
        updateText("speed", currentSpeed.toFixed(1) + " km/h");

        updateSpeedChart(currentSpeed);

    }, error => {
        console.log(error);
    }, {
        enableHighAccuracy: true,
        maximumAge: 1000
    });
}

// ================= CHART =================
let speedChart;

window.onload = function () {

    const ctx = document.getElementById("brakeChart").getContext("2d");

    speedChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label: "Speed (km/h)",
                data: [],
                borderWidth: 2,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
};

function updateSpeedChart(speed) {

    const time = new Date().toLocaleTimeString();

    speedChart.data.labels.push(time);
    speedChart.data.datasets[0].data.push(speed);

    if (speedChart.data.labels.length > 40) {
        speedChart.data.labels.shift();
        speedChart.data.datasets[0].data.shift();
    }

    speedChart.update();
}

// ================= FINISH SESSION =================
function finishSession() {

    braking = false;

    const speedDrop = startSpeed - endSpeed;

    const session = {
        startSpeed,
        endSpeed,
        speedDrop,
        peakDecel,
        duration,
        date: new Date().toLocaleString()
    };

    sessions.push(session);

    updateText("status", "Brake Recorded");

    updateSessions();
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
                <p>Start Speed: ${s.startSpeed.toFixed(1)} km/h</p>
                <p>End Speed: ${s.endSpeed.toFixed(1)} km/h</p>
                <p>Speed Drop: ${s.speedDrop.toFixed(1)} km/h</p>
                <p>Peak Decel: ${s.peakDecel.toFixed(2)} m/s²</p>
                <p>Duration: ${s.duration.toFixed(2)} s</p>
            </div>
        `;
    });
}

// ================= SAFE TEXT =================
function updateText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}
