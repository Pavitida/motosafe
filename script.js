let watchId
let speed = 0
let lastSpeed = 0
let lastTime = null

let peakDecel = 0
let brakeDistance = 0
let duration = 0
let braking = false
let brakeStartTime = null

let crashThreshold = 15 // m/s²

let speedData = []
let timeData = []

let chart

function startSystem() {

    document.getElementById("crashAlert").innerText = ""

    initChart()

    if (navigator.geolocation) {

        watchId = navigator.geolocation.watchPosition(position => {

            let currentTime = Date.now()
            let newSpeed = position.coords.speed

            if (newSpeed == null) return

            newSpeed = newSpeed * 3.6 // km/h
            speed = newSpeed

            document.getElementById("speed").innerText = speed.toFixed(1)

            updateChart(speed)

            if (lastTime) {

                let dt = (currentTime - lastTime) / 1000
                let accel = ((speed - lastSpeed) / 3.6) / dt
                let decel = -accel

                if (decel > peakDecel) peakDecel = decel

                if (decel > 2) {
                    if (!braking) {
                        braking = true
                        brakeStartTime = currentTime
                    }
                    brakeDistance += (speed / 3.6) * dt
                    duration = (currentTime - brakeStartTime) / 1000
                } else {
                    braking = false
                }

                if (Math.abs(accel) > crashThreshold) {
                    document.getElementById("crashAlert").innerText = "💥 CRASH DETECTED!"
                }

                document.getElementById("peakDecel").innerText = peakDecel.toFixed(2)
                document.getElementById("brakeDistance").innerText = brakeDistance.toFixed(1)
                document.getElementById("duration").innerText = duration.toFixed(1)

                lastSpeed = speed
            }

            lastTime = currentTime

        }, error => {
            alert("Please allow GPS access")
        }, {
            enableHighAccuracy: true
        })
    }
}

function initChart() {
    const ctx = document.getElementById('speedChart')
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Speed (km/h)',
                data: [],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true
        }
    })
}

function updateChart(speed) {

    chart.data.labels.push('')
    chart.data.datasets[0].data.push(speed)

    if (chart.data.labels.length > 50) {
        chart.data.labels.shift()
        chart.data.datasets[0].data.shift()
    }

    chart.update()
}
