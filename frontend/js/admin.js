let map;
let markers = [];
let adminUserLocationMarker = null;
let sessionId;
let allReports = [];
let filteredReports = [];
let detailMap = null;
let reportsRealtimeSocket = null;
let reportsRealtimeReconnectTimer = null;
let reportsRealtimeReloadTimer = null;
let shouldReconnectRealtime = true;
let hasInitializedReportBaseline = false;
let knownReportIdSet = new Set();
let alarmAudioUnlocked = false;
let pendingAlarmPlayback = false;
let markerByReportId = new Map();
const highlightedReportIds = new Set();
const reportedReportIds = new Set();
let pendingActionReportId = null;
const reportedDetailById = new Map();

function createInlineMarkerIcon(color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 22.7 12.5 41 12.5 41S25 22.7 25 12.5C25 5.6 19.4 0 12.5 0Z"
            fill="${color}" stroke="#ffffff" stroke-width="1.2"/>
      <circle cx="12.5" cy="12.5" r="4.2" fill="#ffffff"/>
    </svg>
  `.trim();

  return new L.Icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
  });
}

const orangeMarkerIcon = createInlineMarkerIcon('#f59e0b');
const blueMarkerIcon = createInlineMarkerIcon('#3b82f6');
const greenMarkerIcon = createInlineMarkerIcon('#22c55e');

const adminReportsFromInput = document.getElementById('adminReportsFrom');
const adminReportsToInput = document.getElementById('adminReportsTo');
const clearAdminReportFilterBtn = document.getElementById('clearAdminReportFilter');
const adminStreetLayerBtn = document.getElementById('adminStreetLayerBtn');
const adminSatelliteLayerBtn = document.getElementById('adminSatelliteLayerBtn');
const adminMapLocateBtn = document.getElementById('adminMapLocateBtn');
const adminMapClearBtn = document.getElementById('adminMapClearBtn');

const THAI_TIME_OPTIONS = {
  timeZone: 'Asia/Bangkok',
  hour12: false
};
const MAX_GPS_ACCURACY_METERS = 80;
let adminActiveBaseLayer = 'street';
const REALTIME_RECONNECT_DELAY_MS = 3000;
const REALTIME_RELOAD_DELAY_MS = 250;


document.addEventListener('DOMContentLoaded', async () => {
  sessionId = localStorage.getItem('sessionId') || '';

  const isAuthenticated = await checkAdminAuth();
  if (!isAuthenticated) {
    return;
  }

  applyDefaultTodayRange();
  initMap();
  initMapFullscreenControls();
  setupAlarmAudioUnlock();
  loadReports();
  initRealtimeReports();
  updateLastUpdateTime();
  setInterval(updateLastUpdateTime, 60000);

  if (adminReportsFromInput) {
    adminReportsFromInput.addEventListener('change', applyReportFilters);
  }
  if (adminReportsToInput) {
    adminReportsToInput.addEventListener('change', applyReportFilters);
  }
  if (clearAdminReportFilterBtn) {
    clearAdminReportFilterBtn.addEventListener('click', () => {
      applyDefaultTodayRange();
      applyReportFilters();
    });
  }
  if (adminMapLocateBtn) {
    adminMapLocateBtn.addEventListener('click', locateAdminCurrentPosition);
  }
  if (adminMapClearBtn) {
    adminMapClearBtn.addEventListener('click', clearAdminMapTempMarkers);
  }
});

// checkAdminAuth function is now in admin_user_management.js

function rebuildStatusStateFromReports() {
  highlightedReportIds.clear();
  reportedReportIds.clear();
  reportedDetailById.clear();

  allReports.forEach((report) => {
    const reportId = Number(report.id);
    if (!Number.isFinite(reportId)) {
      return;
    }

    if (Number(report.viewed) === 1 || report.viewed === true) {
      highlightedReportIds.add(reportId);
    }

    if (Number(report.reported) === 1 || report.reported === true) {
      reportedReportIds.add(reportId);
      const note = (report.report_note || '').trim();
      if (note) {
        reportedDetailById.set(reportId, note);
      }
    }
  });
}

function loadReportedState() {
  // deprecated
}

function saveReportedState() {
  // deprecated
}


function getMarkerIconByState(reportId) {
  if (reportedReportIds.has(reportId)) return greenMarkerIcon;
  if (highlightedReportIds.has(reportId)) return blueMarkerIcon;
  return orangeMarkerIcon;
}

function isReliableGpsPosition(position) {
  const accuracy = Number(position?.coords?.accuracy);
  return Number.isFinite(accuracy) && accuracy <= MAX_GPS_ACCURACY_METERS;
}

function showNoRealGpsAlert() {
  alert('ไม่พบสัญญาณ GPS จริงจากอุปกรณ์ (ความแม่นยำไม่พอ) กรุณาใช้มือถือที่เปิด GPS');
}

function initMap() {
  map = L.map('map').setView([13.7563, 100.5018], 11);

  const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  });

  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19
    }
  );

  streetLayer.addTo(map);
  setupAdminMapLayerToggle(streetLayer, satelliteLayer);
}

function setupAdminMapLayerToggle(streetLayer, satelliteLayer) {
  if (!adminStreetLayerBtn || !adminSatelliteLayerBtn) {
    return;
  }

  const applyLayer = (nextLayer) => {
    if (nextLayer === adminActiveBaseLayer) {
      return;
    }

    if (nextLayer === 'street') {
      if (map.hasLayer(satelliteLayer)) {
        map.removeLayer(satelliteLayer);
      }
      streetLayer.addTo(map);
      adminActiveBaseLayer = 'street';
    } else {
      if (map.hasLayer(streetLayer)) {
        map.removeLayer(streetLayer);
      }
      satelliteLayer.addTo(map);
      adminActiveBaseLayer = 'satellite';
    }

    adminStreetLayerBtn.classList.toggle('active', adminActiveBaseLayer === 'street');
    adminSatelliteLayerBtn.classList.toggle('active', adminActiveBaseLayer === 'satellite');
  };

  adminStreetLayerBtn.addEventListener('click', () => applyLayer('street'));
  adminSatelliteLayerBtn.addEventListener('click', () => applyLayer('satellite'));
}

function locateAdminCurrentPosition() {
  if (!navigator.geolocation) {
    alert('\u0e2d\u0e38\u0e1b\u0e01\u0e23\u0e13\u0e4c\u0e19\u0e35\u0e49\u0e44\u0e21\u0e48\u0e23\u0e2d\u0e07\u0e23\u0e31\u0e1a\u0e01\u0e32\u0e23\u0e23\u0e30\u0e1a\u0e38\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (!isReliableGpsPosition(position)) {
        showNoRealGpsAlert();
        return;
      }

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      map.setView([lat, lng], 15);

      if (adminUserLocationMarker) {
        map.removeLayer(adminUserLocationMarker);
      }

      adminUserLocationMarker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#28a745',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      }).addTo(map).bindPopup('\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19');
    },
    (error) => {
      console.error('Geolocation error:', error);
      alert('\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e23\u0e30\u0e1a\u0e38\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e44\u0e14\u0e49 \u0e01\u0e23\u0e38\u0e13\u0e32\u0e2d\u0e19\u0e38\u0e0d\u0e32\u0e15\u0e2a\u0e34\u0e17\u0e18\u0e34\u0e4c\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07');
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

function clearAdminMapTempMarkers() {
  if (adminUserLocationMarker) {
    map.removeLayer(adminUserLocationMarker);
    adminUserLocationMarker = null;
  }
}
function initMapFullscreenControls() {
  const container = document.getElementById('adminMapContainer');
  const openBtn = document.getElementById('openAdminMapFullscreenBtn');
  const closeBtn = document.getElementById('closeAdminMapFullscreenBtn');
  let fallbackFullscreen = false;

  if (!container || !openBtn || !closeBtn) {
    return;
  }

  const isNativeFullscreen = () =>
    Boolean(document.fullscreenElement || document.webkitFullscreenElement);

  const isFullscreen = () => isNativeFullscreen() || fallbackFullscreen;

  const enterFallbackFullscreen = () => {
    fallbackFullscreen = true;
    document.body.classList.add('map-force-fullscreen');
  };

  const exitFallbackFullscreen = () => {
    fallbackFullscreen = false;
    document.body.classList.remove('map-force-fullscreen');
  };

  const syncButtons = () => {
    const inFullscreen = isFullscreen();
    openBtn.style.display = inFullscreen ? 'none' : 'inline-block';
    closeBtn.style.display = inFullscreen ? 'inline-block' : 'none';
    map.invalidateSize();
    setTimeout(() => map.invalidateSize(), 150);
  };

  openBtn.addEventListener('click', async () => {
    try {
      const root = document.documentElement;
      if (root.requestFullscreen) {
        await root.requestFullscreen();
      } else if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
      }
    } catch (err) {
      console.error('Failed to enter fullscreen:', err);
    } finally {
      enterFallbackFullscreen();
      syncButtons();
    }
  });

  closeBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      } else if (fallbackFullscreen) {
        exitFallbackFullscreen();
        syncButtons();
      }
    } catch (err) {
      console.error('Failed to exit fullscreen:', err);
      if (fallbackFullscreen) {
        exitFallbackFullscreen();
        syncButtons();
      }
    }
  });

  document.addEventListener('fullscreenchange', syncButtons);
  document.addEventListener('webkitfullscreenchange', syncButtons);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      exitFallbackFullscreen();
      syncButtons();
    }
  });
  document.addEventListener('webkitfullscreenchange', () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      exitFallbackFullscreen();
      syncButtons();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fallbackFullscreen) {
      exitFallbackFullscreen();
      syncButtons();
    }
  });
}

async function loadReports() {
  try {
    const response = await fetch('/reports');

    if (!response.ok) {
      throw new Error('\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e42\u0e2b\u0e25\u0e14\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e44\u0e14\u0e49');
    }

    allReports = await response.json();
    processNewReportAlarm(allReports);
    rebuildStatusStateFromReports();
    applyReportFilters();
  } catch (error) {
    console.error('Load reports error:', error);
    allReports = [];
    filteredReports = [];
    updateDashboard();
    displayReportsTable();
    updateMap();
    showMessage('dashboardMessage', '\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e42\u0e2b\u0e25\u0e14\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e44\u0e14\u0e49', 'error');
    showMessage('reportsMessage', '\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e42\u0e2b\u0e25\u0e14\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e44\u0e14\u0e49', 'error');
  }
}

function processNewReportAlarm(reports) {
  const nextIdSet = new Set(
    (Array.isArray(reports) ? reports : [])
      .map((report) => Number(report?.id))
      .filter(Number.isFinite)
  );

  if (!hasInitializedReportBaseline) {
    knownReportIdSet = nextIdSet;
    hasInitializedReportBaseline = true;
    return;
  }

  let hasNewReport = false;
  nextIdSet.forEach((id) => {
    if (!knownReportIdSet.has(id)) {
      hasNewReport = true;
    }
  });

  knownReportIdSet = nextIdSet;

  if (hasNewReport) {
    playAdminAlarm();
  }
}

function initRealtimeReports() {
  shouldReconnectRealtime = true;
  connectRealtimeReportsSocket();
}

function playAdminAlarm() {
  const alarmAudio = document.getElementById('alarmAudio');
  if (!alarmAudio) {
    return;
  }

  if (!alarmAudioUnlocked) {
    pendingAlarmPlayback = true;
  }

  try {
    alarmAudio.currentTime = 0;
    const playPromise = alarmAudio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        pendingAlarmPlayback = true;
      });
    }
  } catch (_) {
    pendingAlarmPlayback = true;
  }
}

function setupAlarmAudioUnlock() {
  const alarmAudio = document.getElementById('alarmAudio');
  if (!alarmAudio) {
    return;
  }

  alarmAudio.load();
  alarmAudio.playsInline = true;

  const removeUnlockListeners = () => {
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('click', unlock, true);
    document.removeEventListener('touchstart', unlock, true);
    document.removeEventListener('mousedown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };

  const unlock = () => {
    if (alarmAudioUnlocked) {
      return;
    }

    alarmAudio.muted = true;
    const promise = alarmAudio.play();
    if (!promise || typeof promise.then !== 'function') {
      alarmAudioUnlocked = true;
      alarmAudio.muted = false;
      return;
    }

    promise.then(() => {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
      alarmAudio.muted = false;
      alarmAudioUnlocked = true;
      removeUnlockListeners();

      if (pendingAlarmPlayback) {
        pendingAlarmPlayback = false;
        playAdminAlarm();
      }
    }).catch(() => {
      alarmAudio.muted = false;
    });
  };

  // Try once immediately (some browsers allow muted autoplay right away).
  unlock();

  // Use capture phase so unlock still works even if page components stop event bubbling.
  document.addEventListener('pointerdown', unlock, { passive: true, capture: true });
  document.addEventListener('click', unlock, { passive: true, capture: true });
  document.addEventListener('touchstart', unlock, { passive: true, capture: true });
  document.addEventListener('mousedown', unlock, { passive: true, capture: true });
  document.addEventListener('keydown', unlock, true);
}

function connectRealtimeReportsSocket() {
  if (!('WebSocket' in window)) {
    return;
  }

  if (reportsRealtimeSocket && (
    reportsRealtimeSocket.readyState === WebSocket.OPEN ||
    reportsRealtimeSocket.readyState === WebSocket.CONNECTING
  )) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  reportsRealtimeSocket = new WebSocket(wsUrl);

  reportsRealtimeSocket.onopen = () => {
    if (reportsRealtimeReconnectTimer) {
      clearTimeout(reportsRealtimeReconnectTimer);
      reportsRealtimeReconnectTimer = null;
    }
  };

  reportsRealtimeSocket.onmessage = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (_) {
      return;
    }

    if (payload?.type === 'reports_updated') {
      scheduleRealtimeReportsReload();
    }
  };

  reportsRealtimeSocket.onclose = () => {
    reportsRealtimeSocket = null;
    if (!shouldReconnectRealtime) {
      return;
    }
    if (reportsRealtimeReconnectTimer) {
      return;
    }
    reportsRealtimeReconnectTimer = setTimeout(() => {
      reportsRealtimeReconnectTimer = null;
      connectRealtimeReportsSocket();
    }, REALTIME_RECONNECT_DELAY_MS);
  };

  reportsRealtimeSocket.onerror = () => {
    if (reportsRealtimeSocket) {
      reportsRealtimeSocket.close();
    }
  };
}

function scheduleRealtimeReportsReload() {
  if (reportsRealtimeReloadTimer) {
    return;
  }

  reportsRealtimeReloadTimer = setTimeout(() => {
    reportsRealtimeReloadTimer = null;
    loadReports();
  }, REALTIME_RELOAD_DELAY_MS);
}

function stopRealtimeReports() {
  shouldReconnectRealtime = false;

  if (reportsRealtimeReconnectTimer) {
    clearTimeout(reportsRealtimeReconnectTimer);
    reportsRealtimeReconnectTimer = null;
  }

  if (reportsRealtimeReloadTimer) {
    clearTimeout(reportsRealtimeReloadTimer);
    reportsRealtimeReloadTimer = null;
  }

  if (reportsRealtimeSocket) {
    reportsRealtimeSocket.close();
    reportsRealtimeSocket = null;
  }
}

function applyReportFilters() {
  const hasAnyFilter = Boolean(adminReportsFromInput?.value || adminReportsToInput?.value);
  const fromDate = adminReportsFromInput?.value ? new Date(adminReportsFromInput.value) : (hasAnyFilter ? null : getTodayStart());
  const toDate = adminReportsToInput?.value ? new Date(adminReportsToInput.value) : (hasAnyFilter ? null : getTodayEnd());

  filteredReports = allReports.filter((report) => {
    const reportDate = parseReportDate(report.created_at);
    if (!reportDate) {
      return false;
    }
    if (fromDate && reportDate < fromDate) {
      return false;
    }
    if (toDate && reportDate > toDate) {
      return false;
    }
    return true;
  });

  updateDashboard();
  displayReportsTable();
  updateMap();
}

function updateDashboard() {
  document.getElementById('totalReports').textContent = filteredReports.length;
  document.getElementById('markerCount').textContent = filteredReports.length;
}

function updateMap() {
  markers.forEach((marker) => map.removeLayer(marker));
  markers = [];
  markerByReportId.clear();

  filteredReports.forEach((report) => {
    const lat = Number(report.latitude);
    const lng = Number(report.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const locationText = (report.location || '').trim() || '\u0e44\u0e21\u0e48\u0e23\u0e30\u0e1a\u0e38\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07';

    const markerIcon = getMarkerIconByState(report.id);
    const marker = L.marker([lat, lng], {
      title: locationText,
      icon: markerIcon
    }).addTo(map);

    marker.on('click', () => {
      openReportDetailFromMap(report.id);
    });
    markers.push(marker);
    markerByReportId.set(report.id, marker);
  });

  if (markers.length > 0) {
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.1), { maxZoom: 15, animate: false });
  }
}

function openReportDetailFromMap(reportId) {
  viewReportDetail(reportId);
}

function displayReportsTable() {
  const tbody = document.getElementById('reportsTableBody');

  if (!filteredReports.length) {
    tbody.innerHTML = '<tr style="text-align: center;"><td colspan="9">\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e43\u0e19\u0e0a\u0e48\u0e27\u0e07\u0e27\u0e31\u0e19\u0e40\u0e27\u0e25\u0e32\u0e17\u0e35\u0e48\u0e40\u0e25\u0e37\u0e2d\u0e01</td></tr>';
    return;
  }

  tbody.innerHTML = filteredReports.map((report, index) => {
    const formattedTime = formatThaiDateTime(report.created_at);
    const reportImages = getReportImages(report);
    const imageHtml = reportImages.length > 0
      ? `
        <button class="btn btn-sm btn-view"
                onclick="event.stopPropagation(); viewReportImages(${report.id})"
                style="padding: 4px 8px; font-size: 0.8rem; width: fit-content;">
          ดูรูป (${reportImages.length})
        </button>
      `
      : '-';

    const locationText = (report.location || '').trim() || '\u0e44\u0e21\u0e48\u0e23\u0e30\u0e1a\u0e38\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07';
    const phoneText = getReportPhone(report);
    const lat = Number(report.latitude);
    const lng = Number(report.longitude);
    const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lng);

    const googleMapsUrl = hasValidCoords
      ? `https://www.google.com/maps?q=${lat},${lng}&z=15`
      : '#';

    const coordsText = hasValidCoords
      ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      : '\u0e44\u0e21\u0e48\u0e21\u0e35\u0e1e\u0e34\u0e01\u0e31\u0e14';

    const coordinatesCell = hasValidCoords
      ? `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="font-size: 0.85rem; color: #555;">${coordsText}</div>
          <button class="btn btn-sm btn-view"
                  onclick="event.stopPropagation(); window.open('${googleMapsUrl}', '_blank');"
                  style="padding: 4px 8px; font-size: 0.8rem; width: fit-content;">
            \u0e01\u0e14\u0e14\u0e39\u0e41\u0e1c\u0e19\u0e17\u0e35\u0e48
          </button>
        </div>
      `
      : `<div style="color: #999;">${coordsText}</div>`;

    const isReported = reportedReportIds.has(report.id);
    const isViewed = highlightedReportIds.has(report.id);
    const reportActionBtn = isReported
      ? `<button class="btn btn-sm btn-reported" onclick="event.stopPropagation(); viewActionReportModal(${report.id})">\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e41\u0e25\u0e49\u0e27</button>`
      : isViewed
        ? `<button class="btn btn-sm btn-await-report" onclick="event.stopPropagation(); openActionReportModal(${report.id})">\u0e23\u0e2d\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19</button>`
        : `<button class="btn btn-sm btn-report" onclick="event.stopPropagation(); openActionReportModal(${report.id})">\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e14\u0e39</button>`;

    return `
      <tr class="report-row" onclick="viewReportDetail(${report.id})">
        <td>${index + 1}</td>
        <td>${escapeHtml(report.reporter_name || '-')}</td>
        <td>${escapeHtml(phoneText)}</td>
        <td>${escapeHtml(locationText)}</td>
        <td>${coordinatesCell}</td>
        <td>${report.altitude !== null && report.altitude !== undefined && report.altitude !== '' ? `${escapeHtml(String(report.altitude))} \u0e21.` : '-'}</td>
        <td>${imageHtml}</td>
        <td>${escapeHtml(formattedTime)}</td>
        <td>
          <div class="report-actions">
            ${reportActionBtn}
            <button class="btn btn-sm btn-delete" onclick="event.stopPropagation(); deleteReport(${report.id}, '${escapeJs(locationText)}')">\u0e25\u0e1a</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
async function deleteReport(reportId, locationName) {
  if (!confirm(`\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e01\u0e32\u0e23\u0e25\u0e1a\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19 "${locationName}" ?`)) {
    return;
  }

  try {
    const response = await fetch(`/report/${reportId}`, {
      method: 'DELETE',
      headers: {
        'X-Session-Id': sessionId
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e25\u0e1a\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e44\u0e14\u0e49');
    }

    reportedReportIds.delete(reportId);
    reportedDetailById.delete(reportId);
    highlightedReportIds.delete(reportId);
    showMessage('reportsMessage', '\u0e25\u0e1a\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08', 'success');
    loadReports();
  } catch (error) {
    console.error('Delete report error:', error);
    showMessage('reportsMessage', error.message, 'error');
  }
}
async function changePassword() {
  const currentPassword = prompt('\u0e1b\u0e49\u0e2d\u0e19\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e1b\u0e31\u0e08\u0e08\u0e38\u0e1a\u0e31\u0e19:');
  if (!currentPassword) return;

  const newPassword = prompt('\u0e1b\u0e49\u0e2d\u0e19\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48:');
  if (!newPassword) return;

  const confirmPassword = prompt('\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48:');
  if (confirmPassword !== newPassword) {
    alert('\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e44\u0e21\u0e48\u0e15\u0e23\u0e07\u0e01\u0e31\u0e19');
    return;
  }

  if (newPassword.length < 4) {
    alert('\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e19\u0e49\u0e2d\u0e22 4 \u0e15\u0e31\u0e27\u0e2d\u0e31\u0e01\u0e29\u0e23');
    return;
  }

  try {
    const response = await fetch('/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e44\u0e14\u0e49');
    }

    alert('\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08');
  } catch (error) {
    console.error('Change password error:', error);
    alert(error.message);
  }
}

function changePasswordPrompt() {
  changePassword();
}

function logout() {
  if (!confirm('\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e01\u0e32\u0e23\u0e2d\u0e2d\u0e01\u0e08\u0e32\u0e01\u0e23\u0e30\u0e1a\u0e1a?')) {
    return;
  }

  stopRealtimeReports();

  fetch('/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sessionId })
  });

  localStorage.removeItem('sessionId');
  localStorage.removeItem('username');
  window.location.href = '/login.html';
}

function switchTab(tabName, evt) {
  document.querySelectorAll('.tab-content').forEach((tab) => {
    tab.classList.remove('active');
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.remove('active');
  });

  document.getElementById(tabName).classList.add('active');

  const clickedButton = evt?.currentTarget || window.event?.target;
  if (clickedButton) {
    clickedButton.classList.add('active');
  }
}

function showMessage(elementId, text, type) {
  const messageDiv = document.getElementById(elementId);
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.style.display = 'block';

  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 4000);
}

function viewImage(imageSrc) {
  if (!imageSrc) {
    return;
  }
  currentImageGallery = [imageSrc];
  currentImageGalleryIndex = 0;
  showCurrentGalleryImage();
}

let currentImageGallery = [];
let currentImageGalleryIndex = 0;

function viewReportImages(reportId) {
  const report = allReports.find((item) => Number(item.id) === Number(reportId));
  if (!report) {
    return;
  }

  const reportImages = getReportImages(report);
  if (!reportImages.length) {
    return;
  }

  currentImageGallery = reportImages.map((filename) => `/uploads/${filename}`);
  currentImageGalleryIndex = 0;
  showCurrentGalleryImage();
}

function showCurrentGalleryImage() {
  const modal = document.getElementById('imageModal');
  const modalImage = document.getElementById('modalImage');
  if (!modal || !modalImage || !currentImageGallery.length) {
    return;
  }

  const safeIndex = Math.min(Math.max(currentImageGalleryIndex, 0), currentImageGallery.length - 1);
  currentImageGalleryIndex = safeIndex;
  modalImage.src = currentImageGallery[safeIndex];
  modal.classList.add('active');

  const modalContent = modalImage.parentElement;
  if (!modalContent) {
    return;
  }

  let caption = modalContent.querySelector('.modal-gallery-caption');
  if (!caption) {
    caption = document.createElement('div');
    caption.className = 'modal-gallery-caption';
    modalContent.appendChild(caption);
  }

  if (currentImageGallery.length > 1) {
    caption.textContent = `รูปที่ ${safeIndex + 1}/${currentImageGallery.length} (กดที่รูปเพื่อดูถัดไป)`;
  } else {
    caption.textContent = 'รูปที่ 1/1';
  }
}

function closeImageModal() {
  currentImageGallery = [];
  currentImageGalleryIndex = 0;
  const imageModal = document.getElementById('imageModal');
  const modalImage = document.getElementById('modalImage');
  if (modalImage) {
    modalImage.src = '';
  }
  if (imageModal) {
    imageModal.classList.remove('active');
  }
}

function viewReportDetail(reportId) {
  const report = allReports.find((item) => item.id === reportId);
  if (!report) {
    return;
  }

  const locationText = (report.location || '').trim() || '\u0e44\u0e21\u0e48\u0e23\u0e30\u0e1a\u0e38\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07';
  const descriptionText = (report.description || '').trim() || '-';
  const phoneText = getReportPhone(report);
  const altitudeText = report.altitude !== null && report.altitude !== undefined && report.altitude !== ''
    ? `${escapeHtml(String(report.altitude))} ม.`
    : '-';
  const reportImages = getReportImages(report);
  const imagesHtml = reportImages.length > 0
    ? `
      <div class="detail-item full">
        <div class="detail-label">รูปภาพทั้งหมด (${reportImages.length})</div>
        <div class="detail-value" style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${reportImages.map((filename, index) => `
            <img src="/uploads/${filename}"
                 alt="ภาพรายงาน ${index + 1}"
                 style="width: 120px; height: 90px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 1px solid #ddd;"
                 onclick="event.stopPropagation(); viewImageGalleryByIndex(${report.id}, ${index})">
          `).join('')}
        </div>
      </div>
    `
    : '';

  const coordinateLat = Number(report.latitude);
  const coordinateLng = Number(report.longitude);
  const hasValidCoords = Number.isFinite(coordinateLat) && Number.isFinite(coordinateLng);
  const coordinateText = hasValidCoords
    ? `${coordinateLat.toFixed(4)}, ${coordinateLng.toFixed(4)}`
    : '-';
  const googleMapsUrl = hasValidCoords
    ? `https://www.google.com/maps?q=${coordinateLat},${coordinateLng}&z=15`
    : '';

  const content = `
    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-label">\u0e1c\u0e39\u0e49\u0e41\u0e08\u0e49\u0e07</div>
        <div class="detail-value">${escapeHtml(report.reporter_name || '-')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">\u0e40\u0e1a\u0e2d\u0e23\u0e4c\u0e42\u0e17\u0e23\u0e28\u0e31\u0e1e\u0e17\u0e4c</div>
        <div class="detail-value">${escapeHtml(phoneText)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">\u0e27\u0e31\u0e19\u0e40\u0e27\u0e25\u0e32</div>
        <div class="detail-value">${escapeHtml(formatThaiDateTime(report.created_at))}</div>
      </div>
      <div class="detail-item full">
        <div class="detail-label">\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07/\u0e2a\u0e16\u0e32\u0e19\u0e17\u0e35\u0e48</div>
        <div class="detail-value">${escapeHtml(locationText)}</div>
      </div>
      <div class="detail-item full">
        <div class="detail-label">\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14</div>
        <div class="detail-value">${escapeHtml(descriptionText)}</div>
      </div>
      <div class="detail-item full">
        <div class="detail-label">\u0e1e\u0e34\u0e01\u0e31\u0e14</div>
        <div class="detail-value">
          ${escapeHtml(coordinateText)}
          ${hasValidCoords ? `
            <div style="margin-top: 8px;">
              <button class="btn btn-sm btn-view"
                      onclick="event.stopPropagation(); window.open('${googleMapsUrl}', '_blank');"
                      style="padding: 4px 8px; font-size: 0.8rem; width: fit-content;">
                \u0e01\u0e14\u0e14\u0e39\u0e41\u0e1c\u0e19\u0e17\u0e35\u0e48
              </button>
            </div>
          ` : ''}
        </div>
      </div>
      <div class="detail-item">
        <div class="detail-label">\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e39\u0e07</div>
        <div class="detail-value">${altitudeText}</div>
      </div>
      ${imagesHtml}
    </div>
  `;

  document.getElementById('reportDetailContent').innerHTML = content;
  markReportViewed(report.id);

  document.getElementById('reportDetailModal').classList.add('active');
}

function renderReportDetailMap(report) {
  const container = document.getElementById('detailMapContainer');
  const wrap = document.getElementById('detailMapWrap');
  const openFullscreenBtn = document.getElementById('detailMapOpenFullscreenBtn');
  const closeFullscreenBtn = document.getElementById('detailMapCloseFullscreenBtn');
  const streetBtn = document.getElementById('detailMapStreetBtn');
  const satelliteBtn = document.getElementById('detailMapSatelliteBtn');
  const locateBtn = document.getElementById('detailMapLocateBtn');
  const clearBtn = document.getElementById('detailMapClearBtn');

  if (!container || !wrap) {
    return;
  }

  const lat = Number(report.latitude);
  const lng = Number(report.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    container.innerHTML = '<div style="padding: 12px; color: #666;">\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e1e\u0e34\u0e01\u0e31\u0e14\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e19\u0e35\u0e49</div>';
    return;
  }

  if (detailMap) {
    detailMap.remove();
    detailMap = null;
  }

  detailMap = L.map('detailMapContainer', {
    zoomControl: true,
    attributionControl: true
  }).setView([lat, lng], 15);

  const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  });

  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19
    }
  );

  const applyLayer = (nextLayer) => {
    if (!detailMap) {
      return;
    }

    if (nextLayer === 'satellite') {
      if (detailMap.hasLayer(streetLayer)) {
        detailMap.removeLayer(streetLayer);
      }
      satelliteLayer.addTo(detailMap);
    } else {
      if (detailMap.hasLayer(satelliteLayer)) {
        detailMap.removeLayer(satelliteLayer);
      }
      streetLayer.addTo(detailMap);
    }

    if (streetBtn) {
      streetBtn.classList.toggle('active', nextLayer === 'street');
    }
    if (satelliteBtn) {
      satelliteBtn.classList.toggle('active', nextLayer === 'satellite');
    }
  };

  applyLayer(adminActiveBaseLayer === 'satellite' ? 'satellite' : 'street');
  L.marker([lat, lng], { icon: getMarkerIconByState(report.id) }).addTo(detailMap);

  let tempUserMarker = null;

  if (locateBtn) {
    locateBtn.onclick = () => {
      if (!navigator.geolocation) {
        alert('\u0e2d\u0e38\u0e1b\u0e01\u0e23\u0e13\u0e4c\u0e19\u0e35\u0e49\u0e44\u0e21\u0e48\u0e23\u0e2d\u0e07\u0e23\u0e31\u0e1a\u0e01\u0e32\u0e23\u0e23\u0e30\u0e1a\u0e38\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!isReliableGpsPosition(position)) {
            showNoRealGpsAlert();
            return;
          }

          const uLat = position.coords.latitude;
          const uLng = position.coords.longitude;

          if (tempUserMarker) {
            detailMap.removeLayer(tempUserMarker);
          }

          tempUserMarker = L.circleMarker([uLat, uLng], {
            radius: 8,
            fillColor: '#28a745',
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
          }).addTo(detailMap).bindPopup('\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19');

          detailMap.setView([uLat, uLng], 15);
        },
        () => {
          alert('\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e23\u0e30\u0e1a\u0e38\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07\u0e44\u0e14\u0e49 \u0e01\u0e23\u0e38\u0e13\u0e32\u0e2d\u0e19\u0e38\u0e0d\u0e32\u0e15\u0e2a\u0e34\u0e17\u0e18\u0e34\u0e4c\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07');
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      if (tempUserMarker && detailMap) {
        detailMap.removeLayer(tempUserMarker);
        tempUserMarker = null;
      }
      detailMap.setView([lat, lng], 15);
    };
  }

  if (streetBtn) {
    streetBtn.onclick = () => applyLayer('street');
  }
  if (satelliteBtn) {
    satelliteBtn.onclick = () => applyLayer('satellite');
  }

  const syncFullscreenButtons = () => {
    const isFullscreen = wrap.classList.contains('is-fullscreen');
    if (openFullscreenBtn) {
      openFullscreenBtn.style.display = isFullscreen ? 'none' : 'inline-block';
    }
    if (closeFullscreenBtn) {
      closeFullscreenBtn.style.display = isFullscreen ? 'inline-block' : 'none';
    }
    if (detailMap) {
      detailMap.invalidateSize();
      setTimeout(() => detailMap.invalidateSize(), 120);
    }
  };

  if (openFullscreenBtn) {
    openFullscreenBtn.onclick = () => {
      wrap.classList.add('is-fullscreen');
      syncFullscreenButtons();
    };
  }

  if (closeFullscreenBtn) {
    closeFullscreenBtn.onclick = () => {
      wrap.classList.remove('is-fullscreen');
      syncFullscreenButtons();
    };
  }

  syncFullscreenButtons();
}

function closeReportDetailModal() {
  document.getElementById('reportDetailModal').classList.remove('active');
  const wrap = document.getElementById('detailMapWrap');
  if (wrap) {
    wrap.classList.remove('is-fullscreen');
  }
  if (detailMap) {
    detailMap.remove();
    detailMap = null;
  }
}



function openActionReportModal(reportId) {
  pendingActionReportId = reportId;
  const modal = document.getElementById('actionReportModal');
  const modalTitle = modal?.querySelector('h3');
  const detailInput = document.getElementById('actionReportDetail');
  const errorEl = document.getElementById('actionReportError');
  const cancelBtn = modal?.querySelector('.btn-cancel-report');
  const sendBtn = modal?.querySelector('.btn-send-report');
  if (!modal || !detailInput || !errorEl || !modalTitle || !cancelBtn || !sendBtn) return;

  modalTitle.textContent = '\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19';
  detailInput.readOnly = false;
  detailInput.value = '';
  detailInput.placeholder = '\u0e01\u0e23\u0e2d\u0e01\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e17\u0e35\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19...';
  errorEl.textContent = '';
  cancelBtn.textContent = '\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01';
  sendBtn.style.display = 'inline-block';
  modal.classList.add('active');
  setTimeout(() => detailInput.focus(), 0);
}

function viewActionReportModal(reportId) {
  const modal = document.getElementById('actionReportModal');
  const modalTitle = modal?.querySelector('h3');
  const detailInput = document.getElementById('actionReportDetail');
  const errorEl = document.getElementById('actionReportError');
  const cancelBtn = modal?.querySelector('.btn-cancel-report');
  const sendBtn = modal?.querySelector('.btn-send-report');
  if (!modal || !detailInput || !errorEl || !modalTitle || !cancelBtn || !sendBtn) return;

  const detailText = reportedDetailById.get(Number(reportId)) || '-';
  pendingActionReportId = Number(reportId);
  modalTitle.textContent = '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19';
  detailInput.value = detailText;
  detailInput.readOnly = true;
  errorEl.textContent = '';
  cancelBtn.textContent = '\u0e1b\u0e34\u0e14';
  sendBtn.style.display = 'none';
  modal.classList.add('active');
}

function closeActionReportModal() {
  const modal = document.getElementById('actionReportModal');
  const modalTitle = modal?.querySelector('h3');
  const detailInput = document.getElementById('actionReportDetail');
  const errorEl = document.getElementById('actionReportError');
  const cancelBtn = modal?.querySelector('.btn-cancel-report');
  const sendBtn = modal?.querySelector('.btn-send-report');

  if (errorEl) errorEl.textContent = '';
  if (detailInput) {
    detailInput.readOnly = false;
    detailInput.placeholder = '\u0e01\u0e23\u0e2d\u0e01\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e17\u0e35\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19...';
  }
  if (modalTitle) modalTitle.textContent = '\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19';
  if (cancelBtn) cancelBtn.textContent = '\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01';
  if (sendBtn) sendBtn.style.display = 'inline-block';
  if (modal) modal.classList.remove('active');
  pendingActionReportId = null;
}


async function submitActionReport() {
  const detailInput = document.getElementById('actionReportDetail');
  const errorEl = document.getElementById('actionReportError');
  if (!detailInput || !errorEl) return;

  const detailText = detailInput.value.trim();
  if (!detailText) {
    errorEl.textContent = '\u0e01\u0e23\u0e38\u0e13\u0e32\u0e01\u0e23\u0e2d\u0e01\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19';
    detailInput.focus();
    return;
  }

  const reportId = Number(pendingActionReportId);
  if (!Number.isFinite(reportId)) {
    errorEl.textContent = '\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e17\u0e35\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19';
    return;
  }

  try {
    const response = await fetch('/report/' + reportId + '/status', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId
      },
      body: JSON.stringify({
        viewed: true,
        reported: true,
        reportNote: detailText
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || '\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e44\u0e14\u0e49');
    }

    closeActionReportModal();
    await loadReports();
    showMessage('reportsMessage', '\u0e2a\u0e48\u0e07\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e40\u0e23\u0e35\u0e22\u0e1a\u0e23\u0e49\u0e2d\u0e22', 'success');
  } catch (error) {
    console.error('Submit action report error:', error);
    errorEl.textContent = error.message || '\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e2a\u0e48\u0e07\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e44\u0e14\u0e49';
  }
}

async function markReportViewed(reportId) {
  if (highlightedReportIds.has(reportId)) {
    return;
  }

  highlightedReportIds.add(reportId);

  const selectedMarker = markerByReportId.get(reportId);
  if (selectedMarker) {
    selectedMarker.setIcon(getMarkerIconByState(reportId));
    selectedMarker.setZIndexOffset(600);
  }

  displayReportsTable();

  try {
    const response = await fetch('/report/' + reportId + '/status', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId
      },
      body: JSON.stringify({ viewed: true })
    });

    if (!response.ok) {
      throw new Error('\\u0e44\\u0e21\\u0e48\\u0e2a\\u0e32\\u0e21\\u0e32\\u0e23\\u0e16\\u0e2d\\u0e31\\u0e1b\\u0e40\\u0e14\\u0e15\\u0e2a\\u0e16\\u0e32\\u0e19\\u0e30\\u0e01\\u0e32\\u0e23\\u0e40\\u0e1b\\u0e34\\u0e14\\u0e14\\u0e39\\u0e44\\u0e14\\u0e49');
    }

    const target = allReports.find((item) => Number(item.id) === Number(reportId));
    if (target) {
      target.viewed = 1;
    }
  } catch (error) {
    console.error('Mark viewed error:', error);
  }
}

function updateLastUpdateTime() {
  document.getElementById('lastUpdate').textContent = new Date().toLocaleString('th-TH', THAI_TIME_OPTIONS);
}


function updateLastUpdateTime() {
  document.getElementById('lastUpdate').textContent = new Date().toLocaleString('th-TH', THAI_TIME_OPTIONS);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text === null || text === undefined ? '' : String(text);
  return div.innerHTML;
}

function escapeJs(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}



function getReportPhone(report) {
  if (!report || typeof report !== 'object') {
    return '-';
  }

  const rawPhone =
    report.reporter_phone ??
    report.phone ??
    report.phone_number ??
    report.phoneNumber ??
    report.tel ??
    report.telephone ??
    '';

  const phoneText = String(rawPhone).trim();
  return phoneText || '-';
}

function getReportImages(report) {
  if (!report || typeof report !== 'object') {
    return [];
  }

  const list = [];
  if (Array.isArray(report.image_filenames)) {
    report.image_filenames.forEach((name) => {
      if (typeof name === 'string' && name.trim()) {
        list.push(name);
      }
    });
  }
  if (typeof report.image_filename === 'string' && report.image_filename.trim()) {
    list.unshift(report.image_filename);
  }

  return Array.from(new Set(list));
}

function viewImageGalleryByIndex(reportId, startIndex) {
  const report = allReports.find((item) => Number(item.id) === Number(reportId));
  if (!report) {
    return;
  }

  const reportImages = getReportImages(report);
  if (!reportImages.length) {
    return;
  }

  currentImageGallery = reportImages.map((filename) => `/uploads/${filename}`);
  currentImageGalleryIndex = Number.isFinite(Number(startIndex)) ? Number(startIndex) : 0;
  showCurrentGalleryImage();
}

function parseReportDate(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const hasTimezone = /[zZ]|[+\-]\d{2}:\d{2}$/.test(value);
    const normalized = hasTimezone ? value : value.replace(' ', 'T') + 'Z';
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatThaiDateTime(value) {
  const date = parseReportDate(value);
  if (!date) {
    return '-';
  }
  return date.toLocaleString('th-TH', THAI_TIME_OPTIONS);
}

function applyDefaultTodayRange() {
  if (adminReportsFromInput && !adminReportsFromInput.value) {
    adminReportsFromInput.value = toDateTimeLocalValue(getTodayStart());
  }
  if (adminReportsToInput && !adminReportsToInput.value) {
    adminReportsToInput.value = toDateTimeLocalValue(getTodayEnd());
  }
}

function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getTodayEnd() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function toDateTimeLocalValue(date) {
  const pad = (num) => String(num).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

window.addEventListener('beforeunload', () => {
  stopRealtimeReports();
});

window.addEventListener('click', (e) => {
  const imageModal = document.getElementById('imageModal');
  const detailModal = document.getElementById('reportDetailModal');
  const actionReportModal = document.getElementById('actionReportModal');
  if (e.target === imageModal) {
    closeImageModal();
  }
  if (e.target === detailModal) {
    closeReportDetailModal();
  }
  if (e.target === actionReportModal) {
    closeActionReportModal();
  }
});

document.addEventListener('keydown', (e) => {
  const imageModal = document.getElementById('imageModal');
  if (!imageModal || !imageModal.classList.contains('active') || !currentImageGallery.length) {
    return;
  }

  if (e.key === 'ArrowRight') {
    currentImageGalleryIndex = (currentImageGalleryIndex + 1) % currentImageGallery.length;
    showCurrentGalleryImage();
  } else if (e.key === 'ArrowLeft') {
    currentImageGalleryIndex = (currentImageGalleryIndex - 1 + currentImageGallery.length) % currentImageGallery.length;
    showCurrentGalleryImage();
  }
});

const modalImageEl = document.getElementById('modalImage');
if (modalImageEl) {
  modalImageEl.addEventListener('click', () => {
    if (!currentImageGallery.length) {
      return;
    }
    currentImageGalleryIndex = (currentImageGalleryIndex + 1) % currentImageGallery.length;
    showCurrentGalleryImage();
  });
}
