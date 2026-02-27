let braking = false;
let brakeStartTime = 0;
let brakeDistance = 0;
let peakDecel = 0;
let decelSamples = [];
let maxSpeedBeforeBrake = 0;

let velocity = 0;
let lastTime = 0;
let calmTime = 0;

let filteredAccel = 0;
const alpha = 0.2;

const BRAKE_THRESHOLD = -1.2;
const CALM_THRESHOLD = 0.5;
const CALM_DURATION = 0.4;

let allEvents = JSON.parse(localStorage.getItem("motoData")) || [];

const speedEl = document.getElementById("speed");
const peakEl = document.getElementById("peak");
const distanceEl = document.getElementById("distance");
const durationEl = document.getElementById("duration");
const summaryEl = document.getElementById("summary");

const ctx = document.getElementById("speedChart").getContext("2d");

const chart = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "Deceleration (m/s²)",
      data: [],
      borderColor: "#4f8cff",
      tension: 0.3
    }]
  },
  options: {
    responsive: true,
    scales: { y: { beginAtZero: true } }
  }
});

async function startRide(){

  if (typeof DeviceMotionEvent.requestPermission === "function") {
    const permission = await DeviceMotionEvent.requestPermission();
    if (permission !== "granted") {
      alert("Motion permission denied");
      return;
    }
  }

  velocity = 0;
  maxSpeedBeforeBrake = 0;
  lastTime = Date.now();

  window.addEventListener("devicemotion", handleMotion);
}

function handleMotion(event){

  let now = Date.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if(dt <= 0) return;

  let accel = event.acceleration.y; // ใช้ตัวนี้แม่นกว่า
  if(accel === null) return;

  filteredAccel = alpha * accel + (1 - alpha) * filteredAccel;
  velocity += filteredAccel * dt;

  let speedKmH = Math.abs(velocity * 3.6);
  speedEl.innerText = speedKmH.toFixed(1);

  if(speedKmH > maxSpeedBeforeBrake && !braking){
    maxSpeedBeforeBrake = speedKmH;
  }

  // เริ่มเบรก
  if(filteredAccel < BRAKE_THRESHOLD && !braking){
    braking = true;
    brakeStartTime = now;
    brakeDistance = 0;
    peakDecel = 0;
    decelSamples = [];
    calmTime = 0;

    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();
  }

  if(braking){

    brakeDistance += Math.abs(velocity) * dt;

    let decel = Math.abs(filteredAccel);

    if(decel > 15) decel = 15; // clamp realism

    decelSamples.push(decel);

    if(decel > peakDecel){
      peakDecel = decel;
    }

    chart.data.labels.push("");
    chart.data.datasets[0].data.push(decel);
    chart.update();

    if(Math.abs(filteredAccel) < CALM_THRESHOLD){
      calmTime += dt;
    } else {
      calmTime = 0;
    }

    if(calmTime > CALM_DURATION){

      braking = false;

      let duration = (now - brakeStartTime) / 1000;
      let avgDecel =
        decelSamples.reduce((a,b)=>a+b,0) / decelSamples.length;

      peakEl.innerText = peakDecel.toFixed(2);
      distanceEl.innerText = brakeDistance.toFixed(2);
      durationEl.innerText = duration.toFixed(2);

      let severity = "Mild";
      if(avgDecel >= 3 && avgDecel < 6) severity = "Moderate";
      if(avgDecel >= 6) severity = "Hard";

      const eventData = {
        timestamp: now,
        peak: peakDecel,
        avg: avgDecel,
        distance: brakeDistance,
        duration: duration,
        maxSpeed: maxSpeedBeforeBrake,
        severity: severity
      };

      allEvents.push(eventData);
      localStorage.setItem("motoData", JSON.stringify(allEvents));

      updateSummary();
    }
  }
}

function stopRide(){
  window.removeEventListener("devicemotion", handleMotion);
}

function updateSummary(){

  let total = allEvents.length;
  let totalAvg = 0;
  let totalDistance = 0;
  let maxPeak = 0;
  let hardCount = 0;

  allEvents.forEach(e=>{
    totalAvg += e.avg;
    totalDistance += e.distance;
    if(e.peak > maxPeak) maxPeak = e.peak;
    if(e.severity === "Hard") hardCount++;
  });

  let avgDecel = total ? totalAvg/total : 0;
  let meanDistance = total ? totalDistance/total : 0;

  summaryEl.innerHTML = `
    <h3>Summary Dashboard</h3>
    <p>Total Brake Events: ${total}</p>
    <p>Average Deceleration: ${avgDecel.toFixed(2)} m/s²</p>
    <p>Mean Brake Distance: ${meanDistance.toFixed(2)} m</p>
    <p>Max Peak Recorded: ${maxPeak.toFixed(2)} m/s²</p>
    <p>Total Hard Brakes: ${hardCount}</p>
  `;
}

function exportCSV(){

  let csv = "timestamp,peak,avg,distance,duration,maxSpeed,severity\n";

  allEvents.forEach(e=>{
    csv += `${e.timestamp},${e.peak},${e.avg},${e.distance},${e.duration},${e.maxSpeed},${e.severity}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "motosafe_research_data.csv";
  a.click();
}

function clearData(){
  localStorage.removeItem("motoData");
  allEvents = [];
  updateSummary();
}

updateSummary();
