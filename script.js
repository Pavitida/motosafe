let monitoring = false;
let startTime = 0;
let peakDecel = 0;
let speed = 0;
let distance = 0;
let duration = 0;
let sessions = [];

// Chart
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
maintainAspectRatio: false
}
});

// Tabs
function showTab(id) {
document.querySelectorAll('.tab-content')
.forEach(tab => tab.classList.remove('active'));
document.getElementById(id).classList.add('active');
}

// Start
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

window.addEventListener("devicemotion", handleMotion);
}

// Motion
function handleMotion(event) {
if (!monitoring) return;

const acc = event.accelerationIncludingGravity;
if (!acc) return;

const decel = Math.abs(acc.x || 0);
if (decel > peakDecel) peakDecel = decel;

duration = (Date.now() - startTime) / 1000;

speed = peakDecel * duration * 3.6;
distance = 0.5 * peakDecel * duration * duration;

document.getElementById("speed").innerText = speed.toFixed(1);
document.getElementById("decel").innerText = peakDecel.toFixed(2);
document.getElementById("distance").innerText = distance.toFixed(2);
document.getElementById("duration").innerText = duration.toFixed(2);

brakeChart.data.labels.push(duration.toFixed(2));
brakeChart.data.datasets[0].data.push(decel);
brakeChart.update();

if (duration > 3) stopMonitoring();
}

// Stop
function stopMonitoring() {
monitoring = false;
window.removeEventListener("devicemotion", handleMotion);
document.getElementById("status").innerText = "Finished";

sessions.push({
speed: speed,
peak: peakDecel,
distance: distance,
duration: duration,
date: new Date().toLocaleString()
});

updateSessions();
updateAnalytics();
}

// Sessions
function updateSessions() {
const list = document.getElementById("sessionList");
list.innerHTML = "";

sessions.forEach((s, i) => {
list.innerHTML += `
<div class="card">
<h4>Session ${i+1}</h4>
<p>${s.date}</p>
<p>Speed: ${s.speed.toFixed(1)}</p>
<p>Distance: ${s.distance.toFixed(2)} m</p>
</div>
`;
});
}

// Analytics
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

// Export CSV
function exportCSV() {
let csv = "Speed,Peak,Distance,Duration\n";
sessions.forEach(s => {
csv += `${s.speed},${s.peak},${s.distance},${s.duration}\n`;
});
const blob = new Blob([csv], { type: "text/csv" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "brake_sessions.csv";
a.click();
URL.revokeObjectURL(url);
}
