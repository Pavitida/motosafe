// ================= GLOBAL =================
let watchId;
let rideData = [];
let accBuffer = [];

// ================= MAP =================
let map = L.map('map').setView([13.736717, 100.523186], 15);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'MotoSafe'
}).addTo(map);

// ================= CHART =================
let chartCtx = document.getElementById('chart').getContext('2d');
let chart = new Chart(chartCtx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Speed',
      data: [],
      tension: 0.3
    }]
  }
});

// ================= SMOOTH =================
function smoothAcceleration(val){
  accBuffer.push(val);
  if(accBuffer.length > 5) accBuffer.shift();

  return accBuffer.reduce((a,b)=>a+b,0)/accBuffer.length;
}

// ================= STYLE =================
function updateStyle(risk){
  const el = document.getElementById("style");

  if(risk < 30){
    el.innerText = "SAFE";
    el.className = "status-angel-safe";
  } else if(risk < 70){
    el.innerText = "WARNING";
    el.className = "status-glam-warning";
  } else {
    el.innerText = "DANGEROUS";
    el.className = "status-chic-danger";
  }
}

// ================= START =================
function startRide(){

  watchId = navigator.geolocation.watchPosition(pos => {

    let lat = pos.coords.latitude;
    let lng = pos.coords.longitude;

    // speed (km/h)
    let speed = pos.coords.speed ? pos.coords.speed * 3.6 : 0;
    if(speed < 1) speed = 0;

    document.getElementById("speed").innerText = speed.toFixed(1);

    // map
    map.setView([lat, lng]);
    L.marker([lat, lng]).addTo(map);

    // 🔥 mock acceleration (แทน sensor จริง)
    let acc = Math.random()*2 - 1;

    // smoothing
    let smoothAcc = smoothAcceleration(acc);

    // risk calculation
    let riskLevel = Math.min(100, Math.abs(smoothAcc) * 50);

    document.getElementById("risk").innerText = Math.round(riskLevel);

    // 🔥 update style
    updateStyle(riskLevel);

    // save data
    rideData.push({
      time: new Date().toISOString(),
      lat: lat,
      lng: lng,
      speed: speed,
      acc: smoothAcc,
      risk: riskLevel
    });

    // chart
    chart.data.labels.push(new Date().toLocaleTimeString());
    chart.data.datasets[0].data.push(speed);
    chart.update();

  }, err => {
    console.error(err);
  }, {
    enableHighAccuracy: true
  });
}

// ================= STOP =================
function stopRide(){
  navigator.geolocation.clearWatch(watchId);
}

// ================= EXPORT =================
function exportData(){
  const blob = new Blob([JSON.stringify(rideData, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "motosafe-data.json";
  a.click();
}
