// =======================================
// MotoSafe - Motorcycle Standard Version
// =======================================

let braking = false;
let brakeStartTime = 0;
let brakeDistance = 0;
let peakDecel = 0;
let velocity = 0;
let lastTime = 0;

let totalBrakeEvents = 0;
let hardBrakeCount = 0;
let maxPeakRecorded = 0;

const BRAKE_START_THRESHOLD = 1.2;   
const HARD_BRAKE_THRESHOLD = 4.5;    
const EXTREME_BRAKE_THRESHOLD = 7.0; 

// ===== DOM =====
const speedEl = document.getElementById("speed");
const peakEl = document.getElementById("peak");
const distanceEl = document.getElementById("distance");
const durationEl = document.getElementById("duration");
const hardBrakeEl = document.getElementById("hardBrakes");
const totalBrakeEl = document.getElementById("totalBrakes");
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

// ===== Filter =====
let filteredAccel = 0;
const alpha = 0.2;

async function startRide(){

  if (typeof DeviceMotionEvent.requestPermission === "function") {
    const permission = await DeviceMotionEvent.requestPermission();
    if (permission !== "granted") {
      alert("Motion permission denied");
      return;
    }
  }

  lastTime = Date.now();
  velocity = 0;
  window.addEventListener("devicemotion", handleMotion);
}

function handleMotion(event){

  let now = Date.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if(dt <= 0) return;

  let rawAccel = event.accelerationIncludingGravity?.y;
  if(rawAccel == null) return;

  filteredAccel = alpha * rawAccel + (1 - alpha) * filteredAccel;

  velocity += filteredAccel * dt;
  if(Math.abs(velocity) > 50) velocity = 0;

  let speedKMH = Math.abs(velocity * 3.6);
  speedEl.innerText = speedKMH.toFixed(1);

  // ===== Start Brake Event =====
  if(filteredAccel < -BRAKE_START_THRESHOLD && !braking){

    braking = true;
    brakeStartTime = now;
    brakeDistance = 0;
    peakDecel = 0;
    totalBrakeEvents++;

    if(totalBrakeEl) totalBrakeEl.innerText = totalBrakeEvents;

    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();
  }

  if(braking){

    brakeDistance += Math.abs(velocity) * dt;

    let decel = Math.abs(filteredAccel);
    if(decel > peakDecel) peakDecel = decel;

    if(peakDecel > maxPeakRecorded){
      maxPeakRecorded = peakDecel;
      if(maxPeakEl) maxPeakEl.innerText = maxPeakRecorded.toFixed(2);
    }

    chart.data.labels.push("");
    chart.data.datasets[0].data.push(decel);

    chart.data.datasets[0].borderColor =
      peakDecel >= HARD_BRAKE_THRESHOLD ? "red" : "#4f8cff";

    chart.update();

    // ===== Extreme Emergency Brake =====
    if(decel >= EXTREME_BRAKE_THRESHOLD){
      hardBrakeCount++;
      if(hardBrakeEl) hardBrakeEl.innerText = hardBrakeCount;
      alert("🚨 EMERGENCY BRAKE (ABS LEVEL)!");
    }

    if(Math.abs(velocity) < 0.5){

      braking = false;
      let duration = (now - brakeStartTime) / 1000;

      peakEl.innerText = peakDecel.toFixed(2);
      distanceEl.innerText = brakeDistance.toFixed(2);
      durationEl.innerText = duration.toFixed(2);
    }
  }
}

function stopRide(){
  window.removeEventListener("devicemotion", handleMotion);
}
