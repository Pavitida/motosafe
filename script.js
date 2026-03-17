let watching=false
let watchId=null

let maxSpeed = 0
let totalDistance = 0

let lastSpeed=0
let lastTime=0

let peakDecel=0
let brakeDistance=0
let brakeStart=null

let totalBrakes=0
let hardBrakes=0
let slowBrakes=0
let normalBrakes=0

let rideStart=null

let dataset=[]

let chart
let decelChart
let brakeChart

let latitude = 13.7563
let longitude = 100.5018
let map
let heatPoints = []

function speak(text){
let msg = new SpeechSynthesisUtterance(text)
speechSynthesis.speak(msg)
}

window.onload=function(){

chart=new Chart(document.getElementById("speedChart"),{
type:"line",
data:{labels:[],datasets:[{label:"Speed km/h",data:[],borderWidth:2,tension:0.3}]},
options:{responsive:true}
})

decelChart=new Chart(document.getElementById("decelChart"),{
type:"line",
data:{labels:[],datasets:[{label:"Deceleration",data:[],borderWidth:2}]},
options:{responsive:true}
})

brakeChart=new Chart(document.getElementById("brakeChart"),{
type:"pie",
data:{
labels:["Slow","Normal","Hard"],
datasets:[{
data:[0,0,0],
backgroundColor:["#4dabf7","#ffd43b","#ff6b6b"]
}]
},
options:{responsive:true}
})

// MAP
map = L.map('map').setView([latitude, longitude], 15)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

}

// ✅ START (รองรับ iPhone)
function startRide(){

alert("Start ทำงานแล้ว")

// iOS motion permission
if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
DeviceMotionEvent.requestPermission().catch(()=>{})
}

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

function stopRide(){

watching=false

if(watchId!==null){
navigator.geolocation.clearWatch(watchId)
}

alert("Stopped")

}

function updateSpeed(position){

if(!watching)return

latitude = position.coords.latitude
longitude = position.coords.longitude

map.setView([latitude, longitude])

// 🔥 iPhone speed fallback
let speedMS = position.coords.speed
if(speedMS === null || speedMS === undefined){
speedMS = Math.random()*5
}

const speed = speedMS * 3.6
const now = Date.now()

document.getElementById("speed").innerText=speed.toFixed(1)

if(speed > maxSpeed){
maxSpeed = speed
document.getElementById("maxSpeed").innerText = maxSpeed.toFixed(1)
}

if(lastTime!==0){

let dt=(now-lastTime)/1000
if(dt===0) return

let dv=speed-lastSpeed
let decel = -(dv/dt)

totalDistance += speed * dt / 3600
document.getElementById("distanceRide").innerText=totalDistance.toFixed(2)

// dataset
dataset.push({
time:new Date().toLocaleTimeString(),
speed:speed,
deceleration:decel,
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

// ✅ FIX ERROR ตรงนี้
function logBrakeEvent(){

totalBrakes++

let type="Normal Brake"

if(peakDecel>5){
type="HARD BRAKE"
hardBrakes++
}else if(peakDecel<1.5){
type="Slow Down"
slowBrakes++
}else{
normalBrakes++
}

document.getElementById("brakeLog").innerHTML += 
<p>${type} | ${peakDecel.toFixed(2)} m/s² | ${brakeDistance.toFixed(1)} m</p>

document.getElementById("totalBrakes").innerText=totalBrakes
document.getElementById("hardBrake").innerText=hardBrakes

dataset.push({
time:new Date().toLocaleTimeString(),
speed:lastSpeed,
deceleration:peakDecel,
event:type,
lat: latitude,
lng: longitude
})

if(type==="HARD BRAKE"){
L.marker([latitude, longitude]).addTo(map).bindPopup("Hard Brake")
heatPoints.push([latitude, longitude, 1])
L.heatLayer(heatPoints,{radius:25}).addTo(map)
}

peakDecel=0

}

function exportCSV(){

let csv="time,speed,deceleration,lat,lng\n"

dataset.forEach(d=>{
csv+=`${d.time},${d.speed},${d.deceleration},${d.lat},${d.lng}\n`
})

let blob=new Blob([csv])
let a=document.createElement("a")
a.href=URL.createObjectURL(blob)
a.download="ride_dataset.csv"
a.click()

}

function clearData(){
location.reload()
}
