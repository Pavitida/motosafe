let braking = false;
let brakeStartTime = 0;
let brakeDistance = 0;
let peakDecel = 0;
let decelSamples = [];

let velocity = 0;
let lastTime = 0;
let calmTime = 0;

let filteredAccel = 0;
const alpha = 0.2;

const BRAKE_THRESHOLD = -3;
const CALM_THRESHOLD = 0.8;
const CALM_DURATION = 0.7;

let currentSession = null;
let allSessions = JSON.parse(localStorage.getItem("motoSessions")) || [];

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

  currentSession = {
    id: Date.now(),
    brakeEvents: []
  };

  lastTime = Date.now();
  window.addEventListener("devicemotion", handleMotion);
}

function handleMotion(event){

  let now = Date.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if(dt <= 0) return;

  let accel = event.acceleration.y;
  if(accel === null) return;

  filteredAccel = alpha * accel + (1 - alpha) * filteredAccel;
  velocity += filteredAccel * dt;

  if(Math.abs(filteredAccel) < 0.3){
    velocity *= 0.9;
  }

  speedEl.innerText = Math.abs(velocity * 3.6).toFixed(1);

  // ===== เริ่มเบรก =====
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

      currentSession.brakeEvents.push({
        start: brakeStartTime,
        end: now,
        peak: peakDecel,
        avg: avgDecel,
        distance: brakeDistance,
        duration: duration
      });
      updateSummary();
    }
  }
}

function stopRide(){

  window.removeEventListener("devicemotion", handleMotion);

  if(currentSession){

    // ถ้ามี brake event ค่อยบันทึก
    if(currentSession.brakeEvents.length > 0){

      allSessions.push(currentSession);

      localStorage.setItem(
        "motoSessions",
        JSON.stringify(allSessions)
      );
    }

    currentSession = null;
  }

  updateSummary();
}

function updateSummary(){

  let totalSessions = allSessions.length;
  let totalEvents = 0;
  let avgOfAvg = 0;

  allSessions.forEach(s=>{
    totalEvents += s.brakeEvents.length;
    s.brakeEvents.forEach(e=>{
      avgOfAvg += e.avg;
    });
  });

  if(totalEvents > 0){
    avgOfAvg /= totalEvents;
  }

  summaryEl.innerHTML = `
    <h3>Summary Dashboard</h3>
    <p>Total Sessions: ${totalSessions}</p>
    <p>Total Brake Events: ${totalEvents}</p>
    <p>Average Deceleration (m/s²): ${avgOfAvg.toFixed(2)}</p>
  `;
}

function exportCSV(){

  let csv = "session_id,start,end,peak,avg,distance,duration\n";

  allSessions.forEach(s=>{
    s.brakeEvents.forEach(e=>{
      csv += `${s.id},${e.start},${e.end},${e.peak},${e.avg},${e.distance},${e.duration}\n`;
    });
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "motosafe_all_sessions.csv";
  a.click();
}

updateSummary();
