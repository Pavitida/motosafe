// ====== GLOBAL ======
let monitoring = false;
let startTime = 0;
let speed = 0;
let peakDecel = 0;
let distance = 0;
let duration = 0;
let logData = [];

// ====== CHART SETUP ======
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
            y: {
                beginAtZero: true
            }
        }
    }
});

// ====== START FUNCTION ======
function startMonitoring() {

    if (monitoring) return;

    monitoring = true;
    startTime = Date.now();
    peakDecel = 0;
    distance = 0;
    duration = 0;

    brakeChart.data.labels = [];
    brakeChart.data.datasets[0].data = [];
    brakeChart.update();

    document.getElementById("status").innerText = "Braking...";

    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {

        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === "granted") {
                    window.addEventListener("devicemotion", handleMotion);
                }
            })
            .catch(console.error);

    } else {
        window.addEventListener("devicemotion", handleMotion);
    }
}

// ====== HANDLE SENSOR ======
function handleMotion(event) {

    if (!monitoring) return;

    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const decel = Math.abs(acc.x || 0);

    if (decel > peakDecel) {
        peakDecel = decel;
    }

    const currentTime = Date.now();
    duration = (currentTime - startTime) / 1000;

    // simple physics estimation
    speed = peakDecel * duration * 3.6;
    distance = 0.5 * peakDecel * duration * duration;

    // update UI
    document.getElementById("speed").innerText = speed.toFixed(1);
    document.getElementById("decel").innerText = peakDecel.toFixed(2);
    document.getElementById("distance").innerText = distance.toFixed(2);
    document.getElementById("duration").innerText = duration.toFixed(2);

    // update chart
    brakeChart.data.labels.push(duration.toFixed(2));
    brakeChart.data.datasets[0].data.push(decel);
    brakeChart.update();

    // auto stop condition
    if (duration > 3) {
        stopMonitoring();
    }
}

// ====== STOP ======
function stopMonitoring() {

    monitoring = false;
    window.removeEventListener("devicemotion", handleMotion);

    document.getElementById("status").innerText = "Finished";

    // save log
    logData.push({
        speed: speed.toFixed(1),
        peak: peakDecel.toFixed(2),
        distance: distance.toFixed(2),
        duration: duration.toFixed(2)
    });

    updateTable();
}

// ====== TABLE ======
function updateTable() {

    const table = document.getElementById("logTable");
    table.innerHTML = "";

    logData.forEach(row => {
        table.innerHTML += `
            <tr>
                <td>${row.speed}</td>
                <td>${row.peak}</td>
                <td>${row.distance}</td>
                <td>${row.duration}</td>
            </tr>
        `;
    });
}

// ====== EXPORT CSV ======
function exportCSV() {

    let csv = "Speed,Peak Decel,Distance,Duration\n";

    logData.forEach(row => {
        csv += `${row.speed},${row.peak},${row.distance},${row.duration}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "brake_log.csv";
    a.click();

    URL.revokeObjectURL(url);
}
