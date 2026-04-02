// ================= CORE STATE =================
let watching = false
let watchId = null

let lastSpeed = 0
let lastTime = 0
let lastLat = null
let lastLng = null

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
    const ay = e.accelerationIncludingGravity.y || 0
    accelY = ay
    smoothAccel = smoothAccel * 0.92 + ay * 0.08
  }
})

// ================= TUNING =================
// brake tuning
const SLOW_BRAKE_THRESHOLD = 1.5
const BRAKE_THRESHOLD = 2.4
const HARD_BRAKE_THRESHOLD = 3.6

const MIN_MOVING_SPEED = 10
const MIN_BRAKE_SPEED_DROP = 2.5
const MIN_HARD_BRAKE_SPEED_DROP = 4.5

const MIN_SPEED_FOR_BRAKE = 10
const MIN_SPEED_DROP = 2.8
const HARD_MIN_SPEED_DROP = 4.8
const BRAKE_WINDOW_MS = 900

// road tuning
const MIN_SPEED_FOR_ROAD_EVENT = 8
const ROUGH_ROAD_ACCEL_THRESHOLD = 3.0
const POTHOLE_THRESHOLD = 4.6
const ROAD_EVENT_MAX_DT = 0.22
const POTHOLE_MAX_SPEED_DROP = 1.6
const ROUGH_ROAD_REPEAT_MS = 1800

// map zone tuning
const ALERT_RADIUS_METERS = 55
const ZONE_MERGE_METERS = 28

// alert tuning
const ALERT_COOLDOWN_MS = 700

let lastRoadEventTime = 0
let lastBrakeAlertTime = 0

// ================= BRAKE WINDOW =================
let brakeFrames = 0
let hardBrakeFrames = 0
let brakeWindowStartSpeed = 0
let brakeWindowStartTime = 0
let brakeConfirmedType = null
let brakeCandidateFrames = 0
let hardBrakeCandidateFrames = 0

function resetBrakeWindow(now, speed) {
  brakeFrames = 0
  hardBrakeFrames = 0
  brakeWindowStartTime = now
  brakeWindowStartSpeed = speed
  brakeConfirmedType = null
}

function resetBrakeCandidates() {
  brakeCandidateFrames = 0
  hardBrakeCandidateFrames = 0
}

function canRaiseBrakeAlert() {
  return Date.now() - lastBrakeAlertTime > ALERT_COOLDOWN_MS
}

function markBrakeAlertNow() {
  lastBrakeAlertTime = Date.now()
}

// ================= SOUND =================
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

function playTone(freq = 880, duration = 0.18, type = "square", volume = 0.12, startDelay = 0) {
  if (!audioReady || !audioCtx) return

  const now = audioCtx.currentTime + startDelay
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, now)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(volume, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  osc.connect(gain)
  gain.connect(audioCtx.destination)

  osc.start(now)
  osc.stop(now + duration + 0.05)
}

function playChime(kind = "start") {
  const now = Date.now()
  if (now - lastSfxTime < 180) return
  lastSfxTime = now

  if (!audioReady) return

  if (kind === "start") {
    playTone(900, 0.12, "square", 0.08, 0.00)
    playTone(1200, 0.14, "square", 0.08, 0.08)
  } else if (kind === "alert") {
    playTone(1700, 0.16, "square", 0.14, 0.00)
    playTone(1200, 0.18, "square", 0.14, 0.10)
    playTone(1700, 0.16, "square", 0.14, 0.22)
  } else if (kind === "soft-alert") {
    playTone(1100, 0.10, "square", 0.08, 0.00)
    playTone(900, 0.12, "square", 0.08, 0.08)
  } else if (kind === "export") {
    playTone(850, 0.10, "square", 0.06, 0.00)
    playTone(1250, 0.12, "square", 0.06, 0.08)
  }
}

// ================= DANGER ZONES / MAP EVENTS =================
let dangerZones = []
let alertedZones = new Set()
let dangerZoneMarkers = []

let eventMarkers = []
let eventLayerGroup = null

let lastBrakeMarkerTime = 0
const BRAKE_MARKER_COOLDOWN_MS = 1200

let mapFilters = {
  HARD_BRAKE: true,
  BRAKE: true,
  SLOW_BRAKE: true,
  POTHOLE: true,
  ROUGH_ROAD: true,
  ZONES: true
}

const EVENT_WEIGHTS = {
  HARD_BRAKE: 3,
  BRAKE: 2,
  SLOW_BRAKE: 1,
  POTHOLE: 3,
  ROUGH_ROAD: 2,
  ROAD_WORK: 2
}

function loadDangerZones() {
  const saved = localStorage.getItem("moto_danger_zones")
  if (saved) {
    dangerZones = JSON.parse(saved).map((z) => ({
      ...z,
      lat: Number(z.lat),
      lng: Number(z.lng),
      count: Number(z.count || 0),
      totalScore: Number(z.totalScore || 0),
      scoreEMA: Number(z.scoreEMA || 0),
      hardBrakeCount: Number(z.hardBrakeCount || 0),
      brakeCount: Number(z.brakeCount || 0),
      slowBrakeCount: Number(z.slowBrakeCount || 0),
      potholeCount: Number(z.potholeCount || 0),
      roughRoadCount: Number(z.roughRoadCount || 0),
      dominantType: z.dominantType || z.type || "BRAKE",
      type: z.type || "BRAKE",
      level: z.level || "LOW"
    }))
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

function normalizeEventLabel(label, type = "") {
  if (label === "HARD" || type === "HARD") return "HARD_BRAKE"
  if (label === "NORMAL" || type === "NORMAL") return "BRAKE"
  if (label === "SLOW" || type === "SLOW") return "SLOW_BRAKE"
  if (label === "HARD_BRAKE") return "HARD_BRAKE"
  if (label === "BRAKE") return "BRAKE"
  if (label === "SLOW_BRAKE") return "SLOW_BRAKE"
  if (label === "POTHOLE") return "POTHOLE"
  if (label === "ROUGH_ROAD") return "ROUGH_ROAD"
  if (label === "ROAD_WORK") return "ROAD_WORK"
  return label || "UNKNOWN"
}

function computeEventRiskScore(row) {
  const label = normalizeEventLabel(row.label, row.type)
  let score = EVENT_WEIGHTS[label] || 0

  const peak = Number(
    row.peakDecel ??
    row.deceleration ??
    row.sensorDecel ??
    row.gpsDecel ??
    row.decel ??
    0
  )

  const speed = Number(row.speed || 0)

  if (peak >= 5.0) score += 2
  else if (peak >= 3.5) score += 1

  if (speed >= 30) score += 1

  return score
}

function getPersistentZoneLevel(currentLevel, scoreEMA) {
  if (!currentLevel) {
    if (scoreEMA >= 5.6) return "SEVERE"
    if (scoreEMA >= 4.2) return "HIGH"
    if (scoreEMA >= 2.6) return "MEDIUM"
    return "LOW"
  }

  if (currentLevel === "LOW") {
    if (scoreEMA >= 2.8) return "MEDIUM"
    return "LOW"
  }

  if (currentLevel === "MEDIUM") {
    if (scoreEMA >= 4.4) return "HIGH"
    if (scoreEMA <= 1.6) return "LOW"
    return "MEDIUM"
  }

  if (currentLevel === "HIGH") {
    if (scoreEMA >= 5.8) return "SEVERE"
    if (scoreEMA <= 3.0) return "MEDIUM"
    return "HIGH"
  }

  if (currentLevel === "SEVERE") {
    if (scoreEMA <= 4.4) return "HIGH"
    return "SEVERE"
  }

  return currentLevel
}

function getLevelColor(level) {
  if (level === "SEVERE") return "#ff1744"
  if (level === "HIGH") return "#ff9100"
  if (level === "MEDIUM") return "#ffd600"
  return "#00e676"
}

function getDominantType(zone) {
  const counts = {
    HARD_BRAKE: zone.hardBrakeCount || 0,
    BRAKE: zone.brakeCount || 0,
    SLOW_BRAKE: zone.slowBrakeCount || 0,
    POTHOLE: zone.potholeCount || 0,
    ROUGH_ROAD: zone.roughRoadCount || 0
  }

  let maxType = "BRAKE"
  let maxCount = -1

  Object.entries(counts).forEach(([k, v]) => {
    if (v > maxCount) {
      maxCount = v
      maxType = k
    }
  })

  return maxType
}

function canDropBrakeMarkerNow() {
  return Date.now() - lastBrakeMarkerTime > BRAKE_MARKER_COOLDOWN_MS
}

function markBrakeMarkerNow() {
  lastBrakeMarkerTime = Date.now()
}

function clearDangerZoneMarkers() {
  if (!map) return
  dangerZoneMarkers.forEach((m) => map.removeLayer(m))
  dangerZoneMarkers = []
}

function getZoneDisplay(type) {
  const label = normalizeEventLabel(type)

  if (label === "HARD_BRAKE") {
    return {
      title: "Hard Brake Zone",
      color: "#ff4d6d",
      short: "Hard Brake"
    }
  }

  if (label === "BRAKE") {
    return {
      title: "Brake Event",
      color: "#ffd166",
      short: "Brake"
    }
  }

  if (label === "POTHOLE") {
    return {
      title: "Pothole Zone",
      color: "#5f3dc4",
      short: "Pothole Area"
    }
  }

  if (label === "ROUGH_ROAD") {
    return {
      title: "Rough Road Zone",
      color: "#845ef7",
      short: "Rough Road"
    }
  }

  if (label === "ROAD_WORK") {
    return {
      title: "Damaged Road Area",
      color: "#f08c00",
      short: "Road Damage"
    }
  }

  if (label === "SLOW_BRAKE") {
    return {
      title: "Slow Brake Zone",
      color: "#80ed99",
      short: "Slow Brake"
    }
  }

  return {
    title: "Hazard Zone",
    color: "#f59f00",
    short: "Hazard"
  }
}

function shouldShowEventLabel(label) {
  const normalized = normalizeEventLabel(label)
  if (normalized === "HARD_BRAKE") return mapFilters.HARD_BRAKE
  if (normalized === "BRAKE") return mapFilters.BRAKE
  if (normalized === "SLOW_BRAKE") return mapFilters.SLOW_BRAKE
  if (normalized === "POTHOLE") return mapFilters.POTHOLE
  if (normalized === "ROUGH_ROAD") return mapFilters.ROUGH_ROAD
  return true
}

function addEventMarker(rowOrLat, lngArg = null, typeArg = null) {
  if (!map) return

  let row

  if (typeof rowOrLat === "object" && rowOrLat !== null) {
    row = rowOrLat
  } else {
    row = {
      lat: rowOrLat,
      lng: lngArg,
      label: typeArg
    }
  }

  const label = normalizeEventLabel(row.label, row.type)
  if (!shouldShowEventLabel(label)) return

  const zoneInfo = getZoneDisplay(label)
  const riskScore = row.riskScore != null ? row.riskScore : computeEventRiskScore(row)

    let radius = 4
  if (label === "HARD_BRAKE") radius = 5
  if (label === "BRAKE") radius = 4
  if (label === "POTHOLE") radius = 5
  if (label === "ROUGH_ROAD") radius = 4
  if (label === "SLOW_BRAKE") radius = 3

    const marker = L.circleMarker([Number(row.lat), Number(row.lng)], {
    color: zoneInfo.color,
    fillColor: zoneInfo.color,
    fillOpacity: 0.55,
    radius: radius,
    weight: 1
  }).bindPopup(
    `<b>${label}</b><br>` +
    `Speed: ${Number(row.speed || 0).toFixed(1)} km/h<br>` +
    `Peak decel: ${Number(row.peakDecel || row.deceleration || row.decel || 0).toFixed(2)}<br>` +
    `Risk score: ${Number(riskScore || 0).toFixed(1)}<br>` +
    `Time: ${row.time || "-"}<br>` +
    `Session: ${row.sessionId || "-"}`
  )

  if (eventLayerGroup) {
    eventLayerGroup.addLayer(marker)
  } else {
    marker.addTo(map)
  }

  eventMarkers.push(marker)
}

function clearEventMarkers() {
  if (!map) return
  if (eventLayerGroup) {
    eventLayerGroup.clearLayers()
  } else {
    eventMarkers.forEach((m) => map.removeLayer(m))
  }
  eventMarkers = []
}

function renderDangerZones() {
  if (!map) return

  clearDangerZoneMarkers()
  if (!mapFilters.ZONES) return

  dangerZones.forEach((z) => {
    const potholeCount = Number(z.potholeCount || 0)
    const roughCount = Number(z.roughRoadCount || 0)

    let dominantType = z.dominantType || getDominantType(z)

    if (potholeCount + roughCount >= 4 || potholeCount >= 2 || roughCount >= 3) {
      dominantType = "ROAD_WORK"
    }

    const borderInfo = getZoneDisplay(dominantType)
    const levelColor = getLevelColor(z.level || "LOW")

    let radius = 42
    if (dominantType === "HARD_BRAKE") radius = 50
    if (dominantType === "BRAKE") radius = 46
    if (dominantType === "POTHOLE") radius = 40
    if (dominantType === "ROUGH_ROAD") radius = 56
    if (dominantType === "ROAD_WORK") radius = 68

    const scoreBoost = Math.min(Number(z.totalScore || 0), 12) * 6

    const marker = L.circle([z.lat, z.lng], {
      radius: radius + scoreBoost,
      color: borderInfo.color,
      fillColor: levelColor,
      fillOpacity: 0.55,
      weight: 5
    }).addTo(map)

    marker.bindPopup(
      `<b>${z.level || "LOW"} RISK ZONE</b><br>` +
      `Main type: ${dominantType}<br>` +
      `Count: ${z.count}<br>` +
      `Brake: ${Number(z.brakeCount || 0) + Number(z.slowBrakeCount || 0)}<br>` +
      `Hard brake: ${Number(z.hardBrakeCount || 0)}<br>` +
      `Pothole: ${potholeCount}<br>` +
      `Rough road: ${roughCount}<br>` +
      `Total score: ${Number(z.totalScore || 0).toFixed(1)}`
    )

    dangerZoneMarkers.push(marker)
  })
}

function addDangerZone(rowOrLat, lngArg = null, typeArg = null) {
  let row

  if (typeof rowOrLat === "object" && rowOrLat !== null) {
    row = rowOrLat
  } else {
    row = {
      lat: rowOrLat,
      lng: lngArg,
      label: typeArg
    }
  }

  row.lat = Number(row.lat)
  row.lng = Number(row.lng)
  row.label = normalizeEventLabel(row.label, row.type)

  const eventScore = row.riskScore != null ? row.riskScore : computeEventRiskScore(row)

  let found = false

  for (let i = 0; i < dangerZones.length; i++) {
    const z = dangerZones[i]
    const dist = getDistanceMeters(row.lat, row.lng, z.lat, z.lng)

    if (dist <= ZONE_MERGE_METERS) {
      z.count += 1
      z.lat = (z.lat * (z.count - 1) + row.lat) / z.count
      z.lng = (z.lng * (z.count - 1) + row.lng) / z.count
      z.updatedAt = Date.now()
      z.totalScore = Number(z.totalScore || 0) + eventScore
      z.scoreEMA = z.scoreEMA == null ? eventScore : (z.scoreEMA * 0.75 + eventScore * 0.25)

      if (row.label === "HARD_BRAKE") z.hardBrakeCount = (z.hardBrakeCount || 0) + 1
      if (row.label === "BRAKE") z.brakeCount = (z.brakeCount || 0) + 1
      if (row.label === "SLOW_BRAKE") z.slowBrakeCount = (z.slowBrakeCount || 0) + 1
      if (row.label === "POTHOLE") z.potholeCount = (z.potholeCount || 0) + 1
      if (row.label === "ROUGH_ROAD") z.roughRoadCount = (z.roughRoadCount || 0) + 1

      const potholeCount = Number(z.potholeCount || 0)
      const roughCount = Number(z.roughRoadCount || 0)

      if (potholeCount + roughCount >= 4 || potholeCount >= 2 || roughCount >= 3) {
        z.dominantType = "ROAD_WORK"
      } else {
        z.dominantType = getDominantType(z)
      }

      z.level = getPersistentZoneLevel(z.level, z.scoreEMA)

      found = true
      break
    }
  }

  if (!found) {
    dangerZones.push({
      id: "zone_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      lat: row.lat,
      lng: row.lng,
      type: row.label,
      dominantType: row.label,
      level: getPersistentZoneLevel(null, eventScore),
      count: 1,
      totalScore: eventScore,
      scoreEMA: eventScore,
      hardBrakeCount: row.label === "HARD_BRAKE" ? 1 : 0,
      brakeCount: row.label === "BRAKE" ? 1 : 0,
      slowBrakeCount: row.label === "SLOW_BRAKE" ? 1 : 0,
      potholeCount: row.label === "POTHOLE" ? 1 : 0,
      roughRoadCount: row.label === "ROUGH_ROAD" ? 1 : 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
  }

  saveDangerZones()
  renderDangerZones()
  updateASummary()
}

function addPotholeZone(rowOrLat, lngArg = null) {
  if (typeof rowOrLat === "object") addDangerZone(rowOrLat)
  else addDangerZone({ lat: rowOrLat, lng: lngArg, label: "POTHOLE" })
}

function addRoughRoadZone(rowOrLat, lngArg = null) {
  if (typeof rowOrLat === "object") addDangerZone(rowOrLat)
  else addDangerZone({ lat: rowOrLat, lng: lngArg, label: "ROUGH_ROAD" })
}

function renderHistoricalEventMarkers() {
  clearEventMarkers()

  dataset.forEach((row) => {
    const label = normalizeEventLabel(row.label, row.type)

    if (
      row.markerEvent === true &&
      Number.isFinite(Number(row.lat)) &&
      Number.isFinite(Number(row.lng)) &&
      ["HARD_BRAKE", "BRAKE", "SLOW_BRAKE", "POTHOLE", "ROUGH_ROAD"].includes(label)
    ) {
      addEventMarker({
        ...row,
        lat: Number(row.lat),
        lng: Number(row.lng),
        label,
        riskScore: row.riskScore != null ? Number(row.riskScore) : computeEventRiskScore(row)
      })
    }
  })
}

function refreshMapLayersFromState() {
  renderHistoricalEventMarkers()
  renderDangerZones()
}
function toggleMapFilter(key, checked) {
  mapFilters[key] = checked
  refreshMapLayersFromState()
}
// ================= CSV IMPORT / REBUILD =================
function dedupeDatasetRows(rows) {
  const seen = new Set()
  const result = []

  rows.forEach((row) => {
    const key = [
      row.sessionId || "",
      row.timestamp || "",
      row.label || "",
      Number(row.lat || 0).toFixed(6),
      Number(row.lng || 0).toFixed(6)
    ].join("|")

    if (!seen.has(key)) {
      seen.add(key)
      result.push(row)
    }
  })

  return result
}

function normalizeImportedRow(row) {
  const normalized = { ...row }

  normalized.lat = Number(row.lat)
  normalized.lng = Number(row.lng)
  normalized.speed = Number(row.speed || 0)
  normalized.acceleration = Number(row.acceleration || 0)
  normalized.deceleration = Number(row.deceleration || row.decel || 0)
  normalized.accelY = Number(row.accelY || 0)
  normalized.sensorDecel = Number(row.sensorDecel || 0)
  normalized.gpsDecel = Number(row.gpsDecel || 0)
  normalized.peakDecel = Number(row.peakDecel || 0)
  normalized.totalDistance = Number(row.totalDistance || 0)
  normalized.distance = Number(row.distance || 0)
  normalized.riskScore = row.riskScore != null && row.riskScore !== "" ? Number(row.riskScore) : undefined
  normalized.markerEvent =
    row.markerEvent === true ||
    row.markerEvent === "true" ||
    ["HARD_BRAKE", "BRAKE", "SLOW_BRAKE", "POTHOLE", "ROUGH_ROAD"].includes(normalizeEventLabel(row.label, row.type))

  normalized.instantMarker = row.instantMarker === true || row.instantMarker === "true"
  normalized.label = normalizeEventLabel(row.label, row.type)

  return normalized
}

function parseCSVLine(line) {
  const result = []
  let current = ""
  let insideQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    const next = line[i + 1]

    if (ch === '"') {
      if (insideQuotes && next === '"') {
        current += '"'
        i++
      } else {
        insideQuotes = !insideQuotes
      }
    } else if (ch === "," && !insideQuotes) {
      result.push(current)
      current = ""
    } else {
      current += ch
    }
  }

  result.push(current)
  return result
}

function importCSV(mode = "append") {
  const fileInput = document.getElementById("csvFileInput")
  const file = fileInput?.files?.[0]

  if (!file) {
    alert("Please select a CSV file first.")
    return
  }

  const reader = new FileReader()

  reader.onload = function (e) {
    const text = e.target.result
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "")

    if (lines.length < 2) {
      alert("CSV file is empty or invalid.")
      return
    }

    const headers = parseCSVLine(lines[0]).map(h => h.trim())

    const parsedData = lines.slice(1).map((line) => {
      const values = parseCSVLine(line)
      const row = {}

      headers.forEach((header, i) => {
        row[header] = values[i] != null ? values[i] : ""
      })

      return normalizeImportedRow(row)
    })

    if (mode === "replace") {
      dataset = parsedData
    } else {
      dataset = dedupeDatasetRows([...dataset, ...parsedData])
    }

    localStorage.setItem("moto_dataset", JSON.stringify(dataset))
    rebuildZonesFromDataset()
    renderHistoricalEventMarkers()
    renderDangerZones()
    updateSummary()
    updateASummary()

    alert(`CSV imported successfully. Mode: ${mode}. Rows loaded: ${parsedData.length}`)
  }

  reader.readAsText(file)
}

function rebuildZonesFromDataset() {
  dangerZones = []
  alertedZones.clear()

  const validRows = dataset.filter((row) => {
    const label = normalizeEventLabel(row.label, row.type)
    return (
      Number.isFinite(Number(row.lat)) &&
      Number.isFinite(Number(row.lng)) &&
      ["HARD_BRAKE", "BRAKE", "SLOW_BRAKE", "POTHOLE", "ROUGH_ROAD"].includes(label)
    )
  })

  validRows.forEach((rawRow) => {
    const row = normalizeImportedRow(rawRow)
    addDangerZone(row)
  })

  saveDangerZones()
  renderDangerZones()
  updateASummary()
}

// ================= LEGEND / FILTERS =================
function createMapLegendAndFilters() {
  if (!map) return

  const legend = L.control({ position: "bottomright" })

  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend")
    div.style.background = "rgba(20,20,20,0.9)"
    div.style.color = "#fff"
    div.style.padding = "10px 12px"
    div.style.borderRadius = "10px"
    div.style.fontSize = "12px"
    div.style.lineHeight = "1.6"
    div.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)"
    div.style.maxWidth = "230px"

    div.innerHTML = `
      <div style="font-weight:700; margin-bottom:6px;">Map Filters</div>

      <label><input type="checkbox" data-filter="HARD_BRAKE" checked> Hard Brake</label><br>
      <label><input type="checkbox" data-filter="BRAKE" checked> Brake</label><br>
      <label><input type="checkbox" data-filter="SLOW_BRAKE" checked> Slow Brake</label><br>
      <label><input type="checkbox" data-filter="POTHOLE" checked> Pothole</label><br>
      <label><input type="checkbox" data-filter="ROUGH_ROAD" checked> Rough Road</label><br>
      <label><input type="checkbox" data-filter="ZONES" checked> Risk Zones</label>

      <hr style="border-color:rgba(255,255,255,0.15); margin:8px 0;">

      <div style="font-weight:700; margin-bottom:4px;">Legend</div>
      <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ff4d6d;margin-right:6px;"></span>Hard Brake</div>
      <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ffd166;margin-right:6px;"></span>Brake</div>
      <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#80ed99;margin-right:6px;"></span>Slow Brake</div>
      <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#5f3dc4;margin-right:6px;"></span>Pothole</div>
      <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#845ef7;margin-right:6px;"></span>Rough Road</div>
      <div><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#69db7c;margin-right:6px;border:1px solid #fff3;"></span>Low Zone</div>
      <div><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ffd43b;margin-right:6px;border:1px solid #fff3;"></span>Medium Zone</div>
      <div><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#f76707;margin-right:6px;border:1px solid #fff3;"></span>High Zone</div>
      <div><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ff4d6d;margin-right:6px;border:1px solid #fff3;"></span>Severe Zone</div>
    `

    L.DomEvent.disableClickPropagation(div)
    L.DomEvent.disableScrollPropagation(div)

    setTimeout(() => {
      const checks = div.querySelectorAll("input[data-filter]")
      checks.forEach((cb) => {
        cb.addEventListener("change", (e) => {
          const key = e.target.getAttribute("data-filter")
          mapFilters[key] = e.target.checked
          refreshMapLayersFromState()
        })
      })
    }, 0)

    return div
  }

  legend.addTo(map)
}

// ================= HELPERS =================
let decelBuffer = []

function smoothValue(current, target, alpha = 0.2) {
  return current * (1 - alpha) + target * alpha
}

function clampDecel(value) {
  if (!isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 8) return 8
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
  const nodes = document.querySelectorAll("#phonePosText")
  nodes.forEach((el) => {
    el.innerText = value
  })
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

  const heroBrakeState = document.getElementById("heroBrakeState")
  const miniBrakeState = document.getElementById("miniBrakeState")
  const miniRoadState = document.getElementById("miniRoadState")
  const miniZoneState = document.getElementById("miniZoneState")
  const topRideMode = document.getElementById("topRideMode")
  const topAlertStatus = document.getElementById("topAlertStatus")

  if (heroBrakeState) heroBrakeState.innerText = `${mode} • ${road}`
  if (miniBrakeState) miniBrakeState.innerText = road.includes("Brake") ? road : zone
  if (miniRoadState) miniRoadState.innerText = road
  if (miniZoneState) miniZoneState.innerText = zone
  if (topRideMode) topRideMode.innerText = mode
  if (topAlertStatus) topAlertStatus.innerText = lastAlertType
}

function updateASummary() {
  const alertEl = document.getElementById("activeAlertCount")
  const zoneEl = document.getElementById("dangerZoneCount")
  const latencyEl = document.getElementById("lastAlertLatency")
  const typeEl = document.getElementById("lastAlertType")

  if (alertEl) alertEl.innerText = activeAlertCount
  if (zoneEl) zoneEl.innerText = dangerZones.length
  if (latencyEl) latencyEl.innerText = `${lastAlertLatencyMs} ms`
  if (typeEl) typeEl.innerText = lastAlertType
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
  if (now - lastVoiceTime < 2000) return
  lastVoiceTime = now

  if ("speechSynthesis" in window) {
    try {
      speechSynthesis.cancel()
      const msg = new SpeechSynthesisUtterance(text)
      msg.lang = "en-US"
      msg.rate = 1
      msg.pitch = 1
      msg.volume = 1
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
  }, 1600)
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
    navigator.vibrate([250, 80, 250, 80, 250])
  } else if (type === "normal") {
    navigator.vibrate([160, 60, 160])
  } else if (type === "soft") {
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

  const recentLabels = dataset.slice(-10).map((d) => d.label || "")
  if (recentLabels.includes("POTHOLE")) {
    road = "Pothole"
  } else if (recentLabels.includes("ROUGH_ROAD")) {
    road = "Rough Road"
  } else if (recentLabels.includes("ROAD_WORK")) {
    road = "Road Work"
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

        const zoneType = z.dominantType || z.type

        if (zoneType === "HARD_BRAKE") {
          raiseAlert({
            text: "⚠️ APPROACHING HARD BRAKE ZONE",
            color: "#ff4d6d",
            voiceText: "Warning approaching hard brake zone",
            vibration: "hard",
            chime: "alert",
            insightMode: "Warning",
            insightZone: "Risk Zone",
            insightRoad: "Brake Hotspot",
            alertType: "Approaching Hard Brake Zone",
            startTime: alertStart
          })
        } else if (zoneType === "BRAKE") {
          raiseAlert({
            text: "⚠️ BRAKE ZONE AHEAD",
            color: "#ffd166",
            voiceText: "Warning brake zone ahead",
            vibration: "normal",
            chime: "soft-alert",
            insightMode: "Warning",
            insightZone: "Brake Zone",
            insightRoad: "Frequent Braking",
            alertType: "Brake Zone",
            startTime: alertStart
          })
        } else if (zoneType === "POTHOLE") {
          raiseAlert({
            text: "⚠️ POTHOLE ZONE AHEAD",
            color: "#5f3dc4",
            voiceText: "Warning pothole zone ahead",
            vibration: "normal",
            chime: "soft-alert",
            insightMode: "Warning",
            insightZone: "Road Zone",
            insightRoad: "Pothole Area",
            alertType: "Pothole Zone",
            startTime: alertStart
          })
        } else if (zoneType === "ROUGH_ROAD") {
          raiseAlert({
            text: "⚠️ ROUGH ROAD AHEAD",
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
        } else if (zoneType === "ROAD_WORK") {
          raiseAlert({
            text: "🚧 DAMAGED ROAD AREA AHEAD",
            color: "#f08c00",
            voiceText: "Warning damaged road area ahead",
            vibration: "normal",
            chime: "soft-alert",
            insightMode: "Warning",
            insightZone: "Road Zone",
            insightRoad: "Damaged Road",
            alertType: "Damaged Road Area",
            startTime: alertStart
          })
        } else {
          raiseAlert({
            text: "⚠️ HAZARD AHEAD",
            color: "#f59f00",
            voiceText: "Warning hazard ahead",
            vibration: "normal",
            chime: "soft-alert",
            insightMode: "Warning",
            insightZone: "Road Zone",
            insightRoad: "Hazard",
            alertType: "Hazard Ahead",
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
        legend: { labels: { color: "rgba(255,255,255,0.85)" } }
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
        legend: { labels: { color: "rgba(255,255,255,0.85)" } }
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

  eventLayerGroup = L.layerGroup().addTo(map)

  heatLayer = L.heatLayer(heatPoints, { radius: 25, blur: 15, maxZoom: 17 }).addTo(map)

  routeLine = L.polyline(routePoints, {
    color: "#a5d8ff",
    weight: 4,
    opacity: 0.8
  }).addTo(map)

  const saved = localStorage.getItem("moto_dataset")
  if (saved) {
    dataset = JSON.parse(saved).map((d) => normalizeImportedRow(d))
  }

  loadDangerZones()

  if (dataset.length > 0) {
    rebuildZonesFromDataset()
    renderHistoricalEventMarkers()
  } else {
    renderDangerZones()
  }

  setPhonePosition(phonePosition)
  updateRecordingUI(false)
  updateSessionUI()
  updateInsights("Ready", "Normal", "Stable")
  updateSummary()
  updateASummary()

  const gpsNodes = document.querySelectorAll("#topGpsStatus")
  const sensorNodes = document.querySelectorAll("#topSensorStatus")
  gpsNodes.forEach((el) => { el.innerText = "Ready" })
  sensorNodes.forEach((el) => { el.innerText = "Active" })

  // createMapLegendAndFilters()
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
      lastLat = pos.coords.latitude
      lastLng = pos.coords.longitude

      currentLat = pos.coords.latitude
      currentLng = pos.coords.longitude

      resetBrakeWindow(Date.now(), 0)
      resetBrakeCandidates()

      routePoints = []
      if (routeLine) routeLine.setLatLngs(routePoints)

      updateRecordingUI(true)
      updateSessionUI()
      updateInsights("Angel Active", "Monitoring", "Stable")

      const gpsNodes = document.querySelectorAll("#topGpsStatus")
      const sensorNodes = document.querySelectorAll("#topSensorStatus")
      gpsNodes.forEach((el) => { el.innerText = "Tracking" })
      sensorNodes.forEach((el) => { el.innerText = "Live" })

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
  updateSessionUI()
  updateInsights("Idle", "Normal", "Stable")

  const gpsNodes = document.querySelectorAll("#topGpsStatus")
  const sensorNodes = document.querySelectorAll("#topSensorStatus")
  gpsNodes.forEach((el) => { el.innerText = "Paused" })
  sensorNodes.forEach((el) => { el.innerText = "Waiting" })
}

// ================= ROAD CLASSIFIER =================
function classifyRoadEvent(speed, dt, decel, speedDropShort) {
  if (speed < MIN_SPEED_FOR_ROAD_EVENT) {
    return { isPothole: false, isRoughRoad: false }
  }

  const accelAbs = Math.abs(accelY)

  const isPothole =
    accelAbs >= POTHOLE_THRESHOLD &&
    dt <= ROAD_EVENT_MAX_DT &&
    speedDropShort <= POTHOLE_MAX_SPEED_DROP &&
    decel < BRAKE_THRESHOLD

  const isRoughRoad =
    !isPothole &&
    accelAbs >= ROUGH_ROAD_ACCEL_THRESHOLD &&
    dt <= ROAD_EVENT_MAX_DT &&
    speedDropShort < 2.0 &&
    decel < HARD_BRAKE_THRESHOLD

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
    if (dt <= 0) return

    const dv = speed - lastSpeed
    const acceleration = dv / dt

    totalDistance += speed * dt / 3600
    updateSessionUI()

    const sensorDecel = clampDecel(-smoothAccel)
    const gpsDecel = clampDecel(-(dv / dt))
    let decel = Math.max(sensorDecel * 0.45, gpsDecel)

    if (speed < MIN_MOVING_SPEED) {
      resetBrakeCandidates()
      lastSpeed = speed
      lastTime = now
      lastLat = lat
      lastLng = lng
      syncSystemMode()
      logLatency("updateSpeed", startTime)
      return
    }

    if (Math.abs(sensorDecel) < 0.35 && Math.abs(gpsDecel) < 0.35) {
      lastSpeed = speed
      lastTime = now
      lastLat = lat
      lastLng = lng
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
      lastLat = lat
      lastLng = lng
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

    const brakeLevel = getBrakeLevelFromDecel(decel)

    const likelyBrake =
      speed >= MIN_MOVING_SPEED &&
      !isPothole &&
      !isRoughRoad &&
      (
        gpsDecel > 1.0 ||
        decel > BRAKE_THRESHOLD
      ) &&
      (
        (brakeLevel === "SLOW" && speedDropShort >= 1.5) ||
        (brakeLevel === "NORMAL" && speedDropShort >= MIN_BRAKE_SPEED_DROP) ||
        (brakeLevel === "HARD" && speedDropShort >= MIN_HARD_BRAKE_SPEED_DROP)
      )

    if (likelyBrake) {
      if (brakeLevel === "HARD") {
        hardBrakeCandidateFrames += 2
        brakeCandidateFrames += 1
      } else if (brakeLevel === "NORMAL") {
        brakeCandidateFrames += 1
        hardBrakeCandidateFrames = Math.max(0, hardBrakeCandidateFrames - 1)
      } else if (brakeLevel === "SLOW") {
        brakeCandidateFrames += 1
        hardBrakeCandidateFrames = Math.max(0, hardBrakeCandidateFrames - 1)
      }
    } else {
      brakeCandidateFrames = Math.max(0, brakeCandidateFrames - 1)
      hardBrakeCandidateFrames = Math.max(0, hardBrakeCandidateFrames - 2)
    }

    if (canRaiseBrakeAlert()) {
      if (
        (hardBrakeCandidateFrames >= 1 && speedDropShort >= MIN_HARD_BRAKE_SPEED_DROP) ||
        (brakeLevel === "HARD" && gpsDecel > 1.8)
      ) {
        triggerBrakeFlash("HARD")
        raiseAlert({
          text: "🔴 HARD BRAKE",
          color: "#ff4d6d",
          voiceText: "Hard brake detected",
          vibration: "hard",
          chime: "alert",
          insightMode: "Alert",
          insightZone: "Brake Event",
          insightRoad: "Hard Brake",
          alertType: "Hard Brake",
          startTime: startTime
        })
        markBrakeAlertNow()

        if (canDropBrakeMarkerNow()) {
          const hardBrakeRow = {
            sessionId: currentSessionId,
            phonePosition: phonePosition,
            timestamp: now,
            time: new Date(now).toLocaleTimeString(),
            event: "brake_alert",
            type: "HARD",
            speed,
            deceleration: decel,
            sensorDecel,
            gpsDecel,
            peakDecel: peakDecel || decel,
            lat,
            lng,
            totalDistance,
            label: "HARD_BRAKE",
            markerEvent: true,
            instantMarker: true
          }

          hardBrakeRow.riskScore = computeEventRiskScore(hardBrakeRow)
          dataset.push(hardBrakeRow)
          addEventMarker(hardBrakeRow)
          addDangerZone(hardBrakeRow)
          markBrakeMarkerNow()
        }
      } else if (
        brakeCandidateFrames >= 1 &&
        speedDropShort >= MIN_BRAKE_SPEED_DROP
      ) {
        triggerBrakeFlash("NORMAL")
        raiseAlert({
          text: "🟡 BRAKE DETECTED",
          color: "#ffd166",
          voiceText: "Brake detected",
          vibration: "normal",
          chime: "soft-alert",
          insightMode: "Active",
          insightZone: "Brake Event",
          insightRoad: "Normal Brake",
          alertType: "Normal Brake",
          startTime: startTime
        })
        markBrakeAlertNow()

        if (canDropBrakeMarkerNow()) {
          const brakeAlertRow = {
            sessionId: currentSessionId,
            phonePosition: phonePosition,
            timestamp: now,
            time: new Date(now).toLocaleTimeString(),
            event: "brake_alert",
            type: "NORMAL",
            speed,
            deceleration: decel,
            sensorDecel,
            gpsDecel,
            peakDecel: peakDecel || decel,
            lat,
            lng,
            totalDistance,
            label: "BRAKE",
            markerEvent: true,
            instantMarker: true
          }

          brakeAlertRow.riskScore = computeEventRiskScore(brakeAlertRow)
          dataset.push(brakeAlertRow)
          addEventMarker(brakeAlertRow)
          addDangerZone(brakeAlertRow)
          markBrakeMarkerNow()
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

      if (decel >= BRAKE_THRESHOLD || speedDropShort >= 1.0) brakeFrames++
      else brakeFrames = Math.max(0, brakeFrames - 1)

      if (decel >= HARD_BRAKE_THRESHOLD || speedDropShort >= 1.8) hardBrakeFrames++
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
        }

        if (brakeStart && decel < 0.9 && speedDropShort < 0.5) {
          if (brakeConfirmedType) logBrake(lat, lng, brakeConfirmedType)
          brakeStart = null
          resetBrakeWindow(now, speed)
        }
      }
    } else {
      resetBrakeWindow(now, speed)
    }

    if (isPothole && now - lastRoadEventTime > 900) {
      lastRoadEventTime = now
      const alertStart = Date.now()

      raiseAlert({
        text: "🕳 POTHOLE",
        color: "#5f3dc4",
        voiceText: "Warning pothole detected",
        vibration: "normal",
        chime: "alert",
        insightMode: "Alert",
        insightZone: "Road Hazard",
        insightRoad: "Pothole",
        alertType: "Pothole",
        startTime: alertStart
      })

      const potholeRow = {
        sessionId: currentSessionId,
        phonePosition: phonePosition,
        timestamp: now,
        time: new Date(now).toLocaleTimeString(),
        event: "pothole",
        speed,
        deceleration: decel,
        accelY,
        sensorDecel,
        gpsDecel,
        peakDecel: peakDecel || decel,
        lat,
        lng,
        totalDistance,
        label: "POTHOLE",
        markerEvent: true
      }

      potholeRow.riskScore = computeEventRiskScore(potholeRow)
      dataset.push(potholeRow)
      addEventMarker(potholeRow)
      addPotholeZone(potholeRow)
    }

    if (isRoughRoad && now - lastRoadEventTime > ROUGH_ROAD_REPEAT_MS) {
      lastRoadEventTime = now
      const alertStart = Date.now()

      raiseAlert({
        text: "⚠️ ROUGH ROAD",
        color: "#6741d9",
        voiceText: "Warning rough road ahead",
        vibration: "normal",
        chime: "soft-alert",
        insightMode: "Alert",
        insightZone: "Road Hazard",
        insightRoad: "Rough Road",
        alertType: "Rough Road",
        startTime: alertStart
      })

      const roughRoadRow = {
        sessionId: currentSessionId,
        phonePosition: phonePosition,
        timestamp: now,
        time: new Date(now).toLocaleTimeString(),
        event: "rough_road",
        speed,
        deceleration: decel,
        accelY,
        sensorDecel,
        gpsDecel,
        peakDecel: peakDecel || decel,
        lat,
        lng,
        totalDistance,
        label: "ROUGH_ROAD",
        markerEvent: true
      }

      roughRoadRow.riskScore = computeEventRiskScore(roughRoadRow)
      dataset.push(roughRoadRow)
      addEventMarker(roughRoadRow)
      addRoughRoadZone(roughRoadRow)
    }

    const t = new Date().toLocaleTimeString()

    chart.data.labels.push(t)
    chart.data.datasets[0].data.push(speed)

    decelChart.data.labels.push(t)
    decelChart.data.datasets[0].data.push(decel)
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
      label,
      markerEvent: false
    })

    updateSummary()
    syncSystemMode()
  }

  lastSpeed = speed
  lastTime = now
  lastLat = lat
  lastLng = lng
  logLatency("updateSpeed", startTime)
}

// ================= BRAKE EVENT =================
function logBrake(lat, lng, forcedType = null) {
  totalBrakes++

  let type = "SLOW"

  if (forcedType === "HARD") {
    type = "HARD"
  } else if (forcedType === "NORMAL") {
    type = "NORMAL"
  } else {
    if (peakDecel >= HARD_BRAKE_THRESHOLD) {
      type = "HARD"
    } else if (peakDecel >= BRAKE_THRESHOLD) {
      type = "NORMAL"
    }
  }

  if (type === "HARD") {
    hardBrakes++
    const alertStart = Date.now()

    raiseAlert({
      text: "🔴 HARD BRAKE",
      color: "#ff4d6d",
      voiceText: "Warning hard brake detected",
      vibration: "hard",
      chime: "alert",
      insightMode: "Alert",
      insightZone: "Risk Zone",
      insightRoad: "Harsh Braking",
      alertType: "Hard Brake",
      startTime: alertStart
    })

    triggerEffect()
    triggerBrakeFlash("HARD")
  } else if (type === "NORMAL") {
    normalBrakes++
    const alertStart = Date.now()

    raiseAlert({
      text: "🟡 BRAKE DETECTED",
      color: "#ffd166",
      voiceText: "Brake detected",
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
      text: "🟢 SLOWDOWN",
      color: "#80ed99",
      voiceText: "Slow down",
      vibration: "soft",
      chime: "soft-alert",
      insightMode: "Active",
      insightZone: "Slowdown",
      insightRoad: "Slow Brake",
      alertType: "Slow Brake",
      startTime: alertStart
    })

    triggerBrakeFlash("SLOW")
  }

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

  const normalizedLabel =
    type === "HARD" ? "HARD_BRAKE" :
    type === "NORMAL" ? "BRAKE" :
    "SLOW_BRAKE"

  const brakeRow = {
    sessionId: currentSessionId,
    phonePosition: phonePosition,
    timestamp: Date.now(),
    time: new Date().toLocaleTimeString(),
    event: "brake",
    type,
    speed: Number(document.getElementById("speed")?.innerText || 0),
    risk,
    style,
    peakDecel,
    distance: brakeDistance,
    lat,
    lng,
    totalDistance,
    label: normalizedLabel,
    markerEvent: true
  }

  brakeRow.riskScore = computeEventRiskScore(brakeRow)

  const recentInstantSameSpot = dataset.some((d) => {
    if (!d || !d.instantMarker) return false
    const sameLabel = normalizeEventLabel(d.label, d.type) === normalizedLabel
    const closeTime = Math.abs(Number(d.timestamp || 0) - Number(brakeRow.timestamp || 0)) <= 1800
    const closeDist =
      Number.isFinite(Number(d.lat)) &&
      Number.isFinite(Number(d.lng)) &&
      getDistanceMeters(Number(d.lat), Number(d.lng), Number(lat), Number(lng)) <= 20

    return sameLabel && closeTime && closeDist
  })

  dataset.push(brakeRow)

  if (!recentInstantSameSpot) {
    addEventMarker(brakeRow)
    addDangerZone(brakeRow)
  }

  document.getElementById("total").innerText = totalBrakes
  document.getElementById("hard").innerText = hardBrakes
  document.getElementById("brakeDist").innerText = brakeDistance.toFixed(2)

  updateSummary()
  syncSystemMode()

  peakDecel = 0
  brakeConfirmedType = null
}

// ================= SUMMARY =================
function updateSummary() {
  const decels = dataset
    .map((d) => Number(d.deceleration || 0))
    .filter((v) => isFinite(v) && v > 0 && v <= 8)

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
    "sessionId,phonePosition,timestamp,time,duration,speed,acceleration,deceleration,accelY,sensorDecel,gpsDecel,lat,lng,totalDistance,event,type,risk,style,peakDecel,distance,label,riskScore,markerEvent,instantMarker\n"

  dataset.forEach((d) => {
    csv += `${d.sessionId || ""},${d.phonePosition || ""},${d.timestamp || ""},${d.time || ""},${d.duration || ""},${d.speed || ""},${d.acceleration || ""},${d.deceleration || ""},${d.accelY || ""},${d.sensorDecel || ""},${d.gpsDecel || ""},${d.lat || ""},${d.lng || ""},${d.totalDistance || ""},${d.event || ""},${d.type || ""},${d.risk || ""},${d.style || ""},${d.peakDecel || ""},${d.distance || ""},${d.label || ""},${d.riskScore || ""},${d.markerEvent || false},${d.instantMarker || false}\n`
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
  const row = {
    sessionId: currentSessionId,
    phonePosition: phonePosition,
    timestamp: Date.now(),
    time: new Date().toLocaleTimeString(),
    manual: true,
    lat: currentLat,
    lng: currentLng,
    label: normalizeEventLabel(type),
    markerEvent: true
  }

  row.riskScore = computeEventRiskScore(row)

  dataset.push(row)
  addEventMarker(row)
  addDangerZone(row)

  showPopup("Marked: " + type, "#339af0")
}
function clearZonesOnly() {
  dangerZones = []
  alertedZones.clear()
  saveDangerZones()
  renderDangerZones()
  updateASummary()
  alert("All zones were cleared.")
}
// ================= AUTO SAVE =================
setInterval(() => {
  if (dataset.length > 0) {
    localStorage.setItem("moto_dataset", JSON.stringify(dataset))
  }
}, 5000)
