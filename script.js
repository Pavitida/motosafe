let riding = false;
let watchId = null;

let lastSpeed = 0;
let brakeDistance = 0;

const speedEl = document.getElementById("speed");
const leanEl = document.getElementById("lean");

const ctx = document.getElementById('speedChart').getContext('2d');

const speedChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Speed (km/h)',
            data: [],
            borderColor: '#4f8cff',
            backgroundColor: 'rgba(79,140,255,0.2)',
            tension: 0.4
        }]
    },
    options: {
        responsive: true,
        scales: {
            y: { beginAtZero: true }
        }
    }
});

async function startRide(){

    if(riding) return;

    // ขอ permission sensor (iPhone)
    if (typeof DeviceMotionEvent.requestPermission === "function") {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== "granted") {
            alert("Sensor permission denied");
            return;
        }
    }

    riding = true;
    brakeDistance = 0;

    // GPS
    watchId = navigator.geolocation.watchPosition(
        handleGPS,
        (err) => alert("GPS error: " + err.message),
        { enableHighAccuracy: true }
    );

    // Accelerometer
    window.addEventListener("devicemotion", handleMotion);
}

function stopRide(){
    riding = false;

    if(watchId !== null){
        navigator.geolocation.clearWatch(watchId);
    }

    window.removeEventListener("devicemotion", handleMotion);

    alert("Brake Distance: " + brakeDistance.toFixed(2) + " m");
}

function resetData(){
    speedChart.data.labels = [];
    speedChart.data.datasets[0].data = [];
    speedChart.update();

    speedEl.innerText = "0 km/h";
    leanEl.innerText = "0°";

    lastSpeed = 0;
    brakeDistance = 0;
}

function handleGPS(position){

    if(!riding) return;

    let speedMS = position.coords.speed; // m/s

    if(speedMS === null){
        speedMS = 0;
    }

    let speedKMH = speedMS * 3.6;

    // คำนวณระยะเบรก
    if(speedMS < lastSpeed){
        brakeDistance += speedMS;
    }

    lastSpeed = speedMS;

    speedEl.innerText = speedKMH.toFixed(1) + " km/h";

    speedChart.data.labels.push("");
    speedChart.data.datasets[0].data.push(speedKMH);

    if(speedChart.data.labels.length > 30){
        speedChart.data.labels.shift();
        speedChart.data.datasets[0].data.shift();
    }

    speedChart.update();
}

function handleMotion(event){

    if(!riding) return;

    let ax = event.accelerationIncludingGravity.x;
    let az = event.accelerationIncludingGravity.z;

    if(ax === null) return;

    // Lean angle
    let lean = Math.atan2(ax, az) * (180/Math.PI);
    leanEl.innerText = lean.toFixed(1) + "°";

    // Crash detection (แรงกระแทกสูง)
    let totalAcc = Math.sqrt(
        event.accelerationIncludingGravity.x ** 2 +
        event.accelerationIncludingGravity.y ** 2 +
        event.accelerationIncludingGravity.z ** 2
    );

    if(totalAcc > 25){
        alert("💥 Crash Detected!");
        stopRide();
    }
}
