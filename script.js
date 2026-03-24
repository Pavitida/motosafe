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

let lastAlertLatencyMs = 0
let activeAlertCount = 0
let lastAlertType = "None"

// ================= SENSOR =================
let accelY = 0
let smoothAccel = 0

window.addEventListener("devicemotion", (e) => {
  if (e.accelerationIncludingGravity) {
    accelY = e.accelerationIncludingGravity.y || 0
    smoothAccel = smoothAccel * 0.45 + accelY * 0.55
  }
})

// ================= TUNING =================
const BRAKE_THRESHOLD = 2.2
const HARD_BRAKE_THRESHOLD = 3.8
const SLOW_BRAKE_THRESHOLD = 1.2

const MIN_SPEED_FOR_BRAKE = 10
const MIN_SPEED_DROP = 3.5
const HARD_MIN_SPEED_DROP = 5.5
const BRAKE_WINDOW_MS = 900

const MIN_SPEED_FOR_ROAD_EVENT = 8
const ROUGH_ROAD_ACCEL_THRESHOLD = 2.8
const POTHOLE_THRESHOLD = 4.2
const ROAD_EVENT_MAX_DT = 0.25
const POTHOLE_MAX_SPEED_DROP = 2.8
const ROUGH_ROAD_REPEAT_MS = 1800

let lastRoadEventTime = 0

const ALERT_RADIUS_METERS = 60
const ZONE_MERGE_METERS = 35

// ================= BRAKE WINDOW =================
let brakeFrames = 0
let hardBrakeFrames = 0
let brakeWindowStartSpeed = 0
let brakeWindowStartTime = 0
let brakeConfirmedType = null
let brakeLiveShown = false

function resetBrakeWindow(now, speed) {
  brakeFrames = 0
  hardBrakeFrames = 0
  brakeWindowStartTime = now
  brakeWindowStartSpeed = speed
  brakeConfirmedType = null
  brakeLiveShown = false
}

// ================= SOUND FX =================
let audioCtx = null
let audioReady = false
let lastSfxTime = 0

function initSound() {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) return
      audioCtx = new AudioContextClass()
    }

    if (audioCtx.state === "suspended") {
      audioCtx.resume()
    }

    audioReady = true
  } catch (e) {
    console.log("Audio init error:", e)
  }
}

function playTone(freq = 880, duration = 0.12, type = "sine", volume = 0.03, startDelay = 0) {
  if (!audioReady || !audioCtx) return

  const now = audioCtx.currentTime + startDelay
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, now)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  osc.connect(gain)
  gain.connect(audioCtx.destination)

  osc.start(now)
  osc.stop(now + duration + 0.03)
}

function playChime(kind = "start") {
  const now = Date.now()
  if (now - lastSfxTime < 250) return
  lastSfxTime = now

  if (!audioReady) return

  if (kind === "start") {
    playTone(740, 0.10, "sine", 0.025, 0.00)
    playTone(988, 0.12, "sine", 0.020, 0.08)
    playTone(1318, 0.14, "triangle", 0.016, 0.16)
  } else if (kind === "alert") {
    playTone(880, 0.10, "triangle", 0.028, 0.00)
    playTone(660, 0.12, "triangle", 0.022, 0.08)
  } else if (kind === "soft-alert") {
    playTone(1046, 0.08, "sine", 0.018, 0.00)
    playTone(1244, 0.09, "sine", 0.014, 0.06)
  } else if (kind === "export") {
    playTone(784, 0.08, "sine", 0.020, 0.00)
    playTone(1174, 0.10, "triangle", 0.016, 0.07)
  }
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
  updateASummary()
}

function addPotholeZone(lat, lng) {
  addDangerZone(lat, lng, "POTHOLE")
}

function addRoughRoadZone(lat, lng) {
  addDangerZone(lat, lng, "ROUGH_ROAD")
}

// ================= HELPERS =================
let decelBuffer = []

function smoothValue(current, target, alpha = 0.2) {
  return current * (1 - alpha) + target * alpha
}

function clampDecel(value) {
  if (!isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 12) return 12
  return value
}

function getBrakeLevelFromDecel(decel) {
  if (decel >= HARD_BRAKE_THRESHOLD) return "HARD"
  if (decel >= BRAKE_THRESHOLD) return "NORMAL"
  if (decel >= SLOW_BRAKE_THRESHOLD) return "SLOW"
  return "NONE"
}

function generateSessionId() {
  return "SESSION-" + new Date().toISOString().replace(/[:.]/g, "-")
}

function setPhonePosition(value) {
  phonePosition = value
  const el = document.getElementById("phonePosText")
  if (el) el.innerText = value
  updateASummary()
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

function updateAngelMode(isActive) {
  if (isActive) {
    document.body.classList.add("recording")
  } else {
    document.body.classList.remove("recording")
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

function updateInsights(mode = "Ready", zone = "Normal", road = "Stable") {
  const modeEl = document.getElementById("insightMode")
  const zoneEl = document.getElementById("insightZone")
  const roadEl = document.getElementById("insightRoad")

  if (modeEl) modeEl.innerText = mode
  if (zoneEl) zoneEl.innerText = zone
  if (roadEl) roadEl.innerText = road
}

function updateASummary() {
  const alertEl = document.getElementById("activeAlertCount")
  const zoneEl = document.getElementById("dangerZoneCount")
  const latencyEl = document.getElementById("lastAlertLatency")
  const typeEl = document.getElementById("lastAlertType")
  const phoneEl = document.getElementById("phonePosText")

  if (alertEl) alertEl.innerText = activeAlertCount
  if (zoneEl) zoneEl.innerText = dangerZones.length
  if (latencyEl) latencyEl.innerText = `${lastAlertLatencyMs} ms`
  if (typeEl) typeEl.innerText = lastAlertType
  if (phoneEl) phoneEl.innerText = phonePosition
}

function recordAlertLatency(startTime, alertType) {
  lastAlertLatencyMs = Math.max(0, Date.now() - startTime)
  lastAlertType = alertType
  activeAlertCount++
  updateASummary()
}

function raiseAlert({
  text,
  color,
  voiceText = "",
  vibration = "",
  chime = "",
  insightMode = "Warning",
  insightZone = "Risk Zone",
  insightRoad = "Hazard",
  alertType = "Alert",
  startTime = Date.now()
}) {
  showPopup(text, color)

  if (voiceText) speak(voiceText)
  if (vibration) vibrate(vibration)
  if (chime) playChime(chime)

  updateInsights(insightMode, insightZone, insightRoad)
  recordAlertLatency(startTime, alertType)
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

function triggerBrakeFlash(level) {
  const hero = document.querySelector(".hero-card")
  const riskEl = document.getElementById("risk")
  const styleEl = document.getElementById("style")

  if (!hero || !riskEl || !styleEl) return

  hero.classList.remove("flash-slow", "flash-normal", "flash-hard")
  riskEl.classList.remove("flash-slow-text", "flash-normal-text", "flash-hard-text")
  styleEl.classList.remove("flash-slow-text", "flash-normal-text", "flash-hard-text")

  if (level === "SLOW") {
    hero.classList.add("flash-slow")
    riskEl.classList.add("flash-slow-text")
    styleEl.classList.add("flash-slow-text")
  } else if (level === "NORMAL") {
    hero.classList.add("flash-normal")
    riskEl.classList.add("flash-normal-text")
    styleEl.classList.add("flash-normal-text")
  } else if (level === "HARD") {
    hero.classList.add("flash-hard")
    riskEl.classList.add("flash-hard-text")
    styleEl.classList.add("flash-hard-text")
  }

  setTimeout(() => {
    hero.classList.remove("flash-slow", "flash-normal", "flash-hard")
    riskEl.classList.remove("flash-slow-text", "flash-normal-text", "flash-hard-text")
    styleEl.classList.remove("flash-slow-text", "flash-normal-text", "flash-hard-text")
  }, 900)
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

function syncSystemMode() {
  if (!watching) {
    updateInsights("Idle", "Normal", "Stable")
    return
  }

  let zone = "Monitoring"
  let road = "Stable"

  const recentLabels = dataset.slice(-10).map(d => d.label || "")
  if (recentLabels.includes("POTHOLE")) {
    road = "Pothole"
  } else if (recentLabels.includes("ROUGH_ROAD")) {
    road = "Rough Road"
  }

  if (hardBrakes > 0) {
    zone = "Risk Zone"
  }

  updateInsights("Angel Active", zone, road)
}

// ================= DANGER ZONE ALERTS =================
function checkNearbyDangerZones(lat, lng) {
  for (let i = 0; i < dangerZones.length; i++) {
    const z = dangerZones[i]
    const dist = getDistanceMeters(lat, lng, z.lat, z.lng)

    if (dist <= ALERT_RADIUS_METERS) {
      if (!alertedZones.has(z.id)) {
        alertedZones.add(z.id)
        const alertStart = Date.now()

        if (z.type === "HARD_BRAKE") {
          raiseAlert({
            text: "⚠️ Approaching Risk Zone",
            color: "#ff6b6b",
            voiceText: "Warning approaching risk zone",
            vibration: "hard",
            chime: "alert",
            insightMode: "Warning",
            insightZone: "Risk Zone",
            insightRoad: "Brake Hotspot",
            alertType: "Approaching Risk Zone",
            startTime: alertStart
          })
        } else if (z.type === "ROUGH_ROAD") {
          raiseAlert({
            text: "⚠️ Rough Road Ahead",
            color: "#845ef7",
            voiceText: "Warning rough road ahead",
            vibration: "normal",
            chime: "soft-alert",
            insightMode: "Warning",
            insightZone: "Road Zone",
            insightRoad: "Rough Road",
            alertType: "Rough Road Ahead",
            startTime: alertStart
          })
        } else if (z.type === "ROAD_WORK") {
          raiseAlert({
            text: "🚧 Possible Road Work Area",
            color: "#f59f00",
            voiceText: "Warning possible road work area",
            vibration: "normal",
            chime: "soft-alert",
            insightMode: "Warning",
            insightZone: "Road Zone",
            insightRoad: "Possible Road Work",
            alertType: "Possible Road Work",
            startTime: alertStart
          })
        } else if (z.type === "POTHOLE") {
          raiseAlert({
            text: "⚠️ Approaching Pothole Zone",
            color: "#845ef7",
            voiceText: "Warning approaching pothole zone",
            vibration: "normal",
            chime: "soft-alert",
            insightMode: "Warning",
            insightZone: "Road Zone",
            insightRoad: "Pothole Area",
            alertType: "Approaching Pothole Zone",
            startTime: alertStart
          })
        }
      }
    } else if (dist > ALERT_RADIUS_METERS + 20) {
      alertedZones.delete(z.id)
    }
  }
}

// ================= INIT =================
window.onload = function () {
  chart = new Chart(document.getElementById("speedChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "Speed",
        data: [],
        borderColor: "rgba(255,255,255,0.75)",
        backgroundColor: "rgba(255,255,255,0.08)",
        tension: 0.35,
        pointRadius: 2,
        borderWidth: 2,
        fill: false
      }]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: {
          labels: { color: "rgba(255,255,255,0.85)" }
        }
      },
      scales: {
        x: {
          ticks: { color: "rgba(255,255,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" }
        },
        y: {
          ticks: { color: "rgba(255,255,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
    }
  })

  decelChart = new Chart(document.getElementById("decelChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Decel",
          data: [],
          borderColor: "rgba(255,255,255,0.75)",
          backgroundColor: "rgba(255,255,255,0.08)",
          tension: 0.35,
          pointRadius: 2,
          pointHoverRadius: 3,
          borderWidth: 2,
          fill: false
        },
        {
          label: "Slow",
          data: [],
          showLine: false,
          pointRadius: 5,
          pointHoverRadius: 6,
          pointBackgroundColor: "#b7f0c0",
          pointBorderColor: "#b7f0c0"
        },
        {
          label: "Normal Brake",
          data: [],
          showLine: false,
          pointRadius: 5,
          pointHoverRadius: 6,
          pointBackgroundColor: "#ffe08a",
          pointBorderColor: "#ffe08a"
        },
        {
          label: "Hard Brake",
          data: [],
          showLine: false,
          pointRadius: 6,
          pointHoverRadius: 7,
          pointBackgroundColor: "#ff8fa3",
          pointBorderColor: "#ff8fa3"
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: {
          labels: { color: "rgba(255,255,255,0.85)" }
        }
      },
      scales: {
        x: {
          ticks: { color: "rgba(255,255,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" }
        },
        y: {
          ticks: { color: "rgba(255,255,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
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
  if (saved) dataset = JSON.parse(saved)

  loadDangerZones()
  renderDangerZones()
  setPhonePosition(phonePosition)
  updateRecordingUI(false)
  updateAngelMode(false)
  updateSessionUI()
  updateInsights("Ready", "Normal", "Stable")
  updateSummary()
  updateASummary()
}

// ================= START =================
function startRide() {
  if (watching) return

  initSound()
  playChime("start")

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

      activeAlertCount = 0
      lastAlertLatencyMs = 0
      lastAlertType = "None"
      updateASummary()

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
      updateAngelMode(true)
      updateSessionUI()
      updateInsights("Angel Active", "Monitoring", "Stable")

      watchId = navigator.geolocation.watchPosition(
        updateSpeed,
        (err) => console.error("GPS Error:", err),
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000
        }
      )
    },
    (err) => console.error("Start location error:", err),
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
  updateAngelMode(false)
  updateSessionUI()
  updateInsights("Idle", "Normal", "Stable")
}

// ================= ROAD CLASSIFIER =================
function classifyRoadEvent(speed, dt, decel, speedDropShort) {
  if (speed < MIN_SPEED_FOR_ROAD_EVENT) {
    return { isPothole: false, isRoughRoad: false }
  }

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
    }).addTo(map).bindPopup("Current Position")
  }

  routePoints.push([lat, lng])
  if (routeLine) routeLine.setLatLngs(routePoints)

  let rawSpeed = (pos.coords.speed || 0) * 3.6
  if (rawSpeed < 1) rawSpeed = 0

  smoothSpeed = smoothValue(smoothSpeed, rawSpeed)
  document.getElementById("speed").innerText = smoothSpeed.toFixed(1)

  const speedEl = document.getElementById("speed")
  if (smoothSpeed > 80) speedEl.style.color = "#ff6b6b"
  else if (smoothSpeed > 40) speedEl.style.color = "#ffd43b"
  else speedEl.style.color = "#69f0ae"

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
    decel = clampDecel(decel)

    if (speed < 6) {
      lastSpeed = speed
      lastTime = now
      syncSystemMode()
      logLatency("updateSpeed", startTime)
      return
    }

    if (Math.abs(sensorDecel) < 0.45 && Math.abs(gpsDecel) < 0.45) {
      lastSpeed = speed
      lastTime = now
      syncSystemMode()
      logLatency("updateSpeed", startTime)
      return
    }

    decelBuffer.push(decel)
    if (decelBuffer.length > 3) decelBuffer.shift()
    decel = decelBuffer.reduce((a, b) => a + b, 0) / decelBuffer.length
    decel = clampDecel(decel)

    const speedDropShort = Math.max(0, lastSpeed - speed)
    const roadEvent = classifyRoadEvent(speed, dt, decel, speedDropShort)
    const isPothole = roadEvent.isPothole
    const isRoughRoad = roadEvent.isRoughRoad

    if (decel < 0.8 && !isPothole && !isRoughRoad) {
      lastSpeed = speed
      lastTime = now
      syncSystemMode()
      logLatency("updateSpeed", startTime)
      return
    }

    let label = "CRUISE"
    if (isPothole) label = "POTHOLE"
    else if (isRoughRoad) label = "ROUGH_ROAD"
    else if (decel >= HARD_BRAKE_THRESHOLD) label = "HARD_BRAKE"
    else if (decel >= BRAKE_THRESHOLD) label = "BRAKE"
    else if (decel >= SLOW_BRAKE_THRESHOLD) label = "SLOW_BRAKE"
    else if (speed < 5) label = "STOP"

    if (decel > peakDecel) peakDecel = decel
    document.getElementById("peak").innerText = peakDecel.toFixed(2)

    const quickBrakeDetected =
      speed >= MIN_SPEED_FOR_BRAKE &&
      (
        (decel >= HARD_BRAKE_THRESHOLD && speedDropShort >= 1.2) ||
        (decel >= BRAKE_THRESHOLD && speedDropShort >= 0.8) ||
        (decel >= SLOW_BRAKE_THRESHOLD && speedDropShort >= 0.4)
      )

    const liveBrakeLevel = getBrakeLevelFromDecel(decel)

    if (quickBrakeDetected && liveBrakeLevel !== "NONE" && !isPothole && !isRoughRoad) {
      if (!brakeLiveShown) {
        brakeLiveShown = true
        triggerBrakeFlash(liveBrakeLevel)

        if (liveBrakeLevel === "HARD") {
          updateInsights("Alert", "Risk Zone", "Hard Brake")
        } else if (liveBrakeLevel === "NORMAL") {
          updateInsights("Active", "Brake", "Normal Brake")
        } else if (liveBrakeLevel === "SLOW") {
          updateInsights("Active", "Slowdown", "Slow Brake")
        }
      }
    }

    if (speed > MIN_SPEED_FOR_BRAKE) {
      if (brakeWindowStartTime === 0) {
        resetBrakeWindow(now, speed)
      }

      if (now - brakeWindowStartTime > BRAKE_WINDOW_MS) {
        resetBrakeWindow(now, speed)
      }

      if (decel >= BRAKE_THRESHOLD || speedDropShort >= 0.8) brakeFrames++
      else brakeFrames = Math.max(0, brakeFrames - 1)

      if (decel >= HARD_BRAKE_THRESHOLD || speedDropShort >= 1.6) hardBrakeFrames++
      else hardBrakeFrames = Math.max(0, hardBrakeFrames - 1)

      const speedDrop = Math.max(0, brakeWindowStartSpeed - speed)

      if (!isPothole && !isRoughRoad) {
        if ((brakeFrames >= 1 || hardBrakeFrames >= 1) && !brakeStart) {
          brakeStart = now
          brakeDistance = 0
        }

        if (brakeStart) brakeDistance += speed * dt / 3600

        if (hardBrakeFrames >= 1 && speedDrop >= HARD_MIN_SPEED_DROP) {
          brakeConfirmedType = "HARD"
        } else if (brakeFrames >= 1 && speedDrop >= MIN_SPEED_DROP) {
          brakeConfirmedType = decel >= HARD_BRAKE_THRESHOLD ? "HARD" : "NORMAL"
        } else if (brakeFrames >= 1 && decel >= SLOW_BRAKE_THRESHOLD && speedDrop >= 1.5) {
          if (!brakeConfirmedType) brakeConfirmedType = "NORMAL"
        }

        if (brakeStart && decel < 0.9 && speedDropShort < 0.3) {
          if (brakeConfirmedType) logBrake(lat, lng, brakeConfirmedType)
          brakeStart = null
          resetBrakeWindow(now, speed)
        }
      }
    } else {
      resetBrakeWindow(now, speed)
    }

    if (isPothole && now - lastRoadEventTime > 800) {
      lastRoadEventTime = now
      const alertStart = Date.now()

      raiseAlert({
        text: "🕳 POTHOLE",
        color: "#845ef7",
        voiceText: "Warning pothole detected",
        vibration: "normal",
        chime: "alert",
        insightMode: "Alert",
        insightZone: "Road Hazard",
        insightRoad: "Pothole",
        alertType: "Pothole",
        startTime: alertStart
      })

      addPotholeZone(lat, lng)

      L.circleMarker([lat, lng], {
        color: "purple",
        radius: 6
      }).addTo(map).bindPopup("POTHOLE")

      dataset.push({
        sessionId: currentSessionId,
        phonePosition: phonePosition,
        timestamp: now,
        event: "pothole",
        decel,
        accelY,
        lat,
        lng,
        label: "POTHOLE"
      })
    }

    if (isRoughRoad && now - lastRoadEventTime > ROUGH_ROAD_REPEAT_MS) {
      lastRoadEventTime = now
      const alertStart = Date.now()

      raiseAlert({
        text: "⚠️ ROUGH ROAD",
        color: "#6f42c1",
        voiceText: "Warning rough road ahead",
        vibration: "normal",
        chime: "soft-alert",
        insightMode: "Alert",
        insightZone: "Road Hazard",
        insightRoad: "Rough Road",
        alertType: "Rough Road",
        startTime: alertStart
      })

      addRoughRoadZone(lat, lng)

      L.circleMarker([lat, lng], {
        color: "#6f42c1",
        radius: 5
      }).addTo(map).bindPopup("ROUGH ROAD")

      dataset.push({
        sessionId: currentSessionId,
        phonePosition: phonePosition,
        timestamp: now,
        event: "rough_road",
        decel,
        accelY,
        lat,
        lng,
        label: "ROUGH_ROAD"
      })
    }

    const t = new Date().toLocaleTimeString()

    chart.data.labels.push(t)
    chart.data.datasets[0].data.push(speed)

    decelChart.data.labels.push(t)
    decelChart.data.datasets[0].data.push(decel)

    const brakeLevel = getBrakeLevelFromDecel(decel)
    decelChart.data.datasets[1].data.push(brakeLevel === "SLOW" ? decel : null)
    decelChart.data.datasets[2].data.push(brakeLevel === "NORMAL" ? decel : null)
    decelChart.data.datasets[3].data.push(brakeLevel === "HARD" ? decel : null)

    if (chart.data.labels.length > 20) {
      chart.data.labels.shift()
      chart.data.datasets[0].data.shift()

      decelChart.data.labels.shift()
      decelChart.data.datasets[0].data.shift()
      decelChart.data.datasets[1].data.shift()
      decelChart.data.datasets[2].data.shift()
      decelChart.data.datasets[3].data.shift()
    }

    chart.update()
    decelChart.update()

    dataset.push({
      sessionId: currentSessionId,
      phonePosition: phonePosition,
      timestamp: now,
      time: t,
      duration: (now - rideStartTime) / 1000,
      speed,
      acceleration,
      deceleration: decel,
      accelY,
      sensorDecel,
      gpsDecel,
      lat,
      lng,
      totalDistance,
      label
    })

    updateSummary()
    syncSystemMode()
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
    if (peakDecel >= HARD_BRAKE_THRESHOLD) {
      type = "HARD"
      color = "red"
    } else if (peakDecel >= BRAKE_THRESHOLD) {
      type = "NORMAL"
      color = "yellow"
    }
  }

  if (type === "HARD") {
    hardBrakes++
    const alertStart = Date.now()

    raiseAlert({
      text: "🔴 HARD BRAKE",
      color: "#ff4d4d",
      voiceText: "Warning hard brake",
      vibration: "hard",
      chime: "alert",
      insightMode: "Alert",
      insightZone: "Risk Zone",
      insightRoad: "Harsh Braking",
      alertType: "Hard Brake",
      startTime: alertStart
    })

    triggerEffect()
    addDangerZone(lat, lng, "HARD_BRAKE")
    triggerBrakeFlash("HARD")
  } else if (type === "NORMAL") {
    normalBrakes++
    const alertStart = Date.now()

    raiseAlert({
      text: "🟡 NORMAL BRAKE",
      color: "#ffd43b",
      voiceText: "",
      vibration: "normal",
      chime: "soft-alert",
      insightMode: "Active",
      insightZone: "Brake",
      insightRoad: "Normal Brake",
      alertType: "Normal Brake",
      startTime: alertStart
    })

    triggerBrakeFlash("NORMAL")
  } else {
    slowBrakes++
    const alertStart = Date.now()

    raiseAlert({
      text: "🟢 SLOW",
      color: "#51cf66",
      voiceText: "",
      vibration: "",
      chime: "",
      insightMode: "Active",
      insightZone: "Slowdown",
      insightRoad: "Slow Brake",
      alertType: "Slow Brake",
      startTime: alertStart
    })

    triggerBrakeFlash("SLOW")
  }

  L.circleMarker([lat, lng], {
    color,
    radius: 8
  }).addTo(map).bindPopup(type)

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

  if (type === "HARD") vibrate("hard")
  else if (type === "NORMAL") vibrate("normal")

  dataset.push({
    sessionId: currentSessionId,
    phonePosition: phonePosition,
    timestamp: Date.now(),
    event: "brake",
    type,
    risk,
    style,
    peakDecel,
    distance: brakeDistance,
    lat,
    lng,
    totalDistance,
    label: type
  })

  document.getElementById("total").innerText = totalBrakes
  document.getElementById("hard").innerText = hardBrakes
  document.getElementById("brakeDist").innerText = brakeDistance.toFixed(2)

  updateSummary()
  syncSystemMode()

  peakDecel = 0
  brakeConfirmedType = null
  brakeLiveShown = false
}

// ================= SUMMARY =================
function updateSummary() {
  const decels = dataset
    .map((d) => Number(d.deceleration || 0))
    .filter((v) => isFinite(v) && v > 0 && v <= 12)

  const avg = decels.length ? decels.reduce((a, b) => a + b, 0) / decels.length : 0
  const max = decels.length ? Math.max(...decels) : 0

  const avgEl = document.getElementById("avg")
  const maxEl = document.getElementById("max")

  if (avgEl) avgEl.innerText = avg.toFixed(2)
  if (maxEl) maxEl.innerText = max.toFixed(2)
}

// ================= CSV =================
function exportCSV() {
  initSound()
  playChime("export")

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
