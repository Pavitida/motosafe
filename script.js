let watchId
let lastPosition = null
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

    if (lastPosition && lastTime) {

      let dt = (currentTime - lastTime) / 1000

      let distance = getDistance(
        lastPosition.coords.latitude,
        lastPosition.coords.longitude,
        position.coords.latitude,
        position.coords.longitude
      )

      let speed = (distance / dt) * 3.6

      document.getElementById("speed").innerText = speed.toFixed(1)

      updateChart(speed)
      speedHistory.push(speed)

      let accel = (speed / 3.6) / dt
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

      if (Math.abs(accel) > 20) {
        document.getElementById("crashAlert").innerText = "💥 CRASH DETECTED"
      }

      document.getElementById("peakDecel").innerText = peakDecel.toFixed(2)
      document.getElementById("brakeDistance").innerText = brakeDistance.toFixed(1)

      if (brakeStartTime) {
        let duration = (currentTime - brakeStartTime)/1000
        document.getElementById("duration").innerText = duration.toFixed(1)
      }

    }

    lastPosition = position
    lastTime = currentTime

  },{
    enableHighAccuracy: true,
    maximumAge: 0
  })

}

function stopTracking(){
  navigator.geolocation.clearWatch(watchId)
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2-lat1) * Math.PI/180
  const dLon = (lon2-lon1) * Math.PI/180

  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2) *
    Math.sin(dLon/2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
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
