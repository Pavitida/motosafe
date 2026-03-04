// ======================================
// MotoSafe PRO – 3 Level Brake Detection
// ======================================

// ---------- STATE ----------
let velocity = 0;
let lastTime = 0;

let filteredAccel = 0;
const alpha = 0.2; // smoothing factor

let braking = false;
let brakeCounter = 0;
let brakeStartTime = 0;
let brakeDistance = 0;
let peakDecel = 0;
let brakeSamples = 0;

let prevFiltered = 0;

// ---------- SUMMARY ----------
let totalEvents = 0;
let normalBrakes = 0;
let hardBrakes = 0;
let totalPeak = 0;
let totalDistance = 0;
let maxPeak = 0;

// ---------- THRESHOLDS ----------
const START_THRESHOLD = -1.5;   // เริ่มถือว่า brake
const HARD_THRESHOLD = -4.0;    // brake แรง
const END_THRESHOLD = -0.5;     // จบ event
const MIN_SAMPLES = 10;         // อย่างน้อย ~0.2s
const MIN_SPEED = 10;           // km/h
const MAX_ACCEL_LIMIT = 12;     // กันค่าหลุด

// ---------- DOM ----------
const speedEl = document.getElementById("speed");
const peakEl = document.getElementById("peak");
const distanceEl = document.getElementById("distance");
const durationEl = document.getElementById("duration");

const totalEventEl = document.getElementById("totalBrakes");
const normalEl = document.getElementById("normalBrakes");
const hardEl = document.getElementById("totalHardBrakes");
const avgDecelEl = document.getElementById("avgDecel");
const meanDistanceEl = document.getElementById("meanDistance");
const maxPeakEl = document.getElementById("maxPeak");

// ---------- START ----------
async function startRide(){

  if (typeof DeviceMotionEvent.requestPermission === "function") {
    const permission = await DeviceMotionEvent.requestPermission();
    if (permission !== "granted") return;
  }

  velocity = 0;
  lastTime = Date.now();
  braking = false;

  window.addEventListener("devicemotion", handleMotion);
}

// ---------- STOP ----------
function stopRide(){
  window.removeEventListener("devicemotion", handleMotion);
}

// ---------- MOTION ----------
function handleMotion(event){

  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  if(dt <= 0) return;

  let accel = event.acceleration?.y;
  if(accel == null) return;

  // Deadzone กันสั่นเล็ก ๆ
  if(Math.abs(accel) < 0.15) accel = 0;

  // กันค่าหลุด
  if(Math.abs(accel) > MAX_ACCEL_LIMIT) return;

  // Low Pass Filter
  filteredAccel = alpha * accel + (1 - alpha) * filteredAccel;

  // integrate velocity
  velocity += filteredAccel * dt;
  if(Math.abs(velocity) < 0.05) velocity = 0;

  const speedKmh = Math.abs(velocity * 3.6);
  speedEl.innerText = speedKmh.toFixed(1);

  // -------------------------
  // Detect brake start
  // -------------------------
  if(filteredAccel < START_THRESHOLD && speedKmh > MIN_SPEED){
    brakeCounter++;
  }else{
    brakeCounter = 0;
  }

  if(brakeCounter > MIN_SAMPLES && !braking){
    braking = true;
    brakeStartTime = now;
    brakeDistance = 0;
    peakDecel = 0;
    brakeSamples = 0;
  }

  // -------------------------
  // During braking
  // -------------------------
  if(braking){

    brakeSamples++;
    brakeDistance += Math.abs(velocity) * dt;

    const decel = Math.abs(filteredAccel);

    if(decel > peakDecel){
      peakDecel = decel;
    }

    // End condition
    if(filteredAccel > END_THRESHOLD){

      finalizeBrake(now);
    }
  }

  prevFiltered = filteredAccel;
}

// ---------- FINALIZE ----------
function finalizeBrake(now){

  braking = false;

  if(brakeSamples < MIN_SAMPLES) return;

  const duration = (now - brakeStartTime) / 1000;

  totalEvents++;
  totalPeak += peakDecel;
  totalDistance += brakeDistance;

  if(peakDecel > maxPeak){
    maxPeak = peakDecel;
  }

  // ----- Classify -----
  if(peakDecel >= HARD_THRESHOLD){
    hardBrakes++;
    alert("⚠️ HARD BRAKE DETECTED!");
  }else{
    normalBrakes++;
  }

  // ----- Update cards -----
  peakEl.innerText = peakDecel.toFixed(2);
  distanceEl.innerText = brakeDistance.toFixed(2);
  durationEl.innerText = duration.toFixed(2);

  totalEventEl.innerText = totalEvents;
  normalEl.innerText = normalBrakes;
  hardEl.innerText = hardBrakes;
  avgDecelEl.innerText = (totalPeak / totalEvents).toFixed(2);
  meanDistanceEl.innerText = (totalDistance / totalEvents).toFixed(2);
  maxPeakEl.innerText = maxPeak.toFixed(2);
}
