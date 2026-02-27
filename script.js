let watchId
let lastSpeed = 0
let lastTime = null

let peakDecel = 0
let brakeDistance = 0
let brakeStartTime = null
let braking = false

let speedHistory = []

let chart

function startTracking() {

  document.getElementById("crashAlert").innerText = ""

  initChart()

  if (!navigator.geolocation) {
    alert("GPS not supported")
    return
  }

  watchId = navigator.geolocation.watchPosition(position => {

    let currentTime = Date.now()
    let speed = position.coords.speed

    if (speed == null) return

    speed = speed * 3.6
    document.getElementById("speed").innerText = speed.toFixed(1)

    updateChart(speed)
    speedHistory.push(speed)

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
        brakeDistance += (speed/3.6) * dt
      } else {
        braking = false
      }

      if (Math.abs(accel) > 15) {
        document.getElementById("crashAlert").innerText = "💥 CRASH DETECTED"
      }

      document.getElementById("peakDecel").innerText = peakDecel.toFixed(2)
      document.getElementById("brakeDistance").innerText = brakeDistance.toFixed(1)

      if (brakeStartTime) {
        let duration = (currentTime - brakeStartTime)/1000
        document.getElementById("duration").innerText = duration.toFixed(1)
      }

      lastSpeed = speed
    }

    lastTime = currentTime

  },{
    enableHighAccuracy: true
  })

}

function stopTracking(){
  navigator.geolocation.clearWatch(watchId)
}

function initChart(){
  const ctx = document.getElementById("chart")
  chart = new Chart(ctx,{
    type:'line',
    data:{
      labels:[],
      datasets:[{
        label:'Speed (km/h)',
        data:[],
        borderWidth:2
      }]
    }
  })
}

function updateChart(speed){
  chart.data.labels.push('')
  chart.data.datasets[0].data.push(speed)

  if(chart.data.labels.length > 50){
    chart.data.labels.shift()
    chart.data.datasets[0].data.shift()
  }

  chart.update()
}

function exportCSV(){

  let csv = "SpeedHistory(km/h)\n"
  speedHistory.forEach(s => {
    csv += s + "\n"
  })

  let blob = new Blob([csv], {type:'text/csv'})
  let link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = "MotoSafeData.csv"
  link.click()
}
