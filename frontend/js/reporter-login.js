const REPORTER_SESSION_KEY = 'reporterProfile';

const form = document.getElementById('reporterLoginForm');
const nameInput = document.getElementById('reporterName');
const phoneInput = document.getElementById('reporterPhone');
const message = document.getElementById('message');

const nextParams = new URLSearchParams(window.location.search);
const nextPath = nextParams.get('next') || '/index.html';

const existingSession = loadReporterProfile();
if (existingSession) {
  window.location.replace(nextPath);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  submitReporterLogin();
});

function submitReporterLogin() {
  const name = nameInput.value.trim();
  const phone = normalizePhone(phoneInput.value);

  if (!name) {
    showError('กรุณากรอกชื่อผู้แจ้ง');
    nameInput.focus();
    return;
  }

  if (!phone) {
    showError('กรุณากรอกเบอร์โทรศัพท์');
    phoneInput.focus();
    return;
  }

  if (!/^\d{9,10}$/.test(phone)) {
    showError('กรุณากรอกเบอร์โทรเป็นตัวเลข 9-10 หลัก');
    phoneInput.focus();
    return;
  }

  localStorage.setItem(REPORTER_SESSION_KEY, JSON.stringify({ name, phone }));
  window.location.replace(nextPath);
}

function normalizePhone(value) {
  return (value || '').replace(/\D/g, '');
}

function loadReporterProfile() {
  const raw = localStorage.getItem(REPORTER_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
    const phone = typeof parsed?.phone === 'string' ? parsed.phone.trim() : '';
    return name && phone ? parsed : null;
  } catch (_) {
    return null;
  }
}

function showError(text) {
  message.textContent = text;
  message.className = 'message error';
}
