let braking = false;
let brakeStartTime = 0;
let brakeDistance = 0;
let peakDecel = 0;
let velocity = 0;
let lastTime = 0;

const HARD_THRESHOLD = 6;

let hardBrakeLogs = JSON.parse(localStorage.getItem("hardBrakes")) || [];

const speedEl = document.getElementById("speed");
const peakEl = document.getElementById("peak");
const distanceEl = document.getElementById("distance");
const durationEl = document.getElementById("duration");

const ctx = document.getElementById("speedChart").getContext("2d");

const chart = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Deceleration (m/s²)",
        data: [],
        borderColor: "#4f8cff",
        tension: 0.3
      },
      {
        label: "Hard Brake",
        data: [],
        borderColor: "red",
        tension: 0.3
      }
    ]
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

  velocity += accel * dt;
  let speedKMH = Math.abs(velocity * 3.6);
  speedEl.innerText = speedKMH.toFixed(1);

  if(accel < -2 && !braking){
    braking = true;
    brakeStartTime = now;
    brakeDistance = 0;
    peakDecel = 0;

    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.update();
  }

  if(braking){

    brakeDistance += Math.abs(velocity) * dt;

    let decel = Math.abs(accel);

    if(decel > peakDecel){
      peakDecel = decel;
    }

    chart.data.labels.push("");

    if(decel > HARD_THRESHOLD){
      chart.data.datasets[0].data.push(null);
      chart.data.datasets[1].data.push(decel);
    } else {
      chart.data.datasets[0].data.push(decel);
      chart.data.datasets[1].data.push(null);
    }

    chart.update();

    if(Math.abs(velocity) < 0.3){

      braking = false;
      let duration = (now - brakeStartTime) / 1000;

      peakEl.innerText = peakDecel.toFixed(2);
      distanceEl.innerText = brakeDistance.toFixed(2);
      durationEl.innerText = duration.toFixed(2);

      // เพิ่มเฉพาะตรงนี้
      if(peakDecel > HARD_THRESHOLD){

        alert("⚠️ HARD BRAKE DETECTED");

        navigator.geolocation.getCurrentPosition(pos => {

          const log = {
            peak: peakDecel,
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            time: new Date().toISOString()
          };

          hardBrakeLogs.push(log);
          localStorage.setItem("hardBrakes", JSON.stringify(hardBrakeLogs));

        });
      }
    }
  }
}

function stopRide(){
  window.removeEventListener("devicemotion", handleMotion);
}
