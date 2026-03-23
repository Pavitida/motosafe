// ================= CORE STATE =================
let watching = false
let watchId = null

let lastSpeed = 0
let lastTime = 0

let peakDecel = 0
let brakeStart = null
let brakeDistance = 0

let totalBrakes = 0
let hardBrakes = 0
let normalBrakes = 0
let slowBrakes = 0

let dataset = []

let chart
let decelChart

let map
let heatPoints = []
let heatLayer = null

let rideStartTime = null

// ================= MAP / ROUTE =================
let currentMarker = null
let routePoints = []
let routeLine = null

let currentLat = 13.7563
let currentLng = 100.5018

// ================= UI / SESSION =================
let smoothSpeed = 0
let totalDistance = 0
let currentSessionId = "-"
let phonePosition = "handlebar"
let lastVoiceTime = 0

// ================= SENSOR =================
let accelY = 0
let smoothAccel = 0

window.addEventListener("devicemotion", (e) => {
  if (e.accelerationIncludingGravity) {
    accelY = e.accelerationIncludingGravity.y || 0
    smoothAccel = smoothAccel * 0.5 + accelY * 0.5
  }
})

// ================= TUNING =================
// เบรกจริง
const BRAKE_THRESHOLD = 2.8
const HARD_BRAKE_THRESHOLD = 4.0
const MIN_SPEED_FOR_BRAKE = 15
const MIN_SPEED_DROP = 6
const BRAKE_WINDOW_MS = 1200

// ถนนขรุขระ / หลุม
const MIN_SPEED_FOR_ROAD_EVENT = 10
const ROUGH_ROAD_ACCEL_THRESHOLD = 2.8
const POTHOLE_THRESHOLD = 4.2
const ROAD_EVENT_MAX_DT = 0.25
const POTHOLE_MAX_SPEED_DROP = 3
const ROUGH_ROAD_REPEAT_MS = 1800

let lastRoadEventTime = 0

// risk zone
const ALERT_RADIUS_METERS = 60
const ZONE_MERGE_METERS = 35

// ================= BRAKE WINDOW =================
let brakeFrames = 0
let hardBrakeFrames = 0
let brakeWindowStartSpeed = 0
let brakeWindowStartTime = 0
let brakeConfirmedType = null

function resetBrakeWindow(now, speed) {
  brakeFrames = 0
  hardBrakeFrames = 0
  brakeWindowStartTime = now
  brakeWindowStartSpeed = speed
  brakeConfirmedType = null
}

// ================= DANGER ZONES =================
let dangerZones = []
let alertedZones = new Set()
let dangerZoneMarkers = []

function loadDangerZones() {
  const saved = localStorage.getItem("moto_danger_zones")
  if (saved) {
    dangerZones = JSON.parse(saved)
  }
}

function saveDangerZones() {
  localStorage.setItem("moto_danger_zones", JSON.stringify(dangerZones))
}

function toRad(deg) {
  return deg * Math.PI / 180
}

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function clearDangerZoneMarkers() {
  if (!map) return
  dangerZoneMarkers.forEach((m) => map.removeLayer(m))
  dangerZoneMarkers = []
}

function renderDangerZones() {
  if (!map) return

  clearDangerZoneMarkers()

  dangerZones.forEach((z) => {
    let color = "orange"
    let label = "Risk Zone"

    if (z.type === "HARD_BRAKE") {
      color = "red"
      label = "Risk Zone"
    } else if (z.type === "ROUGH_ROAD") {
      color = "purple"
      label = "Rough Road Zone"
    } else if (z.type === "ROAD_WORK") {
      color = "#f59f00"
      label = "Possible Road Work Area"
    } else if (z.type === "POTHOLE") {
      color = "#845ef7"
      label = "Pothole Zone"
    }

    const marker = L.circle([z.lat, z.lng], {
      radius: 25,
      color: color,
      fillColor: color,
      fillOpacity: 0.18,
      weight: 2
    })
      .addTo(map)
      .bindPopup(`${label}<br>Count: ${z.count}`)

    dangerZoneMarkers.push(marker)
  })
}

function addDangerZone(lat, lng, type) {
  let found = false

  for (let i = 0; i < dangerZones.length; i++) {
    const z = dangerZones[i]
    const dist = getDistanceMeters(lat, lng, z.lat, z.lng)

    if (dist <= ZONE_MERGE_METERS) {
      z.count += 1
      z.lat = (z.lat + lat) / 2
      z.lng = (z.lng + lng) / 2
      z.updatedAt = Date.now()

      if (type === "HARD_BRAKE") z.hardBrakeCount = (z.hardBrakeCount || 0) + 1
      if (type === "POTHOLE") z.potholeCount = (z.potholeCount || 0) + 1
      if (type === "ROUGH_ROAD") z.roughRoadCount = (z.roughRoadCount || 0) + 1

      const hardCount = z.hardBrakeCount || 0
      const potholeCount = z.potholeCount || 0
      const roughCount = z.roughRoadCount || 0

      if (potholeCount + roughCount >= 6) {
        z.type = "ROAD_WORK"
      } else if (potholeCount >= 2 || roughCount >= 3) {
        z.type = "ROUGH_ROAD"
      } else if (hardCount >= 2) {
        z.type = "HARD_BRAKE"
      } else {
        z.type = type
      }

      found = true
      break
    }
  }

  if (!found) {
    dangerZones.push({
      id: "zone_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      lat,
      lng,
      type,
      count: 1,
      hardBrakeCount: type === "HARD_BRAKE" ? 1 : 0,
      potholeCount: type === "POTHOLE" ? 1 : 0,
      roughRoadCount: type === "ROUGH_ROAD" ? 1 : 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
  }

  saveDangerZones()
  renderDangerZones()
}

function addPotholeZone(lat, lng) {
  addDangerZone(lat, lng, "POTHOLE")
}

function addRoughRoadZone(lat, lng) {
  addDangerZone(lat, lng, "ROUGH_ROAD")
}

function checkNearbyDangerZones(lat, lng) {
  for (let i = 0; i < dangerZones.length; i++) {
    const z = dangerZones[i]
    const dist = getDistanceMeters(lat, lng, z.lat, z.lng)

    if (dist <= ALERT_RADIUS_METERS) {
      if (!alertedZones.has(z.id)) {
        alertedZones.add(z.id)

        if (z.type === "HARD_BRAKE") {
          showPopup("⚠️ Approaching Risk Zone", "#ff6b6b")
          speak("Warning approaching risk zone")
          vibrate("hard")
        } else if (z.type === "ROUGH_ROAD") {
          showPopup("⚠️ Rough Road Ahead", "#845ef7")
          speak("Warning rough road ahead")
          vibrate("normal")
        } else if (z.type === "ROAD_WORK") {
          showPopup("🚧 Possible Road Work Area", "#f59f00")
          speak("Warning possible road work area")
          vibrate("normal")
        } else if (z.type === "POTHOLE") {
          showPopup("⚠️ Approaching Pothole Zone", "#845ef7")
          speak("Warning approaching pothole zone")
          vibrate("normal")
        }
      }
    } else if (dist > ALERT_RADIUS_METERS + 20) {
      alertedZones.delete(z.id)
    }
  }
}

// ================= HELPERS =================
let decelBuffer = []

function smoothValue(current, target, alpha = 0.2) {
  return current * (1 - alpha) + target * alpha
}

function generateSessionId() {
  return "SESSION-" + new Date().toISOString().replace(/[:.]/g, "-")
}

function setPhonePosition(value) {
  phonePosition = value
  const el = document.getElementById("phonePosText")
  if (el) el.innerText = value
}

function updateRecordingUI(isOn) {
  const body = document.body
  const text = document.getElementById("recordText")

  if (isOn) {
    body.classList.add("recording")
    if (text) text.innerText = "RECORDING"
  } else {
    body.classList.remove("recording")
    if (text) text.innerText = "IDLE"
  }
}

function updateSessionUI() {
  const sid = document.getElementById("sessionId")
  const dur = document.getElementById("duration")
  const dist = document.getElementById("distanceRide")

  if (sid) sid.innerText = currentSessionId
  if (dur && rideStartTime) dur.innerText = Math.floor((Date.now() - rideStartTime) / 1000)
  if (dist) dist.innerText = totalDistance.toFixed(2)
}

function speak(text) {
  const now = Date.now()
  if (now - lastVoiceTime < 3000) return
  lastVoiceTime = now

  if ("speechSynthesis" in window) {
    try {
      speechSynthesis.cancel()
      const msg = new SpeechSynthesisUtterance(text)
      msg.lang = "en-US"
      msg.rate = 1
      msg.pitch = 1
      speechSynthesis.speak(msg)
    } catch (e) {
      console.log("Speech error:", e)
    }
  }
}

function showPopup(text, color) {
  const p = document.getElementById("popup")
  if (!p) return
  p.innerText = text
  p.style.background = color
  p.style.display = "block"
  setTimeout(() => {
    p.style.display = "none"
  }, 1500)
}

function triggerEffect() {
  document.body.classList.add("shake")
  setTimeout(() => document.body.classList.remove("shake"), 300)
}

function vibrate(type) {
  if (!navigator.vibrate) return
  if (type === "hard") {
    navigator.vibrate([100, 50, 100])
  } else if (type === "normal") {
    navigator.vibrate(100)
  }
}

function logLatency(tag, startTime) {
  const latency = Date.now() - startTime
  console.log(`${tag} latency: ${latency} ms`)
}

// ================= INIT =================
window.onload = function () {
  chart = new Chart(document.getElementById("speedChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [{ label: "Speed", data: [] }]
    },
    options: {
      responsive: true,
      animation: false
    }
  })

  decelChart = new Chart(document.getElementById("decelChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [{ label: "Decel", data: [] }]
    },
    options: {
      responsive: true,
      animation: false
    }
  })

  map = L.map("map").setView([13.7563, 100.5018], 15)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map)

  heatLayer = L.heatLayer(heatPoints, { radius: 25, blur: 15, maxZoom: 17 }).addTo(map)

  routeLine = L.polyline(routePoints, {
    color: "#a5d8ff",
    weight: 4,
    opacity: 0.8
  }).addTo(map)

  const saved = localStorage.getItem("moto_dataset")
  if (saved) {
    dataset = JSON.parse(saved)
  }

  loadDangerZones()
  renderDangerZones()
  setPhonePosition(phonePosition)
  updateRecordingUI(false)
  updateSessionUI()
}

// ================= START =================
function startRide() {
  if (watching) return

  if (
    typeof DeviceMotionEvent !== "undefined" &&
    typeof DeviceMotionEvent.requestPermission === "function"
  ) {
    DeviceMotionEvent.requestPermission().catch(() => {})
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      watching = true
      rideStartTime = Date.now()
      currentSessionId = generateSessionId()

      lastSpeed = 0
      lastTime = 0
      peakDecel = 0
      brakeStart = null
      brakeDistance = 0
      totalDistance = 0
      decelBuffer = []
      smoothSpeed = 0
      lastRoadEventTime = 0

      currentLat = pos.coords.latitude
      currentLng = pos.coords.longitude

      resetBrakeWindow(Date.now(), 0)

      routePoints = []
      if (routeLine) routeLine.setLatLngs(routePoints)

      updateRecordingUI(true)
      updateSessionUI()

      watchId = navigator.geolocation.watchPosition(
        updateSpeed,
        (err) => {
          console.error("GPS Error:", err)
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000
        }
      )
    },
    (err) => {
      console.error("Start location error:", err)
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    }
  )
}

// ================= STOP =================
function stopRide() {
  watching = false

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }

  if (brakeStart !== null) {
    logBrake(currentLat, currentLng, brakeConfirmedType || "NORMAL")
    brakeStart = null
  }

  updateRecordingUI(false)
  updateSessionUI()
}

// ================= ROAD CLASSIFIER =================
function classifyRoadEvent(speed, dt, decel, speedDropShort) {
  if (speed < MIN_SPEED_FOR_ROAD_EVENT) return { isPothole: false, isRoughRoad: false }

  const accelAbs = Math.abs(accelY)

  const isPothole =
    accelAbs > POTHOLE_THRESHOLD &&
    dt < ROAD_EVENT_MAX_DT &&
    speedDropShort < POTHOLE_MAX_SPEED_DROP

  const isRoughRoad =
    !isPothole &&
    accelAbs > ROUGH_ROAD_ACCEL_THRESHOLD &&
    dt < ROAD_EVENT_MAX_DT &&
    decel > 1.0 &&
    speedDropShort < 2.5

  return { isPothole, isRoughRoad }
}

// ================= UPDATE =================
function updateSpeed(pos) {
  const startTime = Date.now()
  if (!watching) return

  const lat = pos.coords.latitude
  const lng = pos.coords.longitude

  currentLat = lat
  currentLng = lng

  if (map) map.panTo([lat, lng], { animate: true, duration: 0.5 })

  checkNearbyDangerZones(lat, lng)

  if (currentMarker) {
    currentMarker.setLatLng([lat, lng])
  } else {
    currentMarker = L.circleMarker([lat, lng], {
      radius: 8,
      color: "#4dabf7",
      fillColor: "#4dabf7",
      fillOpacity: 0.9
    })
      .addTo(map)
      .bindPopup("Current Position")
  }

  routePoints.push([lat, lng])
  if (routeLine) routeLine.setLatLngs(routePoints)

  let rawSpeed = (pos.coords.speed || 0) * 3.6
  if (rawSpeed < 1) rawSpeed = 0

  smoothSpeed = smoothValue(smoothSpeed, rawSpeed)
  document.getElementById("speed").innerText = smoothSpeed.toFixed(1)

  const speedEl = document.getElementById("speed")
  if (smoothSpeed > 80) {
    speedEl.style.color = "#ff6b6b"
  } else if (smoothSpeed > 40) {
    speedEl.style.color = "#ffd43b"
  } else {
    speedEl.style.color = "#69f0ae"
  }

  const speed = rawSpeed
  const now = Date.now()

  if (lastTime) {
    const dt = (now - lastTime) / 1000
    if (dt === 0) return

    const dv = speed - lastSpeed
    const acceleration = dv / dt

    totalDistance += speed * dt / 3600
    updateSessionUI()

    const sensorDecel = -smoothAccel
    const gpsDecel = -(dv / dt)
    let decel = Math.max(sensorDecel, gpsDecel)

    if (speed < 8) {
      lastSpeed = speed
      lastTime = now
      logLatency("updateSpeed", startTime)
      return
    }

    if (Math.abs(sensorDecel) < 0.6 && Math.abs(gpsDecel) < 0.6) {
      lastSpeed = speed
      lastTime = now
      logLatency("updateSpeed", startTime)
      return
    }

    decelBuffer.push(decel)
    if (decelBuffer.length > 4) decelBuffer.shift()
    decel = decelBuffer.reduce((a, b) => a + b, 0) / decelBuffer.length

    const speedDropShort = Math.max(0, lastSpeed - speed)
    const roadEvent = classifyRoadEvent(speed, dt, decel, speedDropShort)
    const isPothole = roadEvent.isPothole
    const isRoughRoad = roadEvent.isRoughRoad

    if (decel < 1.0 && !isPothole && !isRoughRoad) {
      lastSpeed = speed
      lastTime = now
      logLatency("updateSpeed", startTime)
      return
    }

    let label = "CRUISE"
    if (isPothole) label = "POTHOLE"
    else if (isRoughRoad) label = "ROUGH_ROAD"
    else if (decel > HARD_BRAKE_THRESHOLD) label = "HARD_BRAKE"
    else if (decel > BRAKE_THRESHOLD) label = "BRAKE"
    else if (speed < 5) label = "STOP"

    if (decel > peakDecel) peakDecel = decel
    document.getElementById("peak").innerText = peakDecel.toFixed(2)

    // ================= REAL BRAKE DETECTION =================
    if (speed > MIN_SPEED_FOR_BRAKE) {
      if (brakeWindowStartTime === 0) {
        resetBrakeWindow(now, speed)
      }

      if (now - brakeWindowStartTime > BRAKE_WINDOW_MS) {
        resetBrakeWindow(now, speed)
      }

      if (decel > BRAKE_THRESHOLD) {
        brakeFrames++
      } else {
        brakeFrames = Math.max(0, brakeFrames - 1)
      }

      if (decel > HARD_BRAKE_THRESHOLD) {
        hardBrakeFrames++
      } else {
        hardBrakeFrames = Math.max(0, hardBrakeFrames - 1)
      }

      const speedDrop = Math.max(0, brakeWindowStartSpeed - speed)

      if (!isPothole && !isRoughRoad) {
        if ((brakeFrames >= 2 || hardBrakeFrames >= 2) && !brakeStart) {
          brakeStart = now
          brakeDistance = 0
        }

        if (brakeStart) {
          brakeDistance += speed * dt / 3600
        }

        if (hardBrakeFrames >= 2 && speedDrop >= MIN_SPEED_DROP + 2) {
          brakeConfirmedType = "HARD"
        } else if (brakeFrames >= 2 && speedDrop >= MIN_SPEED_DROP) {
          if (brakeConfirmedType !== "HARD") brakeConfirmedType = "NORMAL"
        }

        if (brakeStart && decel < 1.5) {
          if (brakeConfirmedType) {
            logBrake(lat, lng, brakeConfirmedType)
          }
          brakeStart = null
          resetBrakeWindow(now, speed)
        }
      }
    } else {
      resetBrakeWindow(now, speed)
    }

    // ================= POTHOLE =================
    if (isPothole && now - lastRoadEventTime > 800) {
      lastRoadEventTime = now

      showPopup("🕳 POTHOLE", "#845ef7")
      speak("Warning pothole detected")
      addPotholeZone(lat, lng)

      L.circleMarker([lat, lng], {
        color: "purple",
        radius: 6
      })
        .addTo(map)
        .bindPopup("POTHOLE")

      dataset.push({
        sessionId: currentSessionId,
        phonePosition: phonePosition,
        timestamp: now,
        event: "pothole",
        decel: decel,
        accelY: accelY,
        lat: lat,
        lng: lng,
        label: "POTHOLE"
      })
    }

    // ================= ROUGH ROAD =================
    if (isRoughRoad && now - lastRoadEventTime > ROUGH_ROAD_REPEAT_MS) {
      lastRoadEventTime = now

      showPopup("⚠️ ROUGH ROAD", "#6f42c1")
      speak("Warning rough road ahead")
      addRoughRoadZone(lat, lng)

      L.circleMarker([lat, lng], {
        color: "#6f42c1",
        radius: 5
      })
        .addTo(map)
        .bindPopup("ROUGH ROAD")

      dataset.push({
        sessionId: currentSessionId,
        phonePosition: phonePosition,
        timestamp: now,
        event: "rough_road",
        decel: decel,
        accelY: accelY,
        lat: lat,
        lng: lng,
        label: "ROUGH_ROAD"
      })
    }

    // ================= CHART =================
    const t = new Date().toLocaleTimeString()

    chart.data.labels.push(t)
    chart.data.datasets[0].data.push(speed)

    decelChart.data.labels.push(t)
    decelChart.data.datasets[0].data.push(decel)

    if (chart.data.labels.length > 20) {
      chart.data.labels.shift()
      chart.data.datasets[0].data.shift()
      decelChart.data.labels.shift()
      decelChart.data.datasets[0].data.shift()
    }

    chart.update()
    decelChart.update()

    // ================= DATASET =================
    dataset.push({
      sessionId: currentSessionId,
      phonePosition: phonePosition,
      timestamp: now,
      time: t,
      duration: (now - rideStartTime) / 1000,
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

  lastSpeed = speed
  lastTime = now
  logLatency("updateSpeed", startTime)
}

// ================= BRAKE EVENT =================
function logBrake(lat, lng, forcedType = null) {
  totalBrakes++

  let type = "SLOW"
  let color = "green"

  if (forcedType === "HARD") {
    type = "HARD"
    color = "red"
  } else if (forcedType === "NORMAL") {
    type = "NORMAL"
    color = "yellow"
  } else {
    if (peakDecel > HARD_BRAKE_THRESHOLD) {
      type = "HARD"
      color = "red"
    } else if (peakDecel > BRAKE_THRESHOLD) {
      type = "NORMAL"
      color = "yellow"
    }
  }

  if (type === "HARD") {
    hardBrakes++
    showPopup("🔴 HARD BRAKE", "#ff4d4d")
    speak("Warning hard brake")
    triggerEffect()
    addDangerZone(lat, lng, "HARD_BRAKE")
  } else if (type === "NORMAL") {
    normalBrakes++
    showPopup("🟡 NORMAL BRAKE", "#ffd43b")
  } else {
    slowBrakes++
    showPopup("🟢 SLOW", "#51cf66")
  }

  L.circleMarker([lat, lng], {
    color: color,
    radius: 8
  })
    .addTo(map)
    .bindPopup(type)

  if (type === "HARD") {
    heatPoints.push([lat, lng, 1])
    heatLayer.setLatLngs(heatPoints)
  }

  let risk = 100
  risk -= hardBrakes * 12
  risk -= normalBrakes * 6
  risk -= slowBrakes * 2
  risk -= peakDecel * 2

  if (risk < 0) risk = 0

  const riskEl = document.getElementById("risk")
  riskEl.innerText = Math.round(risk)

  riskEl.className = ""
  if (risk > 70) riskEl.classList.add("status-safe")
  else if (risk > 40) riskEl.classList.add("status-warning")
  else riskEl.classList.add("status-danger")

  let style = "SAFE"
  if (risk < 70) style = "NORMAL"
  if (risk < 40) style = "AGGRESSIVE"

  document.getElementById("style").innerText = style

  if (type === "HARD") {
    vibrate("hard")
  } else if (type === "NORMAL") {
    vibrate("normal")
  }

  dataset.push({
    sessionId: currentSessionId,
    phonePosition: phonePosition,
    timestamp: Date.now(),
    event: "brake",
    type: type,
    risk: risk,
    style: style,
    peakDecel: peakDecel,
    distance: brakeDistance,
    lat: lat,
    lng: lng,
    totalDistance: totalDistance,
    label: type
  })

  document.getElementById("total").innerText = totalBrakes
  document.getElementById("hard").innerText = hardBrakes
  document.getElementById("brakeDist").innerText = brakeDistance.toFixed(2)

  updateSummary()

  peakDecel = 0
  brakeConfirmedType = null
}

// ================= SUMMARY =================
function updateSummary() {
  const decels = dataset.map((d) => d.deceleration || 0).filter((v) => v > 0)

  const avg = decels.reduce((a, b) => a + b, 0) / decels.length || 0
  const max = Math.max(...decels, 0)

  document.getElementById("avg").innerText = avg.toFixed(2)
  document.getElementById("max").innerText = max.toFixed(2)
}

// ================= CSV =================
function exportCSV() {
  let csv =
    "sessionId,phonePosition,timestamp,time,duration,speed,acceleration,deceleration,accelY,sensorDecel,gpsDecel,lat,lng,totalDistance,event,type,risk,style,peakDecel,distance,label\n"

  dataset.forEach((d) => {
    csv += `${d.sessionId || ""},${d.phonePosition || ""},${d.timestamp || ""},${d.time || ""},${d.duration || ""},${d.speed || ""},${d.acceleration || ""},${d.deceleration || ""},${d.accelY || ""},${d.sensorDecel || ""},${d.gpsDecel || ""},${d.lat || ""},${d.lng || ""},${d.totalDistance || ""},${d.event || ""},${d.type || ""},${d.risk || ""},${d.style || ""},${d.peakDecel || ""},${d.distance || ""},${d.label || ""}\n`
  })

  const blob = new Blob([csv])
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = "ride_full_ai_dataset.csv"
  a.click()
}

// ================= CLEAR =================
function clearData() {
  localStorage.removeItem("moto_dataset")
  localStorage.removeItem("moto_danger_zones")
  location.reload()
}

// ================= OPTIONAL MANUAL MARK =================
function markEvent(type) {
  dataset.push({
    sessionId: currentSessionId,
    phonePosition: phonePosition,
    timestamp: Date.now(),
    manual: true,
    label: type
  })
  showPopup("Marked: " + type, "#339af0")
}

// ================= AUTO SAVE =================
setInterval(() => {
  if (dataset.length > 0) {
    localStorage.setItem("moto_dataset", JSON.stringify(dataset))
  }
}, 5000)
