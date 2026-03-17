let watching=false
let watchId=null

let maxSpeed = 0
let totalDistance = 0

let lastSpeed=0
let lastTime=0

let rideStart=null
let dataset=[]

let chart
let decelChart
let map

let latitude = 13.7563
let longitude = 100.5018

// 🔥 new
let peakDecel=0
let brakeStart=null
let brakeDistance=0

let totalBrakes=0
let hardBrakes=0

let heatPoints=[]

window.onload=function(){

// Speed Chart
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

// Decel Chart
decelChart=new Chart(document.getElementById("decelChart"),{
type:"line",
data:{
labels:[],
datasets:[{
label:"Deceleration",
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

// START
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

// distance
totalDistance += speed * dt / 3600
document.getElementById("distanceRide").innerText=totalDistance.toFixed(2)

// deceleration
if(dt>0){

let decel = -(dv/dt)

// graph
decelChart.data.labels.push(new Date().toLocaleTimeString())
decelChart.data.datasets[0].data.push(decel)

if(decelChart.data.labels.length>20){
decelChart.data.labels.shift()
decelChart.data.datasets[0].data.shift()
}

decelChart.update()

// brake detect
if(decel>1){

if(brakeStart===null){
brakeStart=totalDistance
peakDecel=decel
}else{
if(decel>peakDecel) peakDecel=decel
}

}else{

if(brakeStart!==null){
brakeDistance=totalDistance-brakeStart
logBrakeEvent()
brakeStart=null
}

}

}

// dataset
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

// duration
function updateDuration(){
if(!rideStart)return
let duration=(Date.now()-rideStart)/1000
document.getElementById("duration").innerText=duration.toFixed(0)
}

// speed chart
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

// 🔴 brake event
function logBrakeEvent(){

totalBrakes++

let type="Normal"

if(peakDecel>5){
type="HARD"
hardBrakes++
showPopup()
}else if(peakDecel<1.5){
type="SOFT"
}

document.getElementById("brakeLog").innerHTML += 
<p>${type} | ${peakDecel.toFixed(2)} m/s²</p>

// heatmap
if(type==="HARD"){
heatPoints.push([latitude, longitude, 1])
L.heatLayer(heatPoints,{radius:25}).addTo(map)
}

// risk
let ratio = hardBrakes / totalBrakes

if(ratio>0.5){
document.getElementById("riskLevel").innerText="DANGEROUS"
}else if(ratio>0.3){
document.getElementById("riskLevel").innerText="WARNING"
}else{
document.getElementById("riskLevel").innerText="SAFE"
}

peakDecel=0

}

// popup
function showPopup(){
let popup=document.getElementById("popup")
popup.style.display="block"

setTimeout(()=>{
popup.style.display="none"
},1500)
}

// export
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
