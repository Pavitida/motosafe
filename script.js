let monitoring = false;
let braking = false;

let startTime = 0;
let peakDecel = 0;
let duration = 0;
let distance = 0;
let speed = 0;

let sessions = [];

const BRAKE_THRESHOLD = 2.5;
const STOP_THRESHOLD = 1.0;
const MIN_BRAKE_TIME = 0.5;

// ===== TAB SYSTEM (แก้ปุ่มกดไม่ได้) =====
function showTab(id) {
    document.querySelectorAll(".tab-content").forEach(tab => {
        tab.style.display = "none";
    });

    document.getElementById(id).style.display = "block";
}

// ===== CHART =====
const ctx = document.getElementById('brakeChart').getContext('2d');

const brakeChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Deceleration (m/s²)',
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

// ===== START =====
function startMonitoring() {

    if (monitoring) return;

    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {

        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    beginMonitoring();
                } else {
                    alert("Motion permission denied.");
                }
            });

    } else {
        beginMonitoring();
    }
}

function beginMonitoring() {
    monitoring = true;
    document.getElementById("status").innerText = "Waiting for braking...";
    window.addEventListener("devicemotion", handleMotion);
}

// ===== SENSOR =====
function handleMotion(event) {

    if (!monitoring) return;

    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const decel = Math.abs(acc.x || 0);

    if (!braking && decel > BRAKE_THRESHOLD) {

        braking = true;
        startTime = Date.now();
        peakDecel = 0;
        duration = 0;
        distance = 0;
        speed = 0;

        brakeChart.data.labels = [];
        brakeChart.data.datasets[0].data = [];
        brakeChart.update();

        document.getElementById("status").innerText = "Braking detected!";
    }

    if (braking) {

        if (decel > peakDecel) peakDecel = decel;

        duration = (Date.now() - startTime) / 1000;

        // คำนวณ speed จาก a*t (ประมาณค่า)
        speed = peakDecel * duration * 3.6;

        distance = 0.5 * peakDecel * duration * duration;

        document.getElementById("decel").innerText = peakDecel.toFixed(2);
        document.getElementById("duration").innerText = duration.toFixed(2);
        document.getElementById("distance").innerText = distance.toFixed(2);
        document.getElementById("speed").innerText = speed.toFixed(1);

        brakeChart.data.labels.push(duration.toFixed(2));
        brakeChart.data.datasets[0].data.push(decel);
        brakeChart.update();

        if (decel < STOP_THRESHOLD && duration > MIN_BRAKE_TIME) {
            finishBrake();
        }
    }
}

// ===== FINISH =====
function finishBrake() {

    braking = false;
    document.getElementById("status").innerText = "Finished";

    const session = {
        speed,
        peak: peakDecel,
        distance,
        duration,
        date: new Date().toLocaleString()
    };

    sessions.push(session);
}
