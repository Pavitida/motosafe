let watching=false
let watchId=null

let lastSpeed=0
let lastTime=0

let peakDecel=0
let brakeStart=null
let brakeDistance=0

let totalBrakes=0
let hardBrakes=0

let dataset=[]

let chart
let decelChart

let map
let heatPoints=[]

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

function startRide(){

navigator.geolocation.getCurrentPosition(()=>{
watching=true
watchId=navigator.geolocation.watchPosition(updateSpeed)
})

}

function stopRide(){
watching=false
navigator.geolocation.clearWatch(watchId)
}

function showPopup(){
let p=document.getElementById("popup")
p.style.display="block"
setTimeout(()=>p.style.display="none",1500)
}

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
let dv=speed-lastSpeed
let decel=-(dv/dt)

if(decel>peakDecel) peakDecel=decel

document.getElementById("peak").innerText=peakDecel.toFixed(2)

// brake phase
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

// charts
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

dataset.push({time:t,speed,decel,lat,lng})

}

lastSpeed=speed
lastTime=now

}

function logBrake(lat,lng){

totalBrakes++

if(peakDecel>5){
hardBrakes++
showPopup()

L.marker([lat,lng]).addTo(map).bindPopup("Hard Brake")

heatPoints.push([lat,lng,1])
L.heatLayer(heatPoints,{radius:25}).addTo(map)
}

document.getElementById("total").innerText=totalBrakes
document.getElementById("hard").innerText=hardBrakes
document.getElementById("brakeDist").innerText=brakeDistance.toFixed(2)

// AI risk
let risk=100-(hardBrakes*10 + totalBrakes*2)
if(risk<0) risk=0
document.getElementById("risk").innerText=risk

updateSummary()

peakDecel=0

}

function updateSummary(){

let decels=dataset.map(d=>d.decel||0)

let avg=decels.reduce((a,b)=>a+b,0)/decels.length
let max=Math.max(...decels)

document.getElementById("avg").innerText=avg.toFixed(2)
document.getElementById("max").innerText=max.toFixed(2)

}

function exportCSV(){

let csv="time,speed,decel,lat,lng\n"

dataset.forEach(d=>{
csv+=`${d.time},${d.speed},${d.decel},${d.lat},${d.lng}\n`
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
