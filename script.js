// ======================================
// MotoSafe Pro - Motion Based Detection
// Detect only when vehicle is moving
// ======================================

// ---------------- STATE ----------------
let velocity = 0;
let lastTime = 0;

let filteredAccel = 0;
const alpha = 0.25;

let braking = false;
let moving = false;

let brakeStartTime = 0;
let brakeDistance = 0;
let peakDecel = 0;

let currentType = "coast"; // coast | normal | hard

// ---------------- SUMMARY ----------------
let totalEvents = 0;
let hardEvents = 0;
let totalDistance = 0;
let totalPeak = 0;
let maxPeak = 0;

// ---------------- THRESHOLDS ----------------
const COAST_THRESHOLD = -0.6
const NORMAL_THRESHOLD = -1.6
const HARD_THRESHOLD = -3.8

const END_THRESHOLD = -0.2

const MIN_DURATION = 0.25
const DEADZONE = 0.12
const MAX_ACCEL_LIMIT = 12
const STOP_SPEED = 0.3

// ---------------- DOM ----------------
const speedEl = document.getElementById("speed")
const peakEl = document.getElementById("peak")
const distanceEl = document.getElementById("distance")
const durationEl = document.getElementById("duration")
const summaryEl = document.getElementById("summary")

// ---------------- CHART ----------------
const ctx = document.getElementById("speedChart").getContext("2d")

const chart = new Chart(ctx,{
type:"line",
data:{
labels:[],
datasets:[
{
label:"Normal Brake / Coast",
data:[],
borderColor:"blue",
borderWidth:2,
tension:0.3
},
{
label:"Hard Brake",
data:[],
borderColor:"red",
borderWidth:2,
tension:0.3
}
]
},
options:{
responsive:true,
animation:false,
scales:{
y:{
beginAtZero:true,
title:{
display:true,
text:"Deceleration (m/s²)"
}
}
}
}
})

// ---------------- START ----------------
async function startRide(){

if(typeof DeviceMotionEvent.requestPermission==="function"){
const permission=await DeviceMotionEvent.requestPermission()
if(permission!=="granted") return
}

velocity=0
braking=false
moving=false
lastTime=Date.now()

chart.data.labels=[]
chart.data.datasets[0].data=[]
chart.data.datasets[1].data=[]
chart.update()

window.addEventListener("devicemotion",handleMotion)
}

// ---------------- STOP ----------------
function stopRide(){
window.removeEventListener("devicemotion",handleMotion)
}

// ---------------- MOTION ----------------
function handleMotion(event){

const now=Date.now()
const dt=(now-lastTime)/1000
lastTime=now
if(dt<=0) return

let accel=event.acceleration?.y
if(accel==null) return

if(Math.abs(accel)<DEADZONE) accel=0
if(Math.abs(accel)>MAX_ACCEL_LIMIT) return

filteredAccel=alpha*accel+(1-alpha)*filteredAccel

velocity+=filteredAccel*dt

// ตรวจว่ารถกำลังวิ่งไหม
if(Math.abs(velocity)>STOP_SPEED){
moving=true
}else{
velocity=0
moving=false

if(braking){
finalizeBrake(now)
}
}

const speedKmh=Math.abs(velocity*3.6)
speedEl.innerText=speedKmh.toFixed(1)

// ถ้าไม่วิ่งไม่ต้องจับ
if(!moving) return

// ---------------- START DECEL ----------------
if(!braking && filteredAccel<COAST_THRESHOLD){

braking=true
brakeStartTime=now
brakeDistance=0
peakDecel=0
currentType="coast"

chart.data.labels=[]
chart.data.datasets[0].data=[]
chart.data.datasets[1].data=[]
}

// ---------------- DURING DECEL ----------------
if(braking){

brakeDistance+=Math.abs(velocity)*dt

const decel=-filteredAccel

if(decel>peakDecel) peakDecel=decel

if(decel>=Math.abs(HARD_THRESHOLD)){
currentType="hard"
}
else if(decel>=Math.abs(NORMAL_THRESHOLD)){
if(currentType!=="hard")
currentType="normal"
}
else{
currentType="coast"
}

// -------- GRAPH --------
chart.data.labels.push("")

if(currentType==="hard"){
chart.data.datasets[0].data.push(null)
chart.data.datasets[1].data.push(decel)
}else{
chart.data.datasets[0].data.push(decel)
chart.data.datasets[1].data.push(null)
}

chart.update()

if(filteredAccel>END_THRESHOLD){
finalizeBrake(now)
}

}

}

// ---------------- FINALIZE ----------------
function finalizeBrake(now){

braking=false

const duration=(now-brakeStartTime)/1000
if(duration<MIN_DURATION) return

totalEvents++
totalDistance+=brakeDistance
totalPeak+=peakDecel

if(peakDecel>maxPeak) maxPeak=peakDecel

if(currentType==="hard"){
hardEvents++
alert("⚠️ HARD BRAKE DETECTED")
}

peakEl.innerText=peakDecel.toFixed(2)
distanceEl.innerText=brakeDistance.toFixed(2)
durationEl.innerText=duration.toFixed(2)

updateSummary()

}

// ---------------- SUMMARY ----------------
function updateSummary(){

if(!summaryEl) return

const avgPeak=totalEvents?(totalPeak/totalEvents):0

summaryEl.innerHTML=`
<h3>Summary</h3>
<p>Total Events: ${totalEvents}</p>
<p>Hard Brakes: ${hardEvents}</p>
<p>Average Peak: ${avgPeak.toFixed(2)} m/s²</p>
<p>Max Peak: ${maxPeak.toFixed(2)} m/s²</p>
`
}
