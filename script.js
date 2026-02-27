const startBtn = document.getElementById("startBtn");
const exportBtn = document.getElementById("exportBtn");

const speedSpan = document.getElementById("speed");
const decelSpan = document.getElementById("decel");
const distanceSpan = document.getElementById("distance");
const durationSpan = document.getElementById("duration");
const statusText = document.getElementById("status");

const canvas = document.getElementById("graph");
const ctx = canvas.getContext("2d");

let velocity = 0; // m/s
let lastTime = null;
let braking = false;
let brakeData = [];
let brakeStart = 0;
let logCount = 0;
let logs = [];

const threshold = -3;

startBtn.addEventListener("click", async()=>{

  if(typeof DeviceMotionEvent.requestPermission==="function"){
    const permission = await DeviceMotionEvent.requestPermission();
    if(permission!=="granted") return;
  }

  window.addEventListener("devicemotion",(event)=>{

    const acc = event.acceleration;
    if(!acc) return;

    const now = Date.now();
    if(!lastTime) lastTime = now;
    const dt = (now-lastTime)/1000;
    lastTime = now;

    const ay = acc.y || 0;

    velocity += ay * dt;   // v = v + at

    if(velocity<0) velocity=0;

    const speedKmh = velocity*3.6;

    speedSpan.textContent = speedKmh.toFixed(1);
    decelSpan.textContent = ay.toFixed(2);

    drawGraph(ay);

    if(ay<threshold && !braking){
      braking=true;
      brakeStart=now;
      brakeData=[];
      statusText.textContent="🚨 Braking";
      statusText.style.color="red";
    }

    if(braking){
      brakeData.push(ay);

      if(ay>-1){
        braking=false;
        analyzeBrake(brakeData, now-brakeStart, velocity);
      }
    }

  });
});

function analyzeBrake(data, duration, velocity){

  logCount++;

  const peak = Math.min(...data);
  const avgDecel = Math.abs(data.reduce((a,b)=>a+b)/data.length);

  const distance = (velocity*velocity)/(2*avgDecel);

  distanceSpan.textContent = distance.toFixed(2);
  durationSpan.textContent = duration;

  addLog(logCount, velocity*3.6, peak, distance, duration);

  logs.push([logCount,(velocity*3.6).toFixed(1),peak.toFixed(2),distance.toFixed(2),duration]);

  statusText.textContent="Brake Recorded";
  statusText.style.color="#22c55e";
}

function addLog(no,speed,peak,distance,duration){
  const row=document.createElement("tr");
  row.innerHTML=`
    <td>${no}</td>
    <td>${speed.toFixed?speed.toFixed(1):speed}</td>
    <td>${peak}</td>
    <td>${distance}</td>
    <td>${duration}</td>
  `;
  document.getElementById("logTable").prepend(row);
}

function drawGraph(value){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.beginPath();
  ctx.moveTo(0,canvas.height/2);
  ctx.lineTo(canvas.width,canvas.height/2 - value*10);
  ctx.strokeStyle="blue";
  ctx.stroke();
}

exportBtn.addEventListener("click",()=>{
  let csv="No,Speed,Peak,Distance,Duration\n";
  logs.forEach(l=>csv+=l.join(",")+"\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="motosafe_data.csv";
  a.click();
});
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("service-worker.js");
}