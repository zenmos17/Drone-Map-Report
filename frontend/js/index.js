let map;
let markers = [];
let userLocationMarker = null;
let selectedCoordsMarker = null;
let allReports = [];
let reporterProfile = null;

const REPORTER_SESSION_KEY = 'reporterProfile';
const REPORTER_LOGIN_PAGE = '/reporter-login.html';

const reportForm = document.getElementById('reportForm');
const currentReporterName = document.getElementById('currentReporterName');
const logoutBtn = document.getElementById('logoutBtn');
const locationInput = document.getElementById('location');
const descriptionInput = document.getElementById('description');
const latitudeInput = document.getElementById('latitude');
const longitudeInput = document.getElementById('longitude');
const altitudeInput = document.getElementById('altitude');
const imageInput = document.getElementById('image');
const fileNameDisplay = document.getElementById('fileName');
const clearImagesBtn = document.getElementById('clearImagesBtn');
const fileSelectionRow = document.querySelector('.file-selection-row');
const reportsTableBody = document.getElementById('reportsTableBody');
const formMessage = document.getElementById('formMessage');
const submitLoadingOverlay = document.getElementById('submitLoadingOverlay');
const mapLoadingOverlay = document.getElementById('mapLoadingOverlay');
const reportsFromInput = document.getElementById('reportsFrom');
const reportsToInput = document.getElementById('reportsTo');
const clearReportFilterBtn = document.getElementById('clearReportFilter');
const streetLayerBtn = document.getElementById('streetLayerBtn');
const satelliteLayerBtn = document.getElementById('satelliteLayerBtn');
const mapLocateBtn = document.getElementById('mapLocateBtn');
const mapClearBtn = document.getElementById('mapClearBtn');
const captureImageBtn = document.getElementById('captureImageBtn');
const imagePickerLabel = document.querySelector('label[for="image"].file-input-label');
let preferCameraCapture = false;
let selectedImageFiles = [];

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0
};

const THAI_TIME_OPTIONS = {
  timeZone: 'Asia/Bangkok',
  hour12: false
};
let activeBaseLayer = 'street';

document.addEventListener('DOMContentLoaded', () => {
  reporterProfile = requireReporterProfile();
  if (!reporterProfile) {
    return;
  }

  if (currentReporterName) {
    currentReporterName.textContent = reporterProfile.name;
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutReporter);
  }

  applyDefaultTodayRange();
  initMap();
  initMapFullscreenControls();

  if (reportsFromInput) {
    reportsFromInput.addEventListener('change', applyReportFilters);
  }
  if (reportsToInput) {
    reportsToInput.addEventListener('change', applyReportFilters);
  }
  if (clearReportFilterBtn) {
    clearReportFilterBtn.addEventListener('click', () => {
      applyDefaultTodayRange();
      applyReportFilters();
    });
  }
  if (mapLocateBtn) {
    mapLocateBtn.addEventListener('click', getCurrentLocation);
  }
  if (mapClearBtn) {
    mapClearBtn.addEventListener('click', clearMapTempMarkers);
  }
  if (captureImageBtn) {
    captureImageBtn.addEventListener('click', () => {
      preferCameraCapture = true;
      imageInput.setAttribute('capture', 'environment');
      imageInput.click();
    });
  }
  if (imagePickerLabel) {
    imagePickerLabel.addEventListener('click', () => {
      preferCameraCapture = false;
      imageInput.removeAttribute('capture');
    });
  }
  if (clearImagesBtn) {
    clearImagesBtn.addEventListener('click', clearSelectedImages);
  }

  updateSelectedFilesDisplay();
});

reportForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitReport();
});

imageInput.addEventListener('click', () => {
  if (!preferCameraCapture) {
    imageInput.removeAttribute('capture');
  }
});

imageInput.addEventListener('change', (e) => {
  preferCameraCapture = false;
  imageInput.removeAttribute('capture');
  const incomingFiles = Array.from(e.target.files || []);
  if (incomingFiles.length > 0) {
    const existingKeySet = new Set(
      selectedImageFiles.map((file) => `${file.name}-${file.size}-${file.lastModified}`)
    );

    incomingFiles.forEach((file) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (!existingKeySet.has(key)) {
        selectedImageFiles.push(file);
        existingKeySet.add(key);
      }
    });

    syncImageInputFiles();
  }

  // Reset native input so mobile browsers can pick additional files repeatedly.
  imageInput.value = '';
  updateSelectedFilesDisplay();
});

function syncImageInputFiles() {
  if (typeof DataTransfer === 'undefined') {
    return;
  }

  try {
    const transfer = new DataTransfer();
    selectedImageFiles.forEach((file) => transfer.items.add(file));
    imageInput.files = transfer.files;
  } catch (_) {
    // Some mobile browsers do not allow programmatic FileList assignment.
  }
}

function updateSelectedFilesDisplay() {
  if (!selectedImageFiles.length) {
    fileNameDisplay.textContent = '';
    fileNameDisplay.style.display = 'none';
    if (fileSelectionRow) {
      fileSelectionRow.style.display = 'none';
    }
    if (clearImagesBtn) {
      clearImagesBtn.style.display = 'none';
    }
    return;
  }

  const previewNames = selectedImageFiles.slice(0, 3).map((file) => file.name).join(', ');
  const extraCount = selectedImageFiles.length - 3;
  const suffix = extraCount > 0 ? ` และอีก ${extraCount} รูป` : '';
  fileNameDisplay.textContent = `เลือกแล้ว ${selectedImageFiles.length} รูป (${previewNames}${suffix})`;
  fileNameDisplay.style.display = 'block';
  if (fileSelectionRow) {
    fileSelectionRow.style.display = 'block';
  }
  if (clearImagesBtn) {
    clearImagesBtn.style.display = 'inline-block';
  }
}

function clearSelectedImages() {
  selectedImageFiles = [];
  imageInput.value = '';
  syncImageInputFiles();
  updateSelectedFilesDisplay();
}

function initMap() {
  map = L.map('map').setView([13.7563, 100.5018], 12);

  const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap ผู้ร่วมสนับสนุน',
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
  setupMapLayerToggle(streetLayer, satelliteLayer);

  map.on('click', (e) => {
    latitudeInput.value = e.latlng.lat.toFixed(4);
    longitudeInput.value = e.latlng.lng.toFixed(4);
    if (selectedCoordsMarker) {
      map.removeLayer(selectedCoordsMarker);
    }
    selectedCoordsMarker = L.circleMarker([e.latlng.lat, e.latlng.lng], {
      radius: 8,
      fillColor: '#dc3545',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.95
    }).addTo(map).bindPopup('พิกัดที่เลือก');
    showMessage('อัปเดตพิกัดแล้ว', 'success');
  });
}

function setupMapLayerToggle(streetLayer, satelliteLayer) {
  if (!streetLayerBtn || !satelliteLayerBtn) {
    return;
  }

  const applyLayer = (nextLayer) => {
    if (nextLayer === activeBaseLayer) {
      return;
    }

    if (nextLayer === 'street') {
      if (map.hasLayer(satelliteLayer)) {
        map.removeLayer(satelliteLayer);
      }
      streetLayer.addTo(map);
      activeBaseLayer = 'street';
    } else {
      if (map.hasLayer(streetLayer)) {
        map.removeLayer(streetLayer);
      }
      satelliteLayer.addTo(map);
      activeBaseLayer = 'satellite';
    }

    streetLayerBtn.classList.toggle('active', activeBaseLayer === 'street');
    satelliteLayerBtn.classList.toggle('active', activeBaseLayer === 'satellite');
  };

  streetLayerBtn.addEventListener('click', () => applyLayer('street'));
  satelliteLayerBtn.addEventListener('click', () => applyLayer('satellite'));
}

function initMapFullscreenControls() {
  const container = document.getElementById('mapContainer');
  const openBtn = document.getElementById('openMapFullscreenBtn');
  const closeBtn = document.getElementById('closeMapFullscreenBtn');
  let fallbackFullscreen = false;

  if (!container || !openBtn || !closeBtn) {
    return;
  }

  const isNativeFullscreen = () =>
    document.fullscreenElement === container || document.webkitFullscreenElement === container;

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
      if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else {
        enterFallbackFullscreen();
        syncButtons();
      }
    } catch (err) {
      console.error('Failed to enter fullscreen:', err);
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fallbackFullscreen) {
      exitFallbackFullscreen();
      syncButtons();
    }
  });
}

function getCurrentLocation() {
  if (!navigator.geolocation) {
    showMessage('ไม่สามารถใช้ GPS ได้: เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง', 'error');
    return;
  }

  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    showMessage('มือถือจะใช้ตำแหน่งได้เมื่อเปิดผ่าน HTTPS เท่านั้น (ลิงก์ปัจจุบันเป็น HTTP)', 'error');
    return;
  }

  setSubmitLoading(true, 'กำลังค้นหาตำแหน่ง...');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const altitude = position.coords.altitude;

      latitudeInput.value = lat.toFixed(4);
      longitudeInput.value = lng.toFixed(4);

      if (typeof altitude === 'number' && !Number.isNaN(altitude) && altitude >= 0) {
        altitudeInput.value = Math.round(altitude);
      }

      map.setView([lat, lng], 15);

      if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
      }

      userLocationMarker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#28a745',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(map).bindPopup('ตำแหน่งของคุณ');

      setSubmitLoading(false);
      showMessage('ได้ตำแหน่งของคุณแล้ว', 'success');
    },
    (error) => {
      setSubmitLoading(false);
      console.error('Geolocation error:', error);

      if (error.code === error.PERMISSION_DENIED) {
        showMessage('ถูกปฏิเสธสิทธิ์ตำแหน่ง: กรุณาอนุญาต Location ให้เบราว์เซอร์', 'error');
        return;
      }

      if (error.code === error.TIMEOUT) {
        showMessage('หา GPS ไม่ทันเวลา กรุณาลองใหม่ในที่โล่งหรือเปิด High accuracy', 'error');
        return;
      }

      if (error.code === error.POSITION_UNAVAILABLE) {
        showMessage('ไม่พบข้อมูลตำแหน่งจากอุปกรณ์ กรุณาเปิด GPS แล้วลองใหม่', 'error');
        return;
      }

      showMessage('ไม่สามารถระบุตำแหน่งได้ คุณยังแตะแผนที่เพื่อเลือกพิกัดเองได้', 'error');
    },
    GEO_OPTIONS
  );
}

function clearCoordinates() {
  latitudeInput.value = '';
  longitudeInput.value = '';
}

function clearMapTempMarkers() {
  clearCoordinates();
  if (userLocationMarker) {
    map.removeLayer(userLocationMarker);
    userLocationMarker = null;
  }
  if (selectedCoordsMarker) {
    map.removeLayer(selectedCoordsMarker);
    selectedCoordsMarker = null;
  }
  showMessage('ล้างค่าพิกัดและหมุดชั่วคราวแล้ว', 'success');
}

async function submitReport() {
  const reporterName = (reporterProfile?.name || '').trim();
  const reporterPhone = (reporterProfile?.phone || '').trim();
  const location = locationInput.value.trim();
  const description = descriptionInput.value.trim();
  const latitude = latitudeInput.value.trim();
  const longitude = longitudeInput.value.trim();
  const altitude = altitudeInput.value.trim();

  if (!reporterName || !reporterPhone || !latitude || !longitude) {
    showMessage('Please fill in name, phone, and coordinates.', 'error');
    return;
  }

  if (selectedImageFiles.length === 0) {
    showMessage('โปรดส่งรูปภาพ', 'error');
    imageInput.focus();
    return;
  }

  setSubmitLoading(true);

  try {
    const formData = new FormData();
    formData.append('reporterName', reporterName);
    formData.append('location', location || '-');
    formData.append('description', description || '-');
    formData.append('latitude', latitude);
    formData.append('longitude', longitude);
    formData.append('reporterPhone', reporterPhone);

    if (altitude) {
      formData.append('altitude', altitude);
    }

    selectedImageFiles.forEach((file) => {
      formData.append('images', file);
    });

    const response = await fetch('/report', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      let errorMessage = 'Failed to submit report';
      try {
        const error = await response.json();
        if (error && error.error) {
          errorMessage = error.error;
        }
      } catch (_) {
        // ignore json parse failure
      }
      throw new Error(errorMessage);
    }

    showMessage('ส่งคำแจ้งเรียบร้อยแล้ว', 'success');

    addLocalReportMarker({
      reporterName,
      reporterPhone,
      location,
      description,
      latitude,
      longitude,
      altitude,
      imageFiles: selectedImageFiles
    });

    reportForm.reset();
    clearSelectedImages();
    locationInput.focus();
  } catch (error) {
    console.error('Submit report error:', error);
    showMessage('Failed: ' + error.message, 'error');
  } finally {
    setSubmitLoading(false);
  }
}

function requireReporterProfile() {
  const raw = localStorage.getItem(REPORTER_SESSION_KEY);
  if (!raw) {
    redirectToReporterLogin();
    return null;
  }

  try {
    const data = JSON.parse(raw);
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    const phone = typeof data?.phone === 'string' ? data.phone.trim() : '';

    if (!name || !phone) {
      localStorage.removeItem(REPORTER_SESSION_KEY);
      redirectToReporterLogin();
      return null;
    }

    return { name, phone };
  } catch (_) {
    localStorage.removeItem(REPORTER_SESSION_KEY);
    redirectToReporterLogin();
    return null;
  }
}

function redirectToReporterLogin() {
  const next = encodeURIComponent('/index.html');
  window.location.replace(`${REPORTER_LOGIN_PAGE}?next=${next}`);
}

function logoutReporter() {
  localStorage.removeItem(REPORTER_SESSION_KEY);
  redirectToReporterLogin();
}

function addLocalReportMarker({
  reporterName,
  reporterPhone,
  location,
  description,
  latitude,
  longitude,
  altitude,
  imageFiles
}) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  const locationText = (location || '').trim() || 'ไม่ระบุตำแหน่ง';
  const descriptionText = (description || '').trim() || '-';
  const createdAtText = formatThaiDateTime(new Date());

  const marker = L.marker([lat, lng], {
    title: locationText
  }).addTo(map);

  let popupContent = `
    <div style="max-width: 250px;">
      <strong>${escapeHtml(locationText)}</strong><br/>
      <small>ผู้แจ้ง: ${escapeHtml(reporterName || '-')}</small><br/>
      <small>เบอร์: ${escapeHtml(reporterPhone || '-')}</small><br/>
      <small>${escapeHtml(descriptionText)}</small><br/>
      <small>เวลา: ${escapeHtml(createdAtText)}</small><br/>
  `;

  if (altitude) {
    popupContent += `<small>ความสูง: ${escapeHtml(String(altitude))} ม.</small><br/>`;
  }

  const firstImageFile = Array.isArray(imageFiles) && imageFiles.length > 0 ? imageFiles[0] : null;
  if (firstImageFile) {
    const imgUrl = URL.createObjectURL(firstImageFile);
    popupContent += `<img src="${imgUrl}" alt="ภาพรายงาน" style="width: 100%; margin-top: 8px; border-radius: 4px; max-height: 150px; object-fit: cover;">`;
  }

  popupContent += '</div>';
  marker.bindPopup(popupContent).openPopup();
  markers.push(marker);

  map.setView([lat, lng], Math.max(map.getZoom(), 15));
}

async function loadReports() {
  try {
    const response = await fetch('/reports');

    if (!response.ok) {
      throw new Error('ไม่สามารถโหลดรายงานได้');
    }

    allReports = await response.json();
    applyReportFilters();
  } catch (error) {
    console.error('Error loading reports:', error);
    allReports = [];
    if (reportsTableBody) {
      reportsTableBody.innerHTML = '<tr style="text-align: center;"><td colspan="8">ไม่สามารถโหลดรายงานได้ โปรดลองอีกครั้งภายหลัง</td></tr>';
    }
    updateMap([]);
  }
}

function applyReportFilters() {
  if (!reportsFromInput && !reportsToInput) {
    displayReports(allReports);
    updateMap(allReports);
    return;
  }

  const hasAnyFilter = Boolean(reportsFromInput?.value || reportsToInput?.value);
  const fromDate = reportsFromInput?.value ? new Date(reportsFromInput.value) : (hasAnyFilter ? null : getTodayStart());
  const toDate = reportsToInput?.value ? new Date(reportsToInput.value) : (hasAnyFilter ? null : getTodayEnd());

  const filteredReports = allReports.filter((report) => {
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

  displayReports(filteredReports);
  updateMap(filteredReports);
}

function displayReports(reports) {
  if (!reportsTableBody) {
    return;
  }
  if (!Array.isArray(reports) || reports.length === 0) {
    reportsTableBody.innerHTML = '<tr style="text-align: center;"><td colspan="8">ไม่พบรายงานในช่วงวันเวลาที่เลือก</td></tr>';
    return;
  }

  reportsTableBody.innerHTML = reports.map((report, index) => {
    const formattedTime = formatThaiDateTime(report.created_at);
    const reportImages = getReportImages(report);
    const imageHtml = reportImages.length > 0
      ? `<img src="/uploads/${reportImages[0]}" alt="รูปรายงาน" class="image-thumbnail">`
      : '';
    const locationText = (report.location || '').trim() || 'ไม่ระบุตำแหน่ง';
    const descriptionText = (report.description || '').trim() || '-';

    const lat = Number(report.latitude);
    const lng = Number(report.longitude);
    const hasAltitude = report.altitude !== null && report.altitude !== undefined && report.altitude !== '';

    return `
      <tr class="report-row" onclick="viewReportDetail(${report.id})">
        <td>${index + 1}</td>
        <td>${escapeHtml(report.reporter_name || '-')}</td>
        <td>${escapeHtml(locationText)}</td>
        <td>${lat.toFixed(4)}</td>
        <td>${lng.toFixed(4)}</td>
        <td>${hasAltitude ? `${escapeHtml(String(report.altitude))} ม.` : '-'}</td>
        <td>${imageHtml || '-'}</td>
        <td>${escapeHtml(formattedTime)}</td>
      </tr>
    `;
  }).join('');
}

function updateMap(reports) {
  markers.forEach((marker) => map.removeLayer(marker));
  markers = [];

  reports.forEach((report) => {
    const lat = Number(report.latitude);
    const lng = Number(report.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const locationText = (report.location || '').trim() || 'ไม่ระบุตำแหน่ง';
    const descriptionText = (report.description || '').trim() || '-';
    const createdAtText = formatThaiDateTime(report.created_at);

    const marker = L.marker([lat, lng], {
      title: locationText
    }).addTo(map);

    let popupContent = `
      <div style="max-width: 250px;">
        <strong>${escapeHtml(locationText)}</strong><br/>
        <small>ผู้แจ้ง: ${escapeHtml(report.reporter_name)}</small><br/>
        <small>${escapeHtml(descriptionText)}</small><br/>
        <small>เวลา: ${escapeHtml(createdAtText)}</small><br/>
    `;

    if (report.altitude !== null && report.altitude !== undefined && report.altitude !== '') {
      popupContent += `<small>ความสูง: ${report.altitude} ม.</small><br/>`;
    }

    const reportImages = getReportImages(report);
    if (reportImages.length > 0) {
      popupContent += `<img src="/uploads/${reportImages[0]}" alt="ภาพรายงาน" style="width: 100%; margin-top: 8px; border-radius: 4px; max-height: 150px; object-fit: cover;">`;
    }

    popupContent += '</div>';

    marker.bindPopup(popupContent);
    markers.push(marker);
  });

  if (markers.length > 0) {
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.1), { maxZoom: 15 });
  }
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

function setSubmitLoading(isLoading, text = 'กำลังส่งคำแจ้ง...') {
  const applyOverlayState = (overlayEl) => {
    if (!overlayEl) {
      return;
    }
    const loadingBox = overlayEl.querySelector('.loading-box');
    if (loadingBox) {
      loadingBox.textContent = text;
    }
    overlayEl.classList.toggle('active', isLoading);
    overlayEl.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
  };

  applyOverlayState(submitLoadingOverlay);
  applyOverlayState(mapLoadingOverlay);
}

function showMessage(text, type) {
  formMessage.textContent = text;
  formMessage.className = `message ${type}`;
  formMessage.style.display = 'block';

  setTimeout(() => {
    formMessage.style.display = 'none';
  }, 5000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text === null || text === undefined ? '' : String(text);
  return div.innerHTML;
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
  if (reportsFromInput && !reportsFromInput.value) {
    reportsFromInput.value = toDateTimeLocalValue(getTodayStart());
  }
  if (reportsToInput && !reportsToInput.value) {
    reportsToInput.value = toDateTimeLocalValue(getTodayEnd());
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

function viewReportDetail(reportId) {
  const report = allReports.find((item) => item.id === reportId);
  if (!report) {
    return;
  }

  const locationText = (report.location || '').trim() || 'ไม่ระบุตำแหน่ง';
  const descriptionText = (report.description || '').trim() || '-';
  const altitudeText = report.altitude !== null && report.altitude !== undefined && report.altitude !== ''
    ? `${escapeHtml(String(report.altitude))} ม.`
    : '-';
  const imageHtml = report.image_filename
    ? `<img class="detail-image" src="/uploads/${report.image_filename}" alt="ภาพรายงาน">`
    : '<div class="detail-value">-</div>';

  const content = `
    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-label">ผู้แจ้ง</div>
        <div class="detail-value">${escapeHtml(report.reporter_name || '-')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">วันเวลา</div>
        <div class="detail-value">${escapeHtml(formatThaiDateTime(report.created_at))}</div>
      </div>
      <div class="detail-item full">
        <div class="detail-label">ตำแหน่ง/สถานที่</div>
        <div class="detail-value">${escapeHtml(locationText)}</div>
      </div>
      <div class="detail-item full">
        <div class="detail-label">รายละเอียด</div>
        <div class="detail-value">${escapeHtml(descriptionText)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">ละติจูด</div>
        <div class="detail-value">${escapeHtml(Number(report.latitude).toFixed(6))}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">ลองจิจูด</div>
        <div class="detail-value">${escapeHtml(Number(report.longitude).toFixed(6))}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">ความสูง</div>
        <div class="detail-value">${altitudeText}</div>
      </div>
      <div class="detail-item full">
        <div class="detail-label">รูปภาพ</div>
        ${imageHtml}
      </div>
    </div>
  `;

  document.getElementById('reportDetailContent').innerHTML = content;
  document.getElementById('reportDetailModal').classList.add('active');
}

function closeReportDetailModal() {
  document.getElementById('reportDetailModal').classList.remove('active');
}

window.addEventListener('click', (e) => {
  const detailModal = document.getElementById('reportDetailModal');
  if (e.target === detailModal) {
    detailModal.classList.remove('active');
  }
});

