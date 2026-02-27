let riding = false;
let lastTime = 0;
let speed = 0;
let brakeDistance = 0;

const speedEl = document.getElementById("speed");
const leanEl = document.getElementById("lean");

const ctx = document.getElementById('speedChart').getContext('2d');

const speedChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Acceleration (m/s²)',
            data: [],
            borderColor: '#4f8cff',
            backgroundColor: 'rgba(79,140,255,0.2)',
            tension: 0.4
        }]
    },
    options: {
        responsive: true,
        scales: {
            y: { beginAtZero: false }
        }
    }
});

async function startRide(){

    if(riding) return;

    // ขออนุญาต iPhone
    if (typeof DeviceMotionEvent.requestPermission === "function") {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== "granted") {
            alert("Permission denied");
            return;
        }
    }

    riding = true;
    lastTime = Date.now();
    brakeDistance = 0;

    window.addEventListener("devicemotion", handleMotion);
}

function stopRide(){
    riding = false;
    window.removeEventListener("devicemotion", handleMotion);

    alert("Brake Distance: " + brakeDistance.toFixed(2) + " m");
}

function resetData(){
    speed = 0;
    brakeDistance = 0;
    speedEl.innerText = "0 km/h";
    leanEl.innerText = "0°";

    speedChart.data.labels = [];
    speedChart.data.datasets[0].data = [];
    speedChart.update();
}

function handleMotion(event){

    if(!riding) return;

    let now = Date.now();
    let dt = (now - lastTime) / 1000;

    // ใช้ accelerationIncludingGravity
    let ax = event.accelerationIncludingGravity.x;
    let ay = event.accelerationIncludingGravity.y;
    let az = event.accelerationIncludingGravity.z;

    if(ax === null) return;

    // คำนวณ g-force รวม
    let totalAcc = Math.sqrt(ax*ax + ay*ay + az*az);

    // แปลงเป็น m/s²
    let acceleration = totalAcc - 9.81;

    // คำนวณ lean angle จากแกน X
    let lean = Math.atan2(ax, az) * (180/Math.PI);

    // คำนวณ speed แบบ integration
    speed += acceleration * dt;

    if(speed < 0) speed = 0;

    // สะสมระยะเบรกถ้า deceleration
    if(acceleration < -1){
        brakeDistance += speed * dt;
    }

    // Crash detection
    if(acceleration < -15){
        alert("💥 Crash Detected!");
        stopRide();
    }

    speedEl.innerText = (speed*3.6).toFixed(1) + " km/h";
    leanEl.innerText = lean.toFixed(1) + "°";

    // update graph
    speedChart.data.labels.push("");
    speedChart.data.datasets[0].data.push(acceleration.toFixed(2));

    if(speedChart.data.labels.length > 30){
        speedChart.data.labels.shift();
        speedChart.data.datasets[0].data.shift();
    }

    speedChart.update();

    lastTime = now;
}
