// ================= ORIGINAL =================
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
let heatLayer=null

let rideStartTime=null

// ================= SENSOR =================
let accelY=0
let smoothAccel=0

window.addEventListener("devicemotion",(e)=>{
if(e.accelerationIncludingGravity){
accelY=e.accelerationIncludingGravity.y||0
smoothAccel = smoothAccel*0.8 + accelY*0.2
}
})

// ================= BUFFER =================
let decelBuffer=[]

// ================= INIT =================
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

// 🔥 create heat layer once
heatLayer = L.heatLayer(heatPoints,{radius:25}).addTo(map)

}

// ================= START =================
function startRide(){

if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
DeviceMotionEvent.requestPermission()
}

navigator.geolocation.getCurrentPosition(()=>{
watching=true
rideStartTime=Date.now()
watchId=navigator.geolocation.watchPosition(updateSpeed)
})

}

// ================= STOP =================
function stopRide(){
watching=false
navigator.geolocation.clearWatch(watchId)
}

// ================= POPUP =================
function showPopup(text,color){
let p=document.getElementById("popup")
p.innerText=text
p.style.background=color
p.style.display="block"
setTimeout(()=>p.style.display="none",1500)
}

// ================= UPDATE =================
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

// ================= SMART DECEL =================
let sensorDecel = -smoothAccel
let gpsDecel = -(dv/dt)
let decel = Math.max(sensorDecel, gpsDecel)

// ===== FILTER =====
if(speed < 8) return
if(Math.abs(sensorDecel) < 0.8 && Math.abs(gpsDecel) < 0.8) return

decelBuffer.push(decel)
if(decelBuffer.length > 5) decelBuffer.shift()
decel = decelBuffer.reduce((a,b)=>a+b,0)/decelBuffer.length

let isPothole = (decel > 6 && dt < 0.15)
if(decel < 1.5 && !isPothole) return

// ================= LABEL =================
let label="CRUISE"
if(decel > 5) label="HARD_BRAKE"
else if(decel > 2) label="BRAKE"
else if(speed < 5) label="STOP"

// ================= PEAK =================
if(decel>peakDecel) peakDecel=decel
document.getElementById("peak").innerText=peakDecel.toFixed(2)

// ================= BRAKE =================
if(!isPothole){
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
}

// ================= POTHOLE =================
if(isPothole){
showPopup("🕳 POTHOLE","#845ef7")

L.circleMarker([lat,lng],{
color:"purple",
radius:6
}).addTo(map).bindPopup("POTHOLE")

dataset.push({
timestamp:now,
event:"pothole",
decel:decel,
lat:lat,
lng:lng,
label:"POTHOLE"
})
}

// ================= CHART =================
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

// ================= DATASET =================
dataset.push({
timestamp: now,
time: t,
duration: ((now-rideStartTime)/1000),
speed: speed,
acceleration: acceleration,
deceleration: decel,
lat: lat,
lng: lng,
label: label
})

}

lastSpeed=speed
lastTime=now

}

// ================= BRAKE EVENT =================
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
slowBrakes++
showPopup("🟢 SLOW","#51cf66")
}

// ================= MAP =================
L.circleMarker([lat,lng],{
color:color,
radius:8
}).addTo(map).bindPopup(type)

// 🔥 update heatmap (no duplicate layer)
if(type==="HARD"){
heatPoints.push([lat,lng,1])
heatLayer.setLatLngs(heatPoints)
}

// ================= RISK =================
let risk=100
risk -= hardBrakes*12
risk -= normalBrakes*6
risk -= slowBrakes*2
risk -= peakDecel*2

if(risk<0) risk=0

let riskEl=document.getElementById("risk")
riskEl.innerText=Math.round(risk)

// 🔥 USE NEW CSS CLASS
riskEl.className=""
if(risk>70) riskEl.classList.add("status-safe")
else if(risk>40) riskEl.classList.add("status-warning")
else riskEl.classList.add("status-danger")

// ================= STYLE =================
let style="SAFE"
if(risk<70) style="NORMAL"
if(risk<40) style="AGGRESSIVE"

document.getElementById("style").innerText=style

// ================= DATASET =================
dataset.push({
timestamp: Date.now(),
event:"brake",
type:type,
risk:risk,
style:style,
peakDecel:peakDecel,
distance:brakeDistance,
lat:lat,
lng:lng,
label:type
})

// ================= UI =================
document.getElementById("total").innerText=totalBrakes
document.getElementById("hard").innerText=hardBrakes
document.getElementById("brakeDist").innerText=brakeDistance.toFixed(2)

updateSummary()

peakDecel=0
}

// ================= SUMMARY =================
function updateSummary(){
let decels = dataset.map(d=>d.deceleration||0).filter(v=>v>0)

let avg = decels.reduce((a,b)=>a+b,0)/decels.length || 0
let max = Math.max(...decels,0)

document.getElementById("avg").innerText=avg.toFixed(2)
document.getElementById("max").innerText=max.toFixed(2)
}

// ================= CSV =================
function exportCSV(){

let csv="timestamp,time,duration,speed,acceleration,deceleration,lat,lng,event,type,risk,style,peakDecel,distance,label\n"

dataset.forEach(d=>{
csv+=`${d.timestamp||""},${d.time||""},${d.duration||""},${d.speed||""},${d.acceleration||""},${d.deceleration||""},${d.lat||""},${d.lng||""},${d.event||""},${d.type||""},${d.risk||""},${d.style||""},${d.peakDecel||""},${d.distance||""},${d.label||""}\n`
})

let blob=new Blob([csv])
let a=document.createElement("a")
a.href=URL.createObjectURL(blob)
a.download="ride_full_ai_dataset.csv"
a.click()

}

// ================= CLEAR =================
function clearData(){
location.reload()
}
// ================= PRO UPGRADE ADD-ON =================

// 🔥 smooth ค่า speed ไม่ให้กระตุก
let smoothSpeed = 0

function smoothValue(current, target, alpha=0.2){
return current*(1-alpha) + target*alpha
}

// 🔥 override updateSpeed display only (ไม่ยุ่ง logic เดิม)
const oldUpdateSpeed = updateSpeed

updateSpeed = function(pos){

oldUpdateSpeed(pos)

// smooth speed UI
let speedEl = document.getElementById("speed")
let rawSpeed = parseFloat(speedEl.innerText) || 0

smoothSpeed = smoothValue(smoothSpeed, rawSpeed)
speedEl.innerText = smoothSpeed.toFixed(1)

// 🔥 auto color speed
if(smoothSpeed > 80){
speedEl.style.color = "#ff6b6b"
}
else if(smoothSpeed > 40){
speedEl.style.color = "#ffd43b"
}
else{
speedEl.style.color = "#69f0ae"
}

}

// 🔥 vibration feedback (มือถือ)
function vibrate(type){
if(!navigator.vibrate) return

if(type==="hard"){
navigator.vibrate([100,50,100])
}
else if(type==="normal"){
navigator.vibrate(100)
}
}

// 🔥 hook เข้า brake event
const oldLogBrake = logBrake

logBrake = function(lat,lng){

oldLogBrake(lat,lng)

// vibration ตามความแรง
if(peakDecel > 5){
vibrate("hard")
}else if(peakDecel > 2){
vibrate("normal")
}

}

// 🔥 auto center map แบบ smooth
function smoothPan(lat,lng){
map.panTo([lat,lng],{animate:true,duration:0.5})
}

// hook map movement
const oldUpdateSpeed2 = updateSpeed

updateSpeed = function(pos){

oldUpdateSpeed2(pos)

if(pos && pos.coords){
smoothPan(pos.coords.latitude,pos.coords.longitude)
}

}

// 🔥 auto save dataset กันข้อมูลหาย
setInterval(()=>{
if(dataset.length > 0){
localStorage.setItem("moto_dataset", JSON.stringify(dataset))
}
},5000)

// 🔥 recover dataset ตอน reload
window.addEventListener("load",()=>{
let saved = localStorage.getItem("moto_dataset")
if(saved){
dataset = JSON.parse(saved)
console.log("Recovered dataset:", dataset.length)
}
}) เพิ่มเข้าไปให้หน่อย
