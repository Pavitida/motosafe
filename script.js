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

let decelBuffer=[]

// ================= INIT =================
window.onload=function(){
    chart=new Chart(document.getElementById("speedChart"),{
        type:"line",
        data:{labels:[],datasets:[{label:"Speed",data:[],borderColor:"#a5d8ff"}]}
    })
    decelChart=new Chart(document.getElementById("decelChart"),{
        type:"line",
        data:{labels:[],datasets:[{label:"Decel",data:[],borderColor:"#ffc9c9"}]}
    })
    map=L.map('map').setView([13.7563,100.5018],15)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    heatLayer = L.heatLayer(heatPoints,{radius:25}).addTo(map)
}

// ================= START =================
function startRide(){
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        DeviceMotionEvent.requestPermission().catch(console.error)
    }

    navigator.geolocation.getCurrentPosition((pos)=>{
        watching=true
        rideStartTime=Date.now()
        // เพิ่ม Options ให้ GPS แม่นและไวขึ้น
        watchId=navigator.geolocation.watchPosition(updateSpeed, (err)=>console.error(err), {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        })
        showPopup("STARTING... ✨", "#a5d8ff")
    }, (err)=> alert("กรุณาเปิด GPS ด้วยนะคะ!"))
}

function stopRide(){
    watching=false
    if(watchId) navigator.geolocation.clearWatch(watchId)
    showPopup("STOPPED", "#ff8787")
}

function showPopup(text,color){
    let p=document.getElementById("popup")
    if(!p) return
    p.innerText=text
    p.style.background=color
    p.style.display="block"
    setTimeout(()=>p.style.display="none",1500)
}

// ================= UPDATE (แก้จุดพังตรงนี้) =================
function updateSpeed(pos){
    if(!watching) return

    let lat=pos.coords.latitude
    let lng=pos.coords.longitude
    map.setView([lat,lng])

    let speed=(pos.coords.speed||0)*3.6
    let now=Date.now()

    document.getElementById("speed").innerText=speed.toFixed(1)

    if(lastTime){
        let dt=(now-lastTime)/1000
        if(dt <= 0) return // กันค่า dt พัง

        let dv=speed-lastSpeed
        let acceleration = dv/dt

        let sensorDecel = -smoothAccel
        let gpsDecel = -acceleration
        let decel = Math.max(sensorDecel, gpsDecel)

        // Filter: ถ้าความเร็วน้อยมาก ไม่ต้องคำนวณเบรก
        if(speed > 5) {
            decelBuffer.push(decel)
            if(decelBuffer.length > 5) decelBuffer.shift()
            let avgDecel = decelBuffer.reduce((a,b)=>a+b,0)/decelBuffer.length

            let isPothole = (decel > 6 && dt < 0.15)
            
            // PEAK
            if(decel > peakDecel) peakDecel = decel
            document.getElementById("peak").innerText = peakDecel.toFixed(2)

            // BRAKE LOGIC
            if(!isPothole){
                if(decel > 2){
                    if(!brakeStart){
                        brakeStart=now
                        brakeDistance=0
                    }
                    brakeDistance += speed * (dt/3600)
                } else if(brakeStart) {
                    logBrake(lat,lng)
                    brakeStart=null
                }
            } else {
                showPopup("🕳 POTHOLE","#845ef7")
            }

            // CHART UPDATE
            let t=new Date().toLocaleTimeString()
            chart.data.labels.push(t); chart.data.datasets[0].data.push(speed)
            decelChart.data.labels.push(t); decelChart.data.datasets[0].data.push(decel)
            if(chart.data.labels.length>20){
                chart.data.labels.shift(); chart.data.datasets[0].data.shift()
                decelChart.data.labels.shift(); decelChart.data.datasets[0].data.shift()
            }
            chart.update('none'); decelChart.update('none')
        }
    }
    // ย้ายมาไว้นอก if(lastTime) เพื่อให้อัปเดตค่าเสมอ
    lastSpeed=speed
    lastTime=now
}

// ================= BRAKE EVENT & OTHERS =================
function logBrake(lat,lng){
    totalBrakes++
    let type="SLOW", color="green"
    if(peakDecel > 5){
        type="HARD"; color="red"; hardBrakes++; showPopup("🔴 HARD BRAKE","#ff4d4d")
        if(navigator.vibrate) navigator.vibrate([100,50,100])
    } else if(peakDecel > 2){
        type="NORMAL"; color="yellow"; normalBrakes++; showPopup("🟡 NORMAL BRAKE","#ffd43b")
        if(navigator.vibrate) navigator.vibrate(100)
    } else { slowBrakes++ }

    L.circleMarker([lat,lng],{color:color,radius:8}).addTo(map).bindPopup(type)
    if(type==="HARD"){ heatPoints.push([lat,lng,1]); heatLayer.setLatLngs(heatPoints) }

    let risk = Math.max(0, 100 - (hardBrakes*12) - (normalBrakes*6) - (peakDecel*2))
    document.getElementById("risk").innerText = Math.round(risk)
    document.getElementById("total").innerText = totalBrakes
    document.getElementById("hard").innerText = hardBrakes
    document.getElementById("brakeDist").innerText = brakeDistance.toFixed(2)
    
    peakDecel=0 
    updateSummary()
}

function updateSummary(){
    let decels = dataset.map(d=>d.deceleration||0).filter(v=>v>0)
    document.getElementById("avg").innerText=(decels.reduce((a,b)=>a+b,0)/decels.length || 0).toFixed(2)
    document.getElementById("max").innerText=Math.max(...decels,0).toFixed(2)
}

function exportCSV(){ /* เหมือนเดิม */ }
function clearData(){ localStorage.removeItem("moto_dataset"); location.reload(); }

// ================= AUTO SAVE =================
setInterval(()=>{ if(dataset.length > 0) localStorage.setItem("moto_dataset", JSON.stringify(dataset)) },5000)
