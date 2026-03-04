// ======================================
// MotoSafe Pro - Clean Academic Version
// ======================================

// ---------------- STATE ----------------
let velocity = 0;
let lastTime = 0;

let filteredAccel = 0;
const alpha = 0.25;

let braking = false;
let brakeStartTime = 0;
let brakeDistance = 0;
let peakDecel = 0;
let brakeSamples = 0;

// ---------------- SUMMARY ----------------
let totalEvents = 0;
let hardEvents = 0;
let totalDistance = 0;
let totalPeak = 0;
let maxPeak = 0;

// ---------------- THRESHOLDS ----------------
const START_THRESHOLD = -1.2;   // เริ่มถือว่าเบรก
const HARD_THRESHOLD = -3.5;    // เบรกแรง
const END_THRESHOLD = -0.3;     // จบ event
const MIN_DURATION = 0.25;      // อย่างน้อย 0.25 วิ
const DEADZONE = 0.15;          // กันสั่น
const MIN_SPEED = 3;            // km/h
const MAX_ACCEL_LIMIT = 15;     // กันค่าหลุด

// ---------------- DOM ----------------
const speedEl = document.getElementById("speed");
const peakEl = document.getElementById("peak");
const distanceEl = document.getElementById("distance");
const durationEl = document.getElementById("duration");
const summaryEl = document.getElementById("summary");

// ---------------- START ----------------
async function startRide() {

  if (typeof DeviceMotionEvent.requestPermission === "function") {
    const permission = await DeviceMotionEvent.requestPermission();
    if (permission !== "granted") return;
  }

  velocity = 0;
  braking = false;
  lastTime = Date.now();

  window.addEventListener("devicemotion", handleMotion);
}

// ---------------- STOP ----------------
function stopRide() {
  window.removeEventListener("devicemotion", handleMotion);

  if (braking) {
    finalizeBrake(Date.now());
  }
}

// ---------------- MOTION ----------------
function handleMotion(event) {

  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt <= 0) return;

  // ใช้ acceleration (ไม่รวม gravity)
  let accel = event.acceleration?.y;
  if (accel == null) return;

  // ตัดสัญญาณสั่นเล็ก ๆ
  if (Math.abs(accel) < DEADZONE) accel = 0;

  if (Math.abs(accel) > MAX_ACCEL_LIMIT) return;

  // Low-pass filter
  filteredAccel = alpha * accel + (1 - alpha) * filteredAccel;

  // integrate เฉพาะตอนมีแรงจริง
  if (filteredAccel !== 0) {
    velocity += filteredAccel * dt;
  }

  // กัน drift ตอนใกล้ 0
  if (Math.abs(velocity) < 0.05) velocity = 0;

  const speedKmh = Math.abs(velocity * 3.6);
  speedEl.innerText = speedKmh.toFixed(1);

  // ---------------- START BRAKE ----------------
  if (!braking &&
      filteredAccel < START_THRESHOLD &&
      speedKmh > MIN_SPEED) {

    braking = true;
    brakeStartTime = now;
    brakeDistance = 0;
    peakDecel = 0;
    brakeSamples = 0;
  }

  // ---------------- DURING BRAKE ----------------
  if (braking) {

    brakeSamples++;

    brakeDistance += Math.abs(velocity) * dt;

    const decel = Math.abs(filteredAccel);
    if (decel > peakDecel) peakDecel = decel;

    // จบ event
    if (filteredAccel > END_THRESHOLD) {
      finalizeBrake(now);
    }
  }
}

// ---------------- FINALIZE ----------------
function finalizeBrake(now) {

  braking = false;

  const duration = (now - brakeStartTime) / 1000;
  if (duration < MIN_DURATION) return;

  totalEvents++;
  totalDistance += brakeDistance;
  totalPeak += peakDecel;

  if (peakDecel > maxPeak) maxPeak = peakDecel;

  if (peakDecel >= Math.abs(HARD_THRESHOLD)) {
    hardEvents++;
    alert("⚠️ HARD BRAKE DETECTED");
  }

  // อัปเดตการ์ด
  peakEl.innerText = peakDecel.toFixed(2);
  distanceEl.innerText = brakeDistance.toFixed(2);
  durationEl.innerText = duration.toFixed(2);

  updateSummary();
}

// ---------------- SUMMARY ----------------
function updateSummary() {

  if (!summaryEl) return;

  const avgPeak = totalEvents ? (totalPeak / totalEvents) : 0;
  const meanDistance = totalEvents ? (totalDistance / totalEvents) : 0;

  summaryEl.innerHTML = `
    <h3>Summary Dashboard</h3>
    <p>Total Brake Events: ${totalEvents}</p>
    <p>Hard Brakes: ${hardEvents}</p>
    <p>Average Peak Decel: ${avgPeak.toFixed(2)} m/s²</p>
    <p>Mean Brake Distance: ${meanDistance.toFixed(2)} m</p>
    <p>Max Peak Recorded: ${maxPeak.toFixed(2)} m/s²</p>
  `;
}
