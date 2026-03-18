// ================== YOUR ORIGINAL CODE ==================
let watching=false
let watchId=null

let lastSpeed=0
let lastTime=0

let peakDecel=0
let brakeStart=null
let brakeDistance=0

let totalBrakes=0
let hardBrakes=0
let normalBrakes=0
let slowBrakes=0

let dataset=[]

let chart
let decelChart

let map
let heatPoints=[]

let rideStartTime=null

// ================== ✅ ADD: SENSOR REAL ==================
let accelY=0
let smoothAccel=0

window.addEventListener("devicemotion",(e)=>{
if(e.accelerationIncludingGravity){
accelY=e.accelerationIncludingGravity.y||0
smoothAccel = smoothAccel*0.8 + accelY*0.2
}
})

// ================== INIT ==================
window.onload=function(){

chart=new Chart(document.getElementById("speedChart"),{
type:"line",
data:{labels:[],datasets:[{label:"Speed",data:[]}]}
})

decelChart=new Chart(document.getElementById("decelChart"),{
type:"line",
data:{labels:[],datasets:[{label:"Decel",data:[]}]}
})

map=L.map('map').setView([13.7563,100.5018],15)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

}

// ================== START ==================
function startRide(){

// ✅ iPhone sensor permission
if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
DeviceMotionEvent.requestPermission()
}

navigator.geolocation.getCurrentPosition(()=>{
watching=true
rideStartTime=Date.now()
watchId=navigator.geolocation.watchPosition(updateSpeed)
})

}

// ================== STOP ==================
function stopRide(){
watching=false
navigator.geolocation.clearWatch(watchId)
}

// ================== POPUP ==================
function showPopup(text,color){
let p=document.getElementById("popup")
p.innerText=text
p.style.background=color
p.style.display="block"
setTimeout(()=>p.style.display="none",1500)
}

// ================== UPDATE ==================
function updateSpeed(pos){

if(!watching)return

let lat=pos.coords.latitude
let lng=pos.coords.longitude
map.setView([lat,lng])

let speed=(pos.coords.speed||0)*3.6
let now=Date.now()

document.getElementById("speed").innerText=speed.toFixed(1)

if(lastTime){

let dt=(now-lastTime)/1000
if(dt===0)return

let dv=speed-lastSpeed

let acceleration = dv/dt

// ================== ✅ ADD: SMART DECEL ==================
// ใช้ sensor ถ้ามี / fallback gps
let sensorDecel = -smoothAccel
let gpsDecel = -(dv/dt)

// fusion (เอาที่แรงกว่า)
let decel = Math.max(sensorDecel, gpsDecel)

// =======================================================

if(decel>peakDecel) peakDecel=decel

document.getElementById("peak").innerText=peakDecel.toFixed(2)

// ================== BRAKE PHASE ==================
if(decel>2){
if(!brakeStart){
brakeStart=now
brakeDistance=0
}
brakeDistance+=speed*dt/3600
}else{
if(brakeStart){
logBrake(lat,lng)
brakeStart=null
}
}

// ================== CHART ==================
let t=new Date().toLocaleTimeString()

chart.data.labels.push(t)
chart.data.datasets[0].data.push(speed)

decelChart.data.labels.push(t)
decelChart.data.datasets[0].data.push(decel)

if(chart.data.labels.length>20){
chart.data.labels.shift()
chart.data.datasets[0].data.shift()
decelChart.data.labels.shift()
decelChart.data.datasets[0].data.shift()
}

chart.update()
decelChart.update()

// ================== DATASET ==================
dataset.push({
timestamp: now,
time: t,
duration: ((now-rideStartTime)/1000),
speed: speed,
acceleration: acceleration,
deceleration: decel,
lat: lat,
lng: lng
})

}

lastSpeed=speed
lastTime=now

}

// ================== BRAKE EVENT ==================
function logBrake(lat,lng){

totalBrakes++

let type="SLOW"
let color="green"

if(peakDecel > 5){
type="HARD"
color="red"
hardBrakes++
showPopup("🔴 HARD BRAKE","#ff4d4d")
}
else if(peakDecel > 2){
type="NORMAL"
color="yellow"
normalBrakes++
showPopup("🟡 NORMAL BRAKE","#ffd43b")
}
else{
type="SLOW"
color="green"
slowBrakes++
showPopup("🟢 SLOW DOWN","#51cf66")
}

// ================== MAP ==================
L.circleMarker([lat,lng],{
color:color,
radius:8
}).addTo(map).bindPopup(type)

// 🔥 heatmap HARD ONLY
if(type==="HARD"){
heatPoints.push([lat,lng,1])
L.heatLayer(heatPoints,{radius:25}).addTo(map)
}

// ================== UI ==================
document.getElementById("total").innerText=totalBrakes
document.getElementById("hard").innerText=hardBrakes
document.getElementById("brakeDist").innerText=brakeDistance.toFixed(2)

// ================== ✅ ADD: AI PRO ==================
let risk=100
risk -= hardBrakes*12
risk -= normalBrakes*6
risk -= slowBrakes*2
risk -= peakDecel*2

if(risk<0) risk=0
document.getElementById("risk").innerText=Math.round(risk)

// ================== DATASET EVENT ==================
dataset.push({
timestamp: Date.now(),
event:"brake",
type:type,
risk:risk,
peakDecel:peakDecel,
distance:brakeDistance,
lat:lat,
lng:lng
})

updateSummary()

peakDecel=0
}

// ================== SUMMARY ==================
function updateSummary(){

let decels=dataset.map(d=>d.deceleration||0)

let avg=decels.reduce((a,b)=>a+b,0)/decels.length || 0
let max=Math.max(...decels,0)

document.getElementById("avg").innerText=avg.toFixed(2)
document.getElementById("max").innerText=max.toFixed(2)

}

// ================== CSV ==================
function exportCSV(){

let csv="timestamp,time,duration,speed,acceleration,deceleration,lat,lng,event,type,risk,peakDecel,distance\n"

dataset.forEach(d=>{
csv+=`${d.timestamp||""},${d.time||""},${d.duration||""},${d.speed||""},${d.acceleration||""},${d.deceleration||""},${d.lat||""},${d.lng||""},${d.event||""},${d.type||""},${d.risk||""},${d.peakDecel||""},${d.distance||""}\n`
})

let blob=new Blob([csv])
let a=document.createElement("a")
a.href=URL.createObjectURL(blob)
a.download="ride_full_dataset.csv"
a.click()

}

// ================== CLEAR ==================
function clearData(){
location.reload()
}
