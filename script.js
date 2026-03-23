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

// ✅ เพิ่ม: current position + route
let currentMarker=null
let routePoints=[]
let routeLine=null

// ✅ เพิ่ม: เก็บตำแหน่งล่าสุด
let currentLat=13.7563
let currentLng=100.5018

// ✅ เพิ่ม: ทำ speed ให้ลื่นขึ้น
let smoothSpeed=0

// ✅ เพิ่ม: total distance / session / phone / voice
let totalDistance=0
let currentSessionId="-"
let phonePosition="handlebar"
let lastVoiceTime=0

// ================= SENSOR =================
let accelY=0
let smoothAccel=0

window.addEventListener("devicemotion",(e)=>{
  if(e.accelerationIncludingGravity){
    accelY=e.accelerationIncludingGravity.y||0
    // ✅ ปรับให้ไวขึ้นจากเดิม
    smoothAccel = smoothAccel*0.5 + accelY*0.5
  }
})

// ================= BUFFER =================
let decelBuffer=[]

function smoothValue(current,target,alpha=0.2){
  return current*(1-alpha)+target*alpha
}

function generateSessionId(){
  return "SESSION-" + new Date().toISOString().replace(/[:.]/g,"-")
}

function setPhonePosition(value){
  phonePosition=value
  let el=document.getElementById("phonePosText")
  if(el) el.innerText=value
}

function updateRecordingUI(isOn){
  const body=document.body
  const text=document.getElementById("recordText")

  if(isOn){
    body.classList.add("recording")
    if(text) text.innerText="RECORDING"
  }else{
    body.classList.remove("recording")
    if(text) text.innerText="IDLE"
  }
}

function updateSessionUI(){
  const sid=document.getElementById("sessionId")
  const dur=document.getElementById("duration")
  const dist=document.getElementById("distanceRide")

  if(sid) sid.innerText=currentSessionId
  if(dur && rideStartTime) dur.innerText=Math.floor((Date.now()-rideStartTime)/1000)
  if(dist) dist.innerText=totalDistance.toFixed(2)
}

function speak(text){
  const now=Date.now()
  if(now-lastVoiceTime<3000) return
  lastVoiceTime=now

  if("speechSynthesis" in window){
    const msg=new SpeechSynthesisUtterance(text)
    msg.lang="en-US"
    msg.rate=1
    msg.pitch=1
    speechSynthesis.speak(msg)
  }
}

// ================= REAL BRAKE LOGIC ADD =================
const BRAKE_THRESHOLD = 2.8
const HARD_BRAKE_THRESHOLD = 4.0
const MIN_SPEED_FOR_BRAKE = 15
const MIN_SPEED_DROP = 6
const BRAKE_WINDOW_MS = 1200
const POTHOLE_THRESHOLD = 4.5

let brakeFrames = 0
let hardBrakeFrames = 0
let brakeWindowStartSpeed = 0
let brakeWindowStartTime = 0
let brakeConfirmedType = null

function resetBrakeWindow(now,speed){
  brakeFrames = 0
  hardBrakeFrames = 0
  brakeWindowStartTime = now
  brakeWindowStartSpeed = speed
  brakeConfirmedType = null
}

// ================= INIT =================
window.onload=function(){

  chart=new Chart(document.getElementById("speedChart"),{
    type:"line",
    data:{labels:[],datasets:[{label:"Speed",data:[]}]},
    options:{
      responsive:true,
      animation:false
    }
  })

  decelChart=new Chart(document.getElementById("decelChart"),{
    type:"line",
    data:{labels:[],datasets:[{label:"Decel",data:[]}]},
    options:{
      responsive:true,
      animation:false
    }
  })

  map=L.map('map').setView([13.7563,100.5018],15)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

  // heatmap
  heatLayer = L.heatLayer(heatPoints,{radius:25,blur:15,maxZoom:17}).addTo(map)

  // route line
  routeLine = L.polyline(routePoints,{
    color:"#a5d8ff",
    weight:4,
    opacity:0.8
  }).addTo(map)

  // recover
  let saved=localStorage.getItem("moto_dataset")
  if(saved){
    dataset=JSON.parse(saved)
  }

  setPhonePosition(phonePosition)
  updateRecordingUI(false)
  updateSessionUI()
}

// ================= START =================
function startRide(){

  if(watching) return

  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    DeviceMotionEvent.requestPermission().catch(()=>{})
  }

  navigator.geolocation.getCurrentPosition((pos)=>{

    watching=true
    rideStartTime=Date.now()
    currentSessionId=generateSessionId()

    // reset ต่อรอบ
    lastSpeed=0
    lastTime=0
    peakDecel=0
    brakeStart=null
    brakeDistance=0
    totalDistance=0
    decelBuffer=[]
    smoothSpeed=0

    currentLat=pos.coords.latitude
    currentLng=pos.coords.longitude

    // ✅ reset brake logic
    resetBrakeWindow(Date.now(),0)

    // reset route
    routePoints=[]
    if(routeLine){
      routeLine.setLatLngs(routePoints)
    }

    updateRecordingUI(true)
    updateSessionUI()

    watchId=navigator.geolocation.watchPosition(
      updateSpeed,
      (err)=>{ console.error("GPS Error:", err) },
      {
        enableHighAccuracy:true,
        maximumAge:0,
        timeout:5000
      }
    )

  },(err)=>{
    console.error("Start location error:", err)
  },{
    enableHighAccuracy:true,
    maximumAge:0,
    timeout:5000
  })

}

// ================= STOP =================
function stopRide(){

  watching=false

  if(watchId!==null){
    navigator.geolocation.clearWatch(watchId)
    watchId=null
  }

  if(brakeStart!==null){
    logBrake(currentLat,currentLng)
    brakeStart=null
  }

  updateRecordingUI(false)
  updateSessionUI()
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

  currentLat=lat
  currentLng=lng

  if(map) map.panTo([lat,lng],{animate:true,duration:0.5})

  // current marker
  if(currentMarker){
    currentMarker.setLatLng([lat,lng])
  }else{
    currentMarker = L.circleMarker([lat,lng],{
      radius:8,
      color:"#4dabf7",
      fillColor:"#4dabf7",
      fillOpacity:0.9
    }).addTo(map).bindPopup("Current Position")
  }

  // route line
  routePoints.push([lat,lng])
  if(routeLine){
    routeLine.setLatLngs(routePoints)
  }

  let rawSpeed=(pos.coords.speed||0)*3.6
  if(rawSpeed < 1) rawSpeed = 0

  smoothSpeed = smoothValue(smoothSpeed, rawSpeed)
  document.getElementById("speed").innerText=smoothSpeed.toFixed(1)

  let speedEl=document.getElementById("speed")
  if(smoothSpeed > 80){
    speedEl.style.color="#ff6b6b"
  }
  else if(smoothSpeed > 40){
    speedEl.style.color="#ffd43b"
  }
  else{
    speedEl.style.color="#69f0ae"
  }

  let speed=rawSpeed
  let now=Date.now()

  if(lastTime){

    let dt=(now-lastTime)/1000
    if(dt===0)return

    let dv=speed-lastSpeed
    let acceleration = dv/dt

    // เพิ่มระยะทาง
    totalDistance += speed*dt/3600
    updateSessionUI()

    // SMART DECEL
    let sensorDecel = -smoothAccel
    let gpsDecel = -(dv/dt)
    let decel = Math.max(sensorDecel, gpsDecel)

    // FILTER พื้นฐาน
    if(speed < 8) {
      lastSpeed=speed
      lastTime=now
      return
    }

    if(Math.abs(sensorDecel) < 0.6 && Math.abs(gpsDecel) < 0.6){
      lastSpeed=speed
      lastTime=now
      return
    }

    decelBuffer.push(decel)
    if(decelBuffer.length > 4) decelBuffer.shift()
    decel = decelBuffer.reduce((a,b)=>a+b,0)/decelBuffer.length

    // ✅ pothole = spike สั้น + ความเร็วไม่ตกมาก
    let speedDropShort = Math.max(0, lastSpeed - speed)
    let isPothole = (
      Math.abs(accelY) > POTHOLE_THRESHOLD &&
      dt < 0.20 &&
      speed > 12 &&
      speedDropShort < 3
    )

    if(decel < 1.2 && !isPothole){
      lastSpeed=speed
      lastTime=now
      return
    }

    // LABEL เบื้องต้น
    let label="CRUISE"
    if(decel > HARD_BRAKE_THRESHOLD) label="HARD_BRAKE"
    else if(decel > BRAKE_THRESHOLD) label="BRAKE"
    else if(speed < 5) label="STOP"

    // PEAK
    if(decel>peakDecel) peakDecel=decel
    document.getElementById("peak").innerText=peakDecel.toFixed(2)

    // ================= REAL BRAKE DETECTION =================
    if(speed > MIN_SPEED_FOR_BRAKE){

      if(brakeWindowStartTime === 0){
        resetBrakeWindow(now, speed)
      }

      if((now - brakeWindowStartTime) > BRAKE_WINDOW_MS){
        resetBrakeWindow(now, speed)
      }

      if(decel > BRAKE_THRESHOLD){
        brakeFrames++
      }else{
        brakeFrames = Math.max(0, brakeFrames - 1)
      }

      if(decel > HARD_BRAKE_THRESHOLD){
        hardBrakeFrames++
      }else{
        hardBrakeFrames = Math.max(0, hardBrakeFrames - 1)
      }

      let speedDrop = Math.max(0, brakeWindowStartSpeed - speed)

      if(!isPothole){
        // เปิด brake phase เมื่อเริ่มมี decel ต่อเนื่อง
        if((brakeFrames >= 2 || hardBrakeFrames >= 2) && !brakeStart){
          brakeStart = now
          brakeDistance = 0
        }

        if(brakeStart){
          brakeDistance += speed*dt/3600
        }

        // confirm ประเภทเบรก
        if(hardBrakeFrames >= 2 && speedDrop >= (MIN_SPEED_DROP + 2)){
          brakeConfirmedType = "HARD"
        }else if(brakeFrames >= 2 && speedDrop >= MIN_SPEED_DROP){
          if(brakeConfirmedType !== "HARD"){
            brakeConfirmedType = "NORMAL"
          }
        }

        // จบ brake phase เมื่อ decel ลดลง
        if(brakeStart && decel < 1.5){
          if(brakeConfirmedType){
            logBrake(lat,lng,brakeConfirmedType)
          }
          brakeStart = null
          resetBrakeWindow(now, speed)
        }
      }

    }else{
      resetBrakeWindow(now, speed)
    }

    // POTHOLE
    if(isPothole){
      showPopup("🕳 POTHOLE","#845ef7")
      speak("Warning pothole detected")

      L.circleMarker([lat,lng],{
        color:"purple",
        radius:6
      }).addTo(map).bindPopup("POTHOLE")

      dataset.push({
        sessionId: currentSessionId,
        phonePosition: phonePosition,
        timestamp:now,
        event:"pothole",
        decel:decel,
        accelY:accelY,
        lat:lat,
        lng:lng,
        label:"POTHOLE"
      })
    }

    // CHART
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

    // DATASET
    dataset.push({
      sessionId: currentSessionId,
      phonePosition: phonePosition,
      timestamp: now,
      time: t,
      duration: ((now-rideStartTime)/1000),
      speed: speed,
      acceleration: acceleration,
      deceleration: decel,
      accelY: accelY,
      sensorDecel: sensorDecel,
      gpsDecel: gpsDecel,
      lat: lat,
      lng: lng,
      totalDistance: totalDistance,
      label: label
    })

  }

  lastSpeed=speed
  lastTime=now

}

// ================= BRAKE EVENT =================
function logBrake(lat,lng,forcedType=null){

  totalBrakes++

  let type="SLOW"
  let color="green"

  if(forcedType === "HARD"){
    type="HARD"
    color="red"
  }else if(forcedType === "NORMAL"){
    type="NORMAL"
    color="yellow"
  }else{
    if(peakDecel > HARD_BRAKE_THRESHOLD){
      type="HARD"
      color="red"
    }
    else if(peakDecel > BRAKE_THRESHOLD){
      type="NORMAL"
      color="yellow"
    }
  }

  if(type==="HARD"){
    hardBrakes++
    showPopup("🔴 HARD BRAKE","#ff4d4d")
    speak("Warning hard brake")
    triggerEffect("hard")
  }
  else if(type==="NORMAL"){
    normalBrakes++
    showPopup("🟡 NORMAL BRAKE","#ffd43b")
  }
  else{
    slowBrakes++
    showPopup("🟢 SLOW","#51cf66")
  }

  L.circleMarker([lat,lng],{
    color:color,
    radius:8
  }).addTo(map).bindPopup(type)

  if(type==="HARD"){
    heatPoints.push([lat,lng,1])
    heatLayer.setLatLngs(heatPoints)
  }

  let risk=100
  risk -= hardBrakes*12
  risk -= normalBrakes*6
  risk -= slowBrakes*2
  risk -= peakDecel*2

  if(risk<0) risk=0

  let riskEl=document.getElementById("risk")
  riskEl.innerText=Math.round(risk)

  riskEl.className=""
  if(risk>70) riskEl.classList.add("status-safe")
  else if(risk>40) riskEl.classList.add("status-warning")
  else riskEl.classList.add("status-danger")

  let style="SAFE"
  if(risk<70) style="NORMAL"
  if(risk<40) style="AGGRESSIVE"

  document.getElementById("style").innerText=style

  if(type==="HARD"){
    vibrate("hard")
  }else if(type==="NORMAL"){
    vibrate("normal")
  }

  dataset.push({
    sessionId: currentSessionId,
    phonePosition: phonePosition,
    timestamp: Date.now(),
    event:"brake",
    type:type,
    risk:risk,
    style:style,
    peakDecel:peakDecel,
    distance:brakeDistance,
    lat:lat,
    lng:lng,
    totalDistance: totalDistance,
    label:type
  })

  document.getElementById("total").innerText=totalBrakes
  document.getElementById("hard").innerText=hardBrakes
  document.getElementById("brakeDist").innerText=brakeDistance.toFixed(2)

  updateSummary()

  peakDecel=0
  brakeConfirmedType = null
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

  let csv="sessionId,phonePosition,timestamp,time,duration,speed,acceleration,deceleration,accelY,sensorDecel,gpsDecel,lat,lng,totalDistance,event,type,risk,style,peakDecel,distance,label\n"

  dataset.forEach(d=>{
    csv+=`${d.sessionId||""},${d.phonePosition||""},${d.timestamp||""},${d.time||""},${d.duration||""},${d.speed||""},${d.acceleration||""},${d.deceleration||""},${d.accelY||""},${d.sensorDecel||""},${d.gpsDecel||""},${d.lat||""},${d.lng||""},${d.totalDistance||""},${d.event||""},${d.type||""},${d.risk||""},${d.style||""},${d.peakDecel||""},${d.distance||""},${d.label||""}\n`
  })

  let blob=new Blob([csv])
  let a=document.createElement("a")
  a.href=URL.createObjectURL(blob)
  a.download="ride_full_ai_dataset.csv"
  a.click()

}

// ================= CLEAR =================
function clearData(){
  localStorage.removeItem("moto_dataset")
  location.reload()
}

// ================= ADD-ON =================
function markEvent(type){
  dataset.push({
    sessionId: currentSessionId,
    phonePosition: phonePosition,
    timestamp: Date.now(),
    manual:true,
    label:type
  })
  showPopup("Marked: "+type,"#339af0")
}

function triggerEffect(type){
  let body=document.body
  body.classList.add("shake")
  setTimeout(()=>body.classList.remove("shake"),300)
}

function vibrate(type){
  if(!navigator.vibrate) return

  if(type==="hard"){
    navigator.vibrate([100,50,100])
  }
  else if(type==="normal"){
    navigator.vibrate(100)
  }
}

setInterval(()=>{
  if(dataset.length>0){
    localStorage.setItem("moto_dataset",JSON.stringify(dataset))
  }
},5000)
