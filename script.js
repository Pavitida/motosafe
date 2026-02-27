let braking = false;
let brakeStartTime = 0;
let brakeDistance = 0;
let peakDecel = 0;
let decelData = [];

let velocity = 0; // คำนวณจากการอินทิเกรต
let lastTime = 0;

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

async function startRide(){

    if (typeof DeviceMotionEvent.requestPermission === "function") {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== "granted") {
            alert("Permission denied");
            return;
        }
    }

    window.addEventListener("devicemotion", handleMotion);
    lastTime = Date.now();
}

function handleMotion(event){

    let now = Date.now();
    let dt = (now - lastTime) / 1000;
    lastTime = now;

    if(dt <= 0) return;

    let accel = event.accelerationIncludingGravity.y;

    if(accel === null) return;

    // คำนวณความเร็วจาก a*dt
    velocity += accel * dt;

    let speedKMH = Math.abs(velocity * 3.6);
    speedEl.innerText = speedKMH.toFixed(1);

    // เริ่มจับเบรก
    if(accel < -2 && !braking){
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

        brakeDistance += Math.abs(velocity) * dt;

        let decel = Math.abs(accel);

        if(decel > peakDecel){
            peakDecel = decel;
        }

        decelData.push(decel);

        chart.data.labels.push("");
        chart.data.datasets[0].data.push(decel);
        chart.update();

        if(Math.abs(velocity) < 0.3){

            braking = false;

            let duration = (now - brakeStartTime) / 1000;

            peakEl.innerText = peakDecel.toFixed(2);
            distanceEl.innerText = brakeDistance.toFixed(2);
            durationEl.innerText = duration.toFixed(2);
        }
    }
}

function stopRide(){
    window.removeEventListener("devicemotion", handleMotion);
}
