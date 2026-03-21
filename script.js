// ================= GLOBAL =================
let watchId;
let rideData = [];
let accBuffer = [];
let lastAlertTime = 0;

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

// ================= EVENT CLASSIFICATION =================
function classifyEvent(acc, speed){

  if(acc < -2 && speed > 20){
    return "HARD BRAKE";
  }

  if(acc > 2){
    return "BUMP";
  }

  return "NORMAL";
}

// ================= VOICE ALERT =================
function speak(text){
  let now = Date.now();

  // กันพูดรัว
  if(now - lastAlertTime < 3000) return;

  lastAlertTime = now;

  let msg = new SpeechSynthesisUtterance(text);
  speechSynthesis.speak(msg);
}

// ================= DANGER ZONE =================
function addDangerZone(lat, lng, risk){
  if(risk > 70){

    L.circle([lat, lng], {
      radius: 20,
      color: "red",
      fillOpacity: 0.3
    }).addTo(map);

  }
}

// ================= START =================
function startRide(){

  watchId = navigator.geolocation.watchPosition(pos => {

    let lat = pos.coords.latitude;
    let lng = pos.coords.longitude;

    let speed = pos.coords.speed ? pos.coords.speed * 3.6 : 0;
    if(speed < 1) speed = 0;

    document.getElementById("speed").innerText = speed.toFixed(1);

    // map
    map.setView([lat, lng]);
    L.marker([lat, lng]).addTo(map);

    // 🔥 mock acceleration (ไว้ก่อน เดี๋ยวเปลี่ยนเป็น sensor จริง)
    let acc = Math.random()*4 - 2;

    let smoothAcc = smoothAcceleration(acc);

    let riskLevel = Math.min(100, Math.abs(smoothAcc) * 40);

    document.getElementById("risk").innerText = Math.round(riskLevel);

    updateStyle(riskLevel);

    // 🎯 classify
    let eventType = classifyEvent(smoothAcc, speed);
    document.getElementById("event").innerText = eventType;

    // 🔊 alert
    if(riskLevel > 80){
      speak("Warning dangerous riding");
    }

    // 🔥 danger zone
    addDangerZone(lat, lng, riskLevel);

    // 💾 save data
    rideData.push({
      time: new Date().toISOString(),
      lat,
      lng,
      speed,
      acc: smoothAcc,
      risk: riskLevel,
      event: eventType
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
