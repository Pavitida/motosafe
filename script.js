let speed = 0
let lastSpeed = 0
let lastTime = Date.now()

let hardBrakeCount = 0
let normalBrakeCount = 0
let slowDownCount = 0

let tracking = false

let speedData = []
let timeData = []

const ctx = document.getElementById("speedChart").getContext("2d")

const chart = new Chart(ctx,{
type:'line',
data:{
labels:timeData,
datasets:[{
label:'Speed (km/h)',
data:speedData,
borderWidth:3,
tension:0.3
}]
},
options:{
responsive:true,
plugins:{
legend:{display:false}
},
scales:{
y:{
beginAtZero:true
}
}
}
})

function startTracking(){

tracking = true

navigator.geolocation.watchPosition(function(position){

if(!tracking) return

let gpsSpeed = position.coords.speed

if(gpsSpeed == null) return

speed = gpsSpeed * 3.6

document.getElementById("speed").innerText = speed.toFixed(1)

detectBrake(speed)

updateGraph(speed)

},{
enableHighAccuracy:true
})

}

function stopTracking(){
tracking = false
}

function detectBrake(currentSpeed){

let now = Date.now()
let dt = (now-lastTime)/1000

if(dt <= 0) return

let accel = (currentSpeed-lastSpeed)/dt
let decel = -accel

/* ignore noise */
if(Math.abs(decel) < 0.5){
lastSpeed = currentSpeed
lastTime = now
return
}

/* HARD BRAKE */
if(decel > 6){
hardBrakeCount++
}

/* NORMAL BRAKE */
else if(decel > 3){
normalBrakeCount++
}

/* SLOW DOWN */
else if(decel > 1){
slowDownCount++
}

updateBrakeUI()

lastSpeed = currentSpeed
lastTime = now

}

function updateBrakeUI(){

document.getElementById("hardBrake").innerText = hardBrakeCount
document.getElementById("normalBrake").innerText = normalBrakeCount
document.getElementById("slowDown").innerText = slowDownCount

let total = hardBrakeCount + normalBrakeCount + slowDownCount

document.getElementById("totalBrakes").innerText = total

if(total>0){

let ratio = (hardBrakeCount/total)*100

document.getElementById("hardBrakeRatio").innerText = ratio.toFixed(1)+"%"

if(ratio < 20)
document.getElementById("riskLevel").innerText = "SAFE"

else if(ratio < 40)
document.getElementById("riskLevel").innerText = "MEDIUM"

else
document.getElementById("riskLevel").innerText = "RISKY"

}

}

function updateGraph(speed){

let time = new Date().toLocaleTimeString()

timeData.push(time)
speedData.push(speed)

if(timeData.length > 20){
timeData.shift()
speedData.shift()
}

chart.update()

}
