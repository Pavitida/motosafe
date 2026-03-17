let watching=false
let watchId=null

let maxSpeed = 0
let totalDistance = 0

let lastSpeed=0
let lastTime=0

let rideStart=null
let dataset=[]

let chart
let map

let latitude = 13.7563
let longitude = 100.5018

window.onload=function(){

// Chart
chart=new Chart(document.getElementById("speedChart"),{
type:"line",
data:{
labels:[],
datasets:[{
label:"Speed km/h",
data:[],
borderWidth:2
}]
},
options:{responsive:true}
})

// Map
map = L.map('map').setView([latitude, longitude], 15)

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
.addTo(map)

}

// ✅ START
function startRide(){

alert("Start ทำงานแล้ว")

if(!navigator.geolocation){
alert("GPS not supported")
return
}

navigator.geolocation.getCurrentPosition(
(pos)=>{

alert("GPS Started ✅")

watching=true
rideStart=Date.now()

watchId = navigator.geolocation.watchPosition(
updateSpeed,
(err)=>alert("GPS Error: "+err.message),
{
enableHighAccuracy:true,
maximumAge:0,
timeout:10000
}
)

},
(err)=>{
alert("Location permission denied ❌")
}
)

}

// STOP
function stopRide(){

watching=false

if(watchId!==null){
navigator.geolocation.clearWatch(watchId)
}

alert("Stopped")

}

// UPDATE
function updateSpeed(position){

if(!watching)return

latitude = position.coords.latitude
longitude = position.coords.longitude

map.setView([latitude, longitude])

let speedMS = position.coords.speed || 0
let speed = speedMS * 3.6

let now = Date.now()

document.getElementById("speed").innerText=speed.toFixed(1)

if(speed > maxSpeed){
maxSpeed = speed
document.getElementById("maxSpeed").innerText=maxSpeed.toFixed(1)
}

if(lastTime!==0){

let dt=(now-lastTime)/1000
let dv=speed-lastSpeed

totalDistance += speed * dt / 3600
document.getElementById("distanceRide").innerText=totalDistance.toFixed(2)

dataset.push({
time:new Date().toLocaleTimeString(),
speed:speed,
lat: latitude,
lng: longitude
})

updateChart(speed)

}

lastSpeed=speed
lastTime=now

updateDuration()

}

function updateDuration(){
if(!rideStart)return
let duration=(Date.now()-rideStart)/1000
document.getElementById("duration").innerText=duration.toFixed(0)
}

function updateChart(speed){

let time=new Date().toLocaleTimeString()

chart.data.labels.push(time)
chart.data.datasets[0].data.push(speed)

if(chart.data.labels.length>20){
chart.data.labels.shift()
chart.data.datasets[0].data.shift()
}

chart.update()

}

// EXPORT
function exportCSV(){

let csv="time,speed,lat,lng\n"

dataset.forEach(d=>{
csv+=`${d.time},${d.speed},${d.lat},${d.lng}\n`
})

let blob=new Blob([csv])
let a=document.createElement("a")
a.href=URL.createObjectURL(blob)
a.download="ride.csv"
a.click()

}

function clearData(){
location.reload()
}
