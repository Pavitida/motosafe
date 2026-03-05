let speed = 0
let gpsSpeed = 0
let peakDecel = 0
let duration = 0
let distance = 0

let running = false
let startTime = 0

let speeds=[]
let times=[]
let brakeEvents=[]

let hardBrakeCount=0
let normalBrakeCount=0
let slowCount=0

let lastAcc=0

const speedEl = document.getElementById("speed")
const peakEl = document.getElementById("peak")
const distanceEl = document.getElementById("distance")
const durationEl = document.getElementById("duration")

const brakeLog = document.getElementById("brakeLog")
const summary = document.getElementById("summary")
const riskScoreEl = document.getElementById("riskScore")

let ctx = document.getElementById("speedChart").getContext("2d")

let chart = new Chart(ctx,{
type:"line",
data:{
labels:[],
datasets:[
{
label:"Speed",
data:[],
borderColor:"blue",
borderWidth:3,
tension:0.3
},
{
label:"Hard Brake",
data:[],
borderColor:"red",
pointRadius:6,
showLine:false
}
]
}
})

async function startRide(){

if(running) return

if(typeof DeviceMotionEvent.requestPermission==="function"){
let permission = await DeviceMotionEvent.requestPermission()
if(permission!=="granted"){
alert("Sensor permission denied")
return
}
}

navigator.geolocation.watchPosition(updateGPS)

running=true
startTime=Date.now()

window.addEventListener("devicemotion",handleMotion)

}

function stopRide(){

running=false
window.removeEventListener("devicemotion",handleMotion)

summary.innerHTML=
`Ride Summary <br>
Hard Brake: ${hardBrakeCount} <br>
Normal Brake: ${normalBrakeCount} <br>
Slow Down: ${slowCount}`

calculateRisk()

}

function updateGPS(position){

let sp = position.coords.speed

if(sp!==null){

gpsSpeed = sp
speed = sp

let kmh = sp*3.6

speedEl.innerText = kmh.toFixed(1)

}

}

function handleMotion(event){

if(!running) return

let acc = event.accelerationIncludingGravity.y

let filtered = (acc + lastAcc)/2
lastAcc = filtered

let decel = -filtered

if(decel > peakDecel){
peakDecel = decel
peakEl.innerText = peakDecel.toFixed(2)
}

let now = Date.now()

duration = (now-startTime)/1000
durationEl.innerText = duration.toFixed(1)

// วิเคราะห์เบรค
detectBrake(decel)

speeds.push(speed*3.6)
times.push(duration)

chart.data.labels = times
chart.data.datasets[0].data = speeds
chart.update()

}

function detectBrake(decel){

if(speed < 1) return

// ชะลอ
if(decel > 0.5 && decel < 2){

slowCount++

}

// เบรคปกติ
else if(decel >=2 && decel <5){

normalBrakeCount++

logBrake("Normal Brake",decel)

}

// เบรคแรง
else if(decel >=5){

hardBrakeCount++

logBrake("HARD BRAKE",decel)

markHardBrake()

}

}

function logBrake(type,decel){

let time = new Date().toLocaleTimeString()

brakeLog.innerHTML +=
`<div>${time} | ${type} | ${decel.toFixed(2)} m/s²</div>`

brakeEvents.push({
time:time,
type:type,
force:decel
})

}

function markHardBrake(){

let data = new Array(times.length).fill(null)
data[data.length-1] = speed*3.6

chart.data.datasets[1].data = data
chart.update()

}

function calculateRisk(){

let score = 100

score -= hardBrakeCount * 10
score -= normalBrakeCount * 3

if(score <0) score = 0

riskScoreEl.innerText = score

}

function exportCSV(){

let csv="time,type,force\n"

brakeEvents.forEach(e=>{
csv += `${e.time},${e.type},${e.force}\n`
})

let blob = new Blob([csv],{type:"text/csv"})
let url = URL.createObjectURL(blob)

let a = document.createElement("a")
a.href=url
a.download="brake_data.csv"
a.click()

}

function clearData(){

brakeEvents=[]
brakeLog.innerHTML=""
riskScoreEl.innerText="0"

}
