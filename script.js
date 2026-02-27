let watchId = null;

let lastSpeed = 0;
let lastTime = 0;

let braking = false;
let brakeStartTime = 0;
let brakeDistance = 0;
let peakDecel = 0;
let decelData = [];

const speedEl = document.getElementById("speed");
const peakEl = document.getElementById("peak");
const distanceEl = document.getElementById("distance");
const durationEl = document.getElementById("duration");

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
        scales: {
            y: { beginAtZero: true }
        }
    }
});

function startRide(){

    lastTime = Date.now();

    watchId = navigator.geolocation.watchPosition(
        handleGPS,
        err => alert(err.message),
        { enableHighAccuracy: true }
    );
}

function handleGPS(position){

    let now = Date.now();
    let dt = (now - lastTime) / 1000;
    if(dt <= 0) return;

    let speedMS = position.coords.speed;
    if(speedMS === null) speedMS = 0;

    speedEl.innerText = (speedMS * 3.6).toFixed(1);

    let acceleration = (speedMS - lastSpeed) / dt;

    // เริ่มจับเบรก
    if(acceleration < -1 && !braking){
        braking = true;
        brakeStartTime = now;
        brakeDistance = 0;
        peakDecel = 0;
        decelData = [];

        chart.data.labels = [];
        chart.data.datasets[0].data = [];
        chart.update();
    }

    if(braking){

        brakeDistance += speedMS * dt;

        let decel = Math.abs(acceleration);

        if(decel > peakDecel){
            peakDecel = decel;
        }

        decelData.push(decel);

        chart.data.labels.push("");
        chart.data.datasets[0].data.push(decel);
        chart.update();

        if(speedMS < 0.5){

            braking = false;

            let duration = (now - brakeStartTime) / 1000;

            peakEl.innerText = peakDecel.toFixed(2);
            distanceEl.innerText = brakeDistance.toFixed(2);
            durationEl.innerText = duration.toFixed(2);
        }
    }

    lastSpeed = speedMS;
    lastTime = now;
}

function stopRide(){
    navigator.geolocation.clearWatch(watchId);
}
