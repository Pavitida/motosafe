// ======================================
// MotoSafe Pro - Clean Stable Final
// ======================================

let braking = false;
let brakeStartTime = 0;
let brakeDistance = 0;
let peakDecel = 0;

let velocity = 0;
let lastTime = 0;

let totalBrakeEvents = 0;
let totalPeakSum = 0;
let totalDistanceSum = 0;
let maxPeakRecorded = 0;

const BRAKE_THRESHOLD = 1.5;

// ===== DOM =====
const speedEl = document.getElementById("speed");
const peakEl = document.getElementById("peak");
const distanceEl = document.getElementById("distance");
const durationEl = document.getElementById("duration");

const totalBrakeEl = document.getElementById("totalBrakes");
const avgDecelEl = document.getElementById("avgDecel");
const meanDistanceEl = document.getElementById("meanDistance");
const maxPeakEl = document.getElementById("maxPeak");

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
      tension: 0.3
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

// ===== Low-pass filter =====
let filteredAccel = 0;
const alpha = 0.2;

// ======================================
// START
// ======================================

async function startRide(){

  if (typeof DeviceMotionEvent.requestPermission === "function") {
    const permission = await DeviceMotionEvent.requestPermission();
    if (permission !== "granted") {
      alert("Motion permission denied");
      return;
    }
  }

  // 🔥 RESET ทุกอย่าง
  velocity = 0;
  filteredAccel = 0;
  braking = false;

  speedEl.innerText = "0.0";
  peakEl.innerText = "0.00";
  distanceEl.innerText = "0.00";
  durationEl.innerText = "0.00";

  lastTime = Date.now();

  window.addEventListener("devicemotion", handleMotion);
}

// ======================================
// MOTION HANDLER
// ======================================

function handleMotion(event){

  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if(dt <= 0) return;

  const rawAccel = event.accelerationIncludingGravity?.y;
  if(rawAccel == null) return;

  // Smooth ค่า
  filteredAccel = alpha * rawAccel + (1 - alpha) * filteredAccel;

  // กัน noise เล็ก ๆ ไม่ให้ drift
  if(Math.abs(filteredAccel) < 0.1) return;

  velocity += filteredAccel * dt;

  // กันค่าหลุด
  if(Math.abs(velocity) > 50) velocity = 0;

  const speedKMH = Math.abs(velocity * 3.6);
  speedEl.innerText = speedKMH.toFixed(1);

  // ===== เริ่ม Brake Event =====
  if(filteredAccel < -BRAKE_THRESHOLD && !braking){

    braking = true;
    brakeStartTime = now;
    brakeDistance = 0;
    peakDecel = 0;

    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();
  }

  // ===== ระหว่าง Brake =====
  if(braking){

    brakeDistance += Math.abs(velocity) * dt;

    const decel = Math.abs(filteredAccel);

    if(decel > peakDecel){
      peakDecel = decel;
    }

    chart.data.labels.push("");
    chart.data.datasets[0].data.push(decel);
    chart.update();

    // ===== จบ Brake =====
    if(Math.abs(velocity) < 0.5){

      braking = false;

      totalBrakeEvents++;
      totalPeakSum += peakDecel;
      totalDistanceSum += brakeDistance;

      if(peakDecel > maxPeakRecorded){
        maxPeakRecorded = peakDecel;
      }

      const duration = (Date.now() - brakeStartTime) / 1000;

      // ===== Update Card =====
      peakEl.innerText = peakDecel.toFixed(2);
      distanceEl.innerText = brakeDistance.toFixed(2);
      durationEl.innerText = duration.toFixed(2);

      // ===== Update Summary =====
      totalBrakeEl.innerText = totalBrakeEvents;
      avgDecelEl.innerText = (totalPeakSum / totalBrakeEvents).toFixed(2);
      meanDistanceEl.innerText = (totalDistanceSum / totalBrakeEvents).toFixed(2);
      maxPeakEl.innerText = maxPeakRecorded.toFixed(2);
    }
  }
}

// ======================================
// STOP
// ======================================

function stopRide(){
  window.removeEventListener("devicemotion", handleMotion);
}
