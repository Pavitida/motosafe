let riding = false;
let speed = 0;
let lean = 0;
let interval;

let lastSpeed = 0;
let lastTime = 0;
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

function startRide(){
    if(riding) return;
    riding = true;

    lastTime = Date.now();
    brakeDistance = 0;

    interval = setInterval(() => {

        // จำลองความเร็วแบบสมจริง (เร่ง/ลด)
        let change = Math.floor(Math.random()*20 - 10);
        speed += change;

        if(speed < 0) speed = 0;
        if(speed > 160) speed = 160;

        lean = Math.floor(Math.random()*55);

        let now = Date.now();
        let dt = (now - lastTime)/1000;

        // คำนวณความเร่ง (m/s²)
        let speedMS = speed / 3.6;
        let lastSpeedMS = lastSpeed / 3.6;

        let acceleration = (speedMS - lastSpeedMS) / dt;

        // g-force
        let gForce = acceleration / 9.81;

        // ถ้ากำลังเบรก (ความเร่งติดลบ)
        if(acceleration < 0){
            brakeDistance += speedMS * dt;
        }

        // crash detection
        if(gForce < -1.2){
            alert("💥 CRASH DETECTED!");
        }

        // แสดงค่า
        speedEl.innerText = speed + " km/h";
        leanEl.innerText = lean + "°";

        // อัปเดตกราฟ
        speedChart.data.labels.push("");
        speedChart.data.datasets[0].data.push(speed);

        if(speedChart.data.labels.length > 20){
            speedChart.data.labels.shift();
            speedChart.data.datasets[0].data.shift();
        }

        speedChart.update();

        lastSpeed = speed;
        lastTime = now;

    },1000);
}

function stopRide(){
    riding = false;
    clearInterval(interval);

    alert(
        "📉 Brake Distance: " + brakeDistance.toFixed(1) + " m"
    );
}

function resetData(){
    speed = 0;
    lastSpeed = 0;
    brakeDistance = 0;

    speedChart.data.labels = [];
    speedChart.data.datasets[0].data = [];
    speedChart.update();

    speedEl.innerText = "0 km/h";
    leanEl.innerText = "0°";
}
