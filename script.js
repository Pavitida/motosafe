let monitoring = false;
let braking = false;

let startTime = 0;
let peakDecel = 0;
let duration = 0;
let distance = 0;

let sessions = [];

const BRAKE_THRESHOLD = 2.5;   // เริ่มเบรกเมื่อเกินค่านี้
const STOP_THRESHOLD = 1.0;    // หยุดเมื่อแรงต่ำกว่านี้
const MIN_BRAKE_TIME = 0.5;    // เบรกอย่างน้อย 0.5 วิ

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

// ===== START SYSTEM =====
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
            })
            .catch(console.error);

    } else {
        beginMonitoring();
    }
}

function beginMonitoring() {

    monitoring = true;
    document.getElementById("status").innerText = "Waiting for braking...";
    window.addEventListener("devicemotion", handleMotion);
}

// ===== SENSOR LOGIC =====
function handleMotion(event) {

    if (!monitoring) return;

    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const decel = Math.abs(acc.x || 0);

    // 🔥 ตรวจจับเริ่มเบรก
    if (!braking && decel > BRAKE_THRESHOLD) {

        braking = true;
        startTime = Date.now();
        peakDecel = 0;
        duration = 0;
        distance = 0;

        brakeChart.data.labels = [];
        brakeChart.data.datasets[0].data = [];
        brakeChart.update();

        document.getElementById("status").innerText = "Braking detected!";
    }

    // ระหว่างเบรก
    if (braking) {

        if (decel > peakDecel) peakDecel = decel;

        duration = (Date.now() - startTime) / 1000;

        // integration แบบง่าย (ประมาณค่า)
        distance += decel * 0.02;

        document.getElementById("decel").innerText = peakDecel.toFixed(2);
        document.getElementById("duration").innerText = duration.toFixed(2);
        document.getElementById("distance").innerText = distance.toFixed(2);

        brakeChart.data.labels.push(duration.toFixed(2));
        brakeChart.data.datasets[0].data.push(decel);
        brakeChart.update();

        // 🔥 ตรวจจับหยุดเบรก
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
        peak: peakDecel,
        distance: distance,
        duration: duration,
        date: new Date().toLocaleString()
    };

    sessions.push(session);

    updateSessions();
    updateAnalytics();
}

// ===== SESSIONS =====
function updateSessions() {

    const list = document.getElementById("sessionList");
    if (!list) return;

    list.innerHTML = "";

    sessions.forEach((s, i) => {
        list.innerHTML += `
            <div class="card">
                <h4>Session ${i + 1}</h4>
                <p>${s.date}</p>
                <p>Peak: ${s.peak.toFixed(2)} m/s²</p>
                <p>Distance: ${s.distance.toFixed(2)} m</p>
                <p>Duration: ${s.duration.toFixed(2)} s</p>
            </div>
        `;
    });
}

// ===== ANALYTICS =====
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

    document.getElementById("avgDistance").innerText =
        (total / sessions.length).toFixed(2);

    document.getElementById("bestDistance").innerText =
        best.toFixed(2);

    document.getElementById("maxDecel").innerText =
        max.toFixed(2);
}

// ===== EXPORT =====
function exportCSV() {

    if (sessions.length === 0) {
        alert("No sessions to export.");
        return;
    }

    let csv = "Peak,Distance,Duration,Date\n";

    sessions.forEach(s => {
        csv += `${s.peak},${s.distance},${s.duration},${s.date}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "brake_sessions.csv";
    a.click();

    URL.revokeObjectURL(url);
}
