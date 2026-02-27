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

// ปรับให้ไวขึ้นสำหรับทดสอบมือถือ
const BRAKE_THRESHOLD = -1.2;
const CALM_THRESHOLD = 0.5;
const CALM_DURATION = 0.4;

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
    id: Date.now()
  };

  lastTime = Date.now();
  window.addEventListener("devicemotion", handleMotion);
}

function handleMotion(event){

  let now = Date.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if(dt <= 0) return;

  let accel = event.accelerationIncludingGravity.y;
  if(accel === null) return;

  filteredAccel = alpha * accel + (1 - alpha) * filteredAccel;
  velocity += filteredAccel * dt;

  if(Math.abs(filteredAccel) < 0.3){
    velocity *= 0.9;
  }

  speedEl.innerText = Math.abs(velocity * 3.6).toFixed(1);

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

    // 🔥 จบเบรก → สรุปทันที
    if(calmTime > CALM_DURATION){

      braking = false;

      let duration = (now - brakeStartTime) / 1000;

      let avgDecel =
        decelSamples.reduce((a,b)=>a+b,0) / decelSamples.length;

      peakEl.innerText = peakDecel.toFixed(2);
      distanceEl.innerText = brakeDistance.toFixed(2);
      durationEl.innerText = duration.toFixed(2);

      const brakeEvent = {
        session_id: currentSession.id,
        start: brakeStartTime,
        end: now,
        peak: peakDecel,
        avg: avgDecel,
        distance: brakeDistance,
        duration: duration
      };

      // บันทึกทันที
      allSessions.push(brakeEvent);

      localStorage.setItem(
        "motoSessions",
        JSON.stringify(allSessions)
      );

      updateSummary();
    }
  }
}

function stopRide(){
  window.removeEventListener("devicemotion", handleMotion);
}

function updateSummary(){

  let totalEvents = allSessions.length;
  let avgOfAvg = 0;

  allSessions.forEach(e=>{
    avgOfAvg += e.avg;
  });

  if(totalEvents > 0){
    avgOfAvg /= totalEvents;
  }

  summaryEl.innerHTML = `
    <h3>Summary Dashboard</h3>
    <p>Total Brake Events: ${totalEvents}</p>
    <p>Average Deceleration (m/s²): ${avgOfAvg.toFixed(2)}</p>
  `;
}

function exportCSV(){

  let csv = "session_id,start,end,peak,avg,distance,duration\n";

  allSessions.forEach(e=>{
    csv += `${e.session_id},${e.start},${e.end},${e.peak},${e.avg},${e.distance},${e.duration}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "motosafe_brake_events.csv";
  a.click();
}

updateSummary();
