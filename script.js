let watchId;

let speed = 0;
let lastSpeed = 0;
let lastTime = 0;

let braking = false;
let brakeStartTime = 0;
let brakeStartSpeed = 0;

let peakDecel = 0;
let brakeDistance = 0;

let speedData = [];
let timeData = [];

const speedEl = document.getElementById("speed");
const peakEl = document.getElementById("peak");
const distanceEl = document.getElementById("distance");
const durationEl = document.getElementById("duration");

const ctx = document.getElementById("speedChart").getContext("2d");

const speedChart = new Chart(ctx,{
    type:"line",
    data:{
        labels:timeData,
        datasets:[{
            label:"Speed (km/h)",
            data:speedData,
            fill:false,
            tension:0.2
        }]
    }
});

function startRide(){

    if(!navigator.geolocation){
        alert("GPS not supported");
        return;
    }

    watchId = navigator.geolocation.watchPosition(updateSpeed,error,{
        enableHighAccuracy:true,
        maximumAge:0,
        timeout:5000
    });

}

function stopRide(){

    navigator.geolocation.clearWatch(watchId);

}

function updateSpeed(position){

    let now = Date.now();
    let gpsSpeed = position.coords.speed;

    if(gpsSpeed == null){
        gpsSpeed = 0;
    }

    speed = gpsSpeed * 3.6;

    speedEl.innerText = speed.toFixed(1);

    timeData.push((now/1000).toFixed(0));
    speedData.push(speed);

    speedChart.update();

    if(lastTime !== 0){

        let dt = (now - lastTime)/1000;
        let dv = speed - lastSpeed;

        let accel = (dv/3.6)/dt;

        if(accel < peakDecel){
            peakDecel = accel;
            peakEl.innerText = peakDecel.toFixed(2);
        }

        if(accel < -1.5 && !braking){

            braking = true;
            brakeStartTime = now;
            brakeStartSpeed = lastSpeed;
            peakDecel = accel;
            brakeDistance = 0;

        }

        if(braking){

            brakeDistance += (speed/3.6)*dt;

            distanceEl.innerText = brakeDistance.toFixed(2);

            let duration = (now - brakeStartTime)/1000;
            durationEl.innerText = duration.toFixed(2);

            if(speed < 2){

                braking = false;

            }

        }

    }

    lastSpeed = speed;
    lastTime = now;

}

function error(err){

    console.log(err);

}

function exportCSV(){

    let csv = "time,speed\n";

    for(let i=0;i<speedData.length;i++){

        csv += timeData[i]+","+speedData[i]+"\n";

    }

    let blob = new Blob([csv],{type:"text/csv"});
    let url = URL.createObjectURL(blob);

    let a = document.createElement("a");
    a.href = url;
    a.download = "motosafe_data.csv";
    a.click();

}

function clearData(){

    speedData = [];
    timeData = [];

    speedChart.data.labels = [];
    speedChart.data.datasets[0].data = [];
    speedChart.update();

}
