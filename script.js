// ===============================
// MotoSafe Pro - Main Script
// ===============================

// ===== DOM =====
const speedDisplay = document.getElementById("speed");
const peakDisplay = document.getElementById("peak");
const distanceDisplay = document.getElementById("distance");
const durationDisplay = document.getElementById("duration");
const hardBrakeDisplay = document.getElementById("hardBrakes");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

// ===== Variables =====
let watchId = null;
let lastSpeed = 0;
let peakDecel = 0;
let totalDistance = 0;
let startTime = null;
let decelData = [];
let labels = [];

let totalBrakeEvents = 0;
let totalDecel = 0;
let maxPeakRecorded = 0;

// ===== Hard Brake System =====
const HARD_BRAKE_THRESHOLD = 3.5; // m/s²
let hardBrakeCount = 0;
let hardBrakeEvents = [];

// ===== Chart Setup =====
const ctx = document.getElementById("decelChart").getContext("2d");

const decelChart = new Chart(ctx, {
    type: "line",
    data: {
        labels: labels,
        datasets: [{
            label: "Deceleration (m/s²)",
            data: decelData,
            borderWidth: 2,
            fill: false,
            segment: {
                borderColor: ctx => {
                    return ctx.p1.parsed.y >= HARD_BRAKE_THRESHOLD
                        ? "red"
                        : "blue";
                }
            }
        }]
    },
    options: {
        responsive: true,
        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
});

// ===== Start Tracking =====
startBtn.addEventListener("click", () => {

    if (navigator.geolocation) {

        startTime = Date.now();

        watchId = navigator.geolocation.watchPosition(position => {

            const speed = position.coords.speed || 0; // m/s
            const speedKmh = speed * 3.6;

            speedDisplay.innerText = speedKmh.toFixed(1);

            // คำนวณ deceleration
            const decel = (lastSpeed - speed) / 1; 
            const decelAbs = Math.abs(decel);

            if (decel > 0) {

                peakDecel = Math.max(peakDecel, decelAbs);
                peakDisplay.innerText = peakDecel.toFixed(2);

                totalBrakeEvents++;
                totalDecel += decelAbs;
                maxPeakRecorded = Math.max(maxPeakRecorded, decelAbs);

                // ===== Hard Brake Detection =====
                if (decelAbs >= HARD_BRAKE_THRESHOLD) {

                    hardBrakeCount++;
                    hardBrakeDisplay.innerText = hardBrakeCount;

                    alert("⚠️ Hard Brake Detected!");

                    hardBrakeEvents.push({
                        time: new Date().toISOString(),
                        peak: decelAbs,
                        speed: speedKmh
                    });

                    saveHardBrakeLog();
                }

                // เพิ่มข้อมูลลงกราฟ
                decelData.push(decelAbs);
                labels.push(labels.length);

                decelChart.update();
            }

            // คำนวณระยะทาง
            totalDistance += speed;
            distanceDisplay.innerText = totalDistance.toFixed(2);

            // คำนวณเวลา
            const duration = (Date.now() - startTime) / 1000;
            durationDisplay.innerText = duration.toFixed(2);

            lastSpeed = speed;

        });

    } else {
        alert("Geolocation not supported");
    }

});

// ===== Stop Tracking =====
stopBtn.addEventListener("click", () => {

    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
    }

    updateSummary();
});

// ===== Update Summary =====
function updateSummary() {

    document.getElementById("totalBrakes").innerText = totalBrakeEvents;

    const avgDecel = totalBrakeEvents > 0
        ? totalDecel / totalBrakeEvents
        : 0;

    document.getElementById("avgDecel").innerText =
        avgDecel.toFixed(2);

    document.getElementById("meanDistance").innerText =
        totalBrakeEvents > 0
            ? (totalDistance / totalBrakeEvents).toFixed(2)
            : 0;

    document.getElementById("maxPeak").innerText =
        maxPeakRecorded.toFixed(2);

    hardBrakeDisplay.innerText = hardBrakeCount;
}

// ===== Save Hard Brake Log =====
function saveHardBrakeLog() {
    localStorage.setItem(
        "hardBrakeLogs",
        JSON.stringify(hardBrakeEvents)
    );
}
