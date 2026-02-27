let riding = false;
let speed = 0;
let lean = 0;
let interval;

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
            y: {
                beginAtZero: true
            }
        }
    }
});

function startRide(){
    if(riding) return;
    riding = true;

    interval = setInterval(() => {
        speed = Math.floor(Math.random()*120);
        lean = Math.floor(Math.random()*50);

        document.getElementById("speed").innerText = speed + " km/h";
        document.getElementById("lean").innerText = lean + "°";

        speedChart.data.labels.push("");
        speedChart.data.datasets[0].data.push(speed);

        if(speedChart.data.labels.length > 15){
            speedChart.data.labels.shift();
            speedChart.data.datasets[0].data.shift();
        }

        speedChart.update();
    },1000);
}

function stopRide(){
    riding = false;
    clearInterval(interval);
}

function resetData(){
    speedChart.data.labels = [];
    speedChart.data.datasets[0].data = [];
    speedChart.update();
}
