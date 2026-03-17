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

// 🔥 GPS + MAP
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

// 🔥 MAP
map = L.map('map').setView([latitude, longitude], 15)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

}

// ✅ FIX: START ให้ GPS ทำงานแน่นอน
function startRide(){

console.log("Start clicked")

if(!navigator.geolocation){
alert("Geolocation not supported")
return
}

navigator.geolocation.getCurrentPosition(
(pos)=>{

alert("GPS Started ✅ (ลองเดิน)")

watching=true
rideStart=Date.now()

watchId = navigator.geolocation.watchPosition(
updateSpeed,
(err)=>{
alert("GPS Error: "+err.message)
},
{
enableHighAccuracy:true,
maximumAge:0,
timeout:5000
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

analyzeRisk()

let avgSpeed = calculateAverageSpeed()

alert(
"Ride Summary\n\n"+
"Distance: "+totalDistance.toFixed(2)+" km\n"+
"Max Speed: "+maxSpeed.toFixed(1)+" km/h\n"+
"Average Speed: "+avgSpeed.toFixed(1)+" km/h\n"+
"Hard Brakes: "+hardBrakes
)

}

function updateSpeed(position){

console.log("GPS update", position.coords)

if(!watching)return

latitude = position.coords.latitude
longitude = position.coords.longitude

// 🔥 move map
map.setView([latitude, longitude])

const speedMS=position.coords.speed || 0
const speed=speedMS*3.6

const now=Date.now()

document.getElementById("speed").innerText=speed.toFixed(1)

if(speed>80){
document.getElementById("speed").style.color="red"
speak("Slow down")
}else{
document.getElementById("speed").style.color="black"
}

if(speed > maxSpeed){
maxSpeed = speed
let el = document.getElementById("maxSpeed")
if(el) el.innerText = maxSpeed.toFixed(1)
}

if(lastTime!==0){

let dt=(now-lastTime)/1000
if(dt===0) return

let dv=speed-lastSpeed

let accel=dv/dt
let decel=-accel

totalDistance += speed * dt / 3600

let distEl=document.getElementById("distanceRide")
if(distEl) distEl.innerText=totalDistance.toFixed(2)

updateDecelChart(decel)
checkCrash(decel)

if(decel>peakDecel){
peakDecel=decel
document.getElementById("peak").innerText=decel.toFixed(2)
}

detectBrake(speed,decel,dt)

// dataset
dataset.push({
time:new Date().toLocaleTimeString(),
speed:speed,
deceleration:decel,
event:"normal",
lat: latitude,
lng: longitude
})

}

lastSpeed=speed
lastTime=now

updateChart(speed)
updateDuration()

}

function detectBrake(speed,decel,dt){

if(speed<=1){
brakeStart=null
return
}

if(decel>2){

if(brakeStart===null){
brakeStart=speed
brakeDistance=0
}

brakeDistance+=speed*dt/3.6

}else{

if(brakeStart!==null){
logBrakeEvent()
}

brakeStart=null

}

}

function logBrakeEvent(){

totalBrakes++

let type="Normal Brake"

if(peakDecel>5){
type="HARD BRAKE"
hardBrakes++
speak("Hard brake detected")
}else if(peakDecel<1.5){
type="Slow Down"
slowBrakes++
}else{
normalBrakes++
}

document.getElementById("brakeLog").innerHTML+=
<p>${type} | ${peakDecel.toFixed(2)} m/s² | ${brakeDistance.toFixed(1)} m</p>

document.getElementById("distance").innerText=brakeDistance.toFixed(1)

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

// 🔥 MAP จุดเบรกแรง
if(type==="HARD BRAKE"){

L.marker([latitude, longitude]).addTo(map).bindPopup("Hard Brake")

heatPoints.push([latitude, longitude, 1])
L.heatLayer(heatPoints,{radius:25}).addTo(map)

}

updateBrakeChart()

peakDecel=0

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

function updateDecelChart(decel){

let time=new Date().toLocaleTimeString()

decelChart.data.labels.push(time)
decelChart.data.datasets[0].data.push(decel)

if(decelChart.data.labels.length>20){
decelChart.data.labels.shift()
decelChart.data.datasets[0].data.shift()
}

decelChart.update()

}

function checkCrash(decel){

if(decel>15){
document.getElementById("crashStatus").innerText="🚨 Possible Crash Detected"
speak("Possible crash detected")
}

}

function updateBrakeChart(){

brakeChart.data.datasets[0].data=[
slowBrakes,
normalBrakes,
hardBrakes
]

brakeChart.update()

}

function analyzeRisk(){

let ratio=0

if(totalBrakes>0){
ratio=(hardBrakes/totalBrakes)*100
}

document.getElementById("hardRatio").innerText=ratio.toFixed(1)+"%"

let level="SAFE"

if(ratio>40){
level="DANGEROUS"
}
else if(ratio>20){
level="RISKY"
}

document.getElementById("riskLevel").innerText=level

let score=100
score-=hardBrakes*10
score-=normalBrakes*3

if(score<0)score=0

document.getElementById("riskScore").innerText=score

}

function calculateAverageSpeed(){

let duration=(Date.now()-rideStart)/1000
if(duration==0) return 0

return totalDistance/(duration/3600)

}

function exportCSV(){

let csv="time,speed,deceleration,event,lat,lng\n"

dataset.forEach(d=>{
csv+=`${d.time},${d.speed},${d.deceleration},${d.event},${d.lat},${d.lng}\n`
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
