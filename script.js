// ======================================
// MotoSafe Pro - Real Motorcycle Version
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

let zeroOffset = 0;

const BRAKE_THRESHOLD = 2.0;      // เริ่มจับเบรก
const MAX_REAL_DECEL = 10;        // เกินนี้ตัดทิ้ง (ฟิสิกส์จริง)

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

  velocity = 0;
  braking = false;
  peakDecel = 0;
  zeroOffset = 0;

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

  // ✅ ใช้ acceleration แท้ (ไม่มี gravity)
  let accel = event.acceleration?.y;
  if(accel == null) return;

  // 🔥 Calibrate ค่าศูนย์ตอนแรก
  if(zeroOffset === 0){
    zeroOffset = accel;
  }

  accel = accel - zeroOffset;

  // 🔥 Deadzone กันสั่นตอนนิ่ง
  if(Math.abs(accel) < 0.2){
    accel = 0;
  }

  // 🔥 ตัดค่าหลุดเกินจริง
  if(Math.abs(accel) > MAX_REAL_DECEL){
    return;
  }

  velocity += accel * dt;

  // กัน drift ตอนหยุด
  if(Math.abs(accel) === 0){
    velocity *= 0.98;
  }

  if(Math.abs(velocity) < 0.05){
    velocity = 0;
  }

  const speedKMH = Math.abs(velocity * 3.6);
  speedEl.innerText = speedKMH.toFixed(1);

  // ===== เริ่ม Brake =====
  if(accel < -BRAKE_THRESHOLD && !braking){
    braking = true;
    brakeStartTime = now;
    brakeDistance = 0;
    peakDecel = 0;

    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();
  }

  if(braking){

    brakeDistance += Math.abs(velocity) * dt;

    const decel = Math.abs(accel);

    if(decel > peakDecel){
      peakDecel = decel;
    }

    chart.data.labels.push("");
    chart.data.datasets[0].data.push(decel);
    chart.update();

    if(Math.abs(velocity) === 0){

      braking = false;

      totalBrakeEvents++;
      totalPeakSum += peakDecel;
      totalDistanceSum += brakeDistance;

      if(peakDecel > maxPeakRecorded){
        maxPeakRecorded = peakDecel;
      }

      const duration = (Date.now() - brakeStartTime) / 1000;

      peakEl.innerText = peakDecel.toFixed(2);
      distanceEl.innerText = brakeDistance.toFixed(2);
      durationEl.innerText = duration.toFixed(2);

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
