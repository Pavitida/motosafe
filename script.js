// ======================================
// MotoSafe Pro - FINAL STABLE VERSION
// ======================================

let braking = false;
let brakeStartTime = 0;
let brakeDistance = 0;
let peakDecel = 0;
let brakeSamples = 0;

let velocity = 0;
let lastTime = 0;

let totalBrakeEvents = 0;
let totalHardBrakes = 0;
let totalPeakSum = 0;
let totalDistanceSum = 0;
let maxPeakRecorded = 0;

const BRAKE_START_THRESHOLD = -2.0;   // เริ่ม brake
const BRAKE_END_THRESHOLD = -0.5;     // ใช้ดูว่าหลุดจาก brake
const HARD_BRAKE_THRESHOLD = 4.0;     // แรงจริง
const MAX_DECEL_LIMIT = 12;           // กันค่าหลุด

// ===== DOM =====
const speedEl = document.getElementById("speed");
const peakEl = document.getElementById("peak");
const distanceEl = document.getElementById("distance");
const durationEl = document.getElementById("duration");

const totalBrakeEl = document.getElementById("totalBrakes");
const avgDecelEl = document.getElementById("avgDecel");
const meanDistanceEl = document.getElementById("meanDistance");
const maxPeakEl = document.getElementById("maxPeak");
const hardBrakeEl = document.getElementById("totalHardBrakes");

// ===== Chart =====
const ctx = document.getElementById("speedChart").getContext("2d");
const chart = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "Deceleration (m/s²)",
      data: [],
      borderWidth: 2,
      borderColor: "#4f8cff",
      tension: 0.25
    }]
  },
  options: {
    responsive: true,
    animation: false,
    scales: {
      y: { beginAtZero: true }
    }
  }
});

// ======================================
// START
// ======================================

async function startRide(){

  if (typeof DeviceMotionEvent.requestPermission === "function") {
    const permission = await DeviceMotionEvent.requestPermission();
    if (permission !== "granted") return;
  }

  velocity = 0;
  braking = false;
  lastTime = Date.now();

  window.addEventListener("devicemotion", handleMotion);
}

// ======================================
// MOTION
// ======================================

function handleMotion(event){

  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  if(dt <= 0) return;

  let accel = event.acceleration?.y;
  if(accel == null) return;

  // Deadzone กันสั่น
  if(Math.abs(accel) < 0.15) accel = 0;

  // ตัดค่าหลุด
  if(Math.abs(accel) > MAX_DECEL_LIMIT) return;

  velocity += accel * dt;

  if(Math.abs(velocity) < 0.05) velocity = 0;

  speedEl.innerText = Math.abs(velocity * 3.6).toFixed(1);

  // ===== เริ่ม Brake =====
  if(accel < BRAKE_START_THRESHOLD && !braking){

    braking = true;
    brakeStartTime = now;
    brakeDistance = 0;
    peakDecel = 0;
    brakeSamples = 0;

    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();
  }

  // ===== ระหว่าง Brake =====
  if(braking){

    brakeSamples++;

    brakeDistance += Math.abs(velocity) * dt;

    const decel = Math.abs(accel);

    if(decel > peakDecel){
      peakDecel = decel;
    }

    chart.data.labels.push("");
    chart.data.datasets[0].data.push(decel);
    chart.update();

    // ===== จบ Brake =====
    if(accel > BRAKE_END_THRESHOLD){

      braking = false;

      const duration = (Date.now() - brakeStartTime) / 1000;

      // กัน event หลอก
      if(brakeSamples < 5) return;

      totalBrakeEvents++;
      totalPeakSum += peakDecel;
      totalDistanceSum += brakeDistance;

      if(peakDecel > maxPeakRecorded){
        maxPeakRecorded = peakDecel;
      }

      // ===== HARD BRAKE =====
      if(peakDecel >= HARD_BRAKE_THRESHOLD){
        totalHardBrakes++;
        alert("⚠️ HARD BRAKE DETECTED!");
      }

      // ===== Update Card =====
      peakEl.innerText = peakDecel.toFixed(2);
      distanceEl.innerText = brakeDistance.toFixed(2);
      durationEl.innerText = duration.toFixed(2);

      // ===== Summary =====
      totalBrakeEl.innerText = totalBrakeEvents;
      avgDecelEl.innerText = (totalPeakSum / totalBrakeEvents).toFixed(2);
      meanDistanceEl.innerText = (totalDistanceSum / totalBrakeEvents).toFixed(2);
      maxPeakEl.innerText = maxPeakRecorded.toFixed(2);
      hardBrakeEl.innerText = totalHardBrakes;
    }
  }
}

// ======================================
// STOP
// ======================================

function stopRide(){
  window.removeEventListener("devicemotion", handleMotion);
}
