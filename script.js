let monitoring = false;
let braking = false;

let velocity = 0;
let distance = 0;
let peakDecel = 0;

let brakeStartTime = 0;
let brakeData = [];

let logs = [];

let lastTime = null;

const speedEl = document.getElementById("speed");
const decelEl = document.getElementById("decel");
const distanceEl = document.getElementById("distance");
const durationEl = document.getElementById("duration");
const statusEl = document.getElementById("status");

function startMonitoring() {
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().then(permission => {
      if (permission === 'granted') {
        window.addEventListener("devicemotion", handleMotion);
      }
    });
  } else {
    window.addEventListener("devicemotion", handleMotion);
  }
  monitoring = true;
}

function handleMotion(event) {
  if (!monitoring) return;

  const acc = event.accelerationIncludingGravity.y || 0;
  const now = Date.now();

  if (!lastTime) lastTime = now;
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  const decel = -acc;

  // integrate velocity
  velocity += decel * dt;
  if (velocity < 0) velocity = 0;

  // detect brake start
  if (!braking && decel > 2.5) {
    braking = true;
    brakeStartTime = now;
    peakDecel = decel;
    distance = 0;
    brakeData = [];
    statusEl.innerText = "Braking...";
  }

  if (braking) {
    peakDecel = Math.max(peakDecel, decel);
    distance += velocity * dt;
    brakeData.push({decel, velocity});

    // detect brake end
    if (decel < 0.5) {
      const duration = (now - brakeStartTime) / 1000;

      if (duration > 0.3) {
        finishBrake(duration);
      }

      braking = false;
      velocity = 0;
    }
  }

  speedEl.innerText = (velocity * 3.6).toFixed(1);
  decelEl.innerText = peakDecel.toFixed(2);
  distanceEl.innerText = distance.toFixed(2);
}

function finishBrake(duration) {
  durationEl.innerText = duration.toFixed(2);

  logs.push({
    speed: (velocity*3.6).toFixed(1),
    peak: peakDecel.toFixed(2),
    distance: distance.toFixed(2),
    duration: duration.toFixed(2)
  });

  addRow();
  statusEl.innerText = "Brake Recorded";
}

function addRow() {
  const tbody = document.querySelector("#logTable tbody");
  const row = tbody.insertRow();

  const last = logs[logs.length -1];

  row.insertCell(0).innerText = last.speed;
  row.insertCell(1).innerText = last.peak;
  row.insertCell(2).innerText = last.distance;
  row.insertCell(3).innerText = last.duration;
}

function exportCSV() {
  let csv = "Speed,PeakDecel,Distance,Duration\n";
  logs.forEach(l => {
    csv += `${l.speed},${l.peak},${l.distance},${l.duration}\n`;
  });

  const blob = new Blob([csv], {type: "text/csv"});
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "brake_log.csv";
  a.click();
}
