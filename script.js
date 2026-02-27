let watchId = null;

let lastSpeed = 0;
let lastTime = 0;

let state = "RIDING";
let brakeSamples = 0;

let brakeStartTime = 0;
let brakeStartSpeed = 0;
let brakeDistance = 0;
let peakDecel = 0;
let decelSum = 0;
let decelCount = 0;

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

    let speedKMH = speedMS * 3.6;
    speedEl.innerText = speedKMH.toFixed(1);

    let acceleration = (speedMS - lastSpeed) / dt;

    // ===== STATE MACHINE =====

    if(state === "RIDING"){

        if(speedKMH > 5 && acceleration < -1.2){
            brakeSamples++;

            if(brakeSamples >= 2){
                state = "BRAKING";

                brakeStartTime = now;
                brakeStartSpeed = speedMS;
                brakeDistance = 0;
                peakDecel = 0;
                decelSum = 0;
                decelCount = 0;

                chart.data.labels = [];
                chart.data.datasets[0].data = [];
                chart.update();
            }
        } else {
            brakeSamples = 0;
        }
    }

    else if(state === "BRAKING"){

        let decel = Math.abs(acceleration);

        brakeDistance += speedMS * dt;

        if(decel > peakDecel){
            peakDecel = decel;
        }

        decelSum += decel;
        decelCount++;

        chart.data.labels.push("");
        chart.data.datasets[0].data.push(decel);
        chart.update();

        // STOP condition
        if(speedKMH < 1){

            state = "STOPPED";

            let duration = (now - brakeStartTime) / 1000;
            let avgDecel = decelSum / decelCount;

            peakEl.innerText = peakDecel.toFixed(2);
            distanceEl.innerText = brakeDistance.toFixed(2);
            durationEl.innerText = duration.toFixed(2);

            console.log("Initial Speed:", (brakeStartSpeed*3.6).toFixed(1));
            console.log("Average Decel:", avgDecel.toFixed(2));
        }
    }

    lastSpeed = speedMS;
    lastTime = now;
}

function stopRide(){
    navigator.geolocation.clearWatch(watchId);
}
