/**
 * app.js — screen navigation, operator profile, patient intake, mock
 * ABHA, capture flow, and localStorage case persistence for the DR
 * Screening PWA.
 */

const STORAGE_KEY = 'dr_pwa_cases';
const OPERATOR_KEY = 'dr_pwa_operator';
const MAX_STORED_IMAGE_DIM = 800; // downscale captured images before persisting to localStorage

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------
const screenStack = [];

function showScreen(id, opts = {}) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  if (opts.push !== false) {
    screenStack.push(id);
  }

  const titles = {
    'screen-operator': 'Operator Sign-In',
    'screen-home': 'DR Screening',
    'screen-intake': 'Patient Intake',
    'screen-abha': 'Link ABHA ID',
    'screen-consent': 'Patient Consent',
    'screen-capture': 'Image Capture',
    'screen-history': 'Case History',
    'screen-case-detail': 'Case Detail',
  };
  document.getElementById('topbarTitle').textContent = titles[id] || 'DR Screening';
  document.getElementById('backBtn').classList.toggle('visible', screenStack.length > 1);
  window.scrollTo(0, 0);
}

function goBack() {
  if (screenStack.length <= 1) return;
  screenStack.pop();
  const prev = screenStack[screenStack.length - 1];
  showScreen(prev, { push: false });
}

document.getElementById('backBtn').addEventListener('click', goBack);

// ---------------------------------------------------------------------
// Operator profile (local device profile, not real authentication)
// ---------------------------------------------------------------------
let currentOperator = null;

function loadOperator() {
  try {
    return JSON.parse(localStorage.getItem(OPERATOR_KEY));
  } catch {
    return null;
  }
}

function updateOperatorBadge() {
  if (!currentOperator) return;
  document.getElementById('operatorBadgeName').textContent = currentOperator.name;
  document.getElementById('operatorBadgeMeta').textContent =
    `${currentOperator.employeeId} · ${currentOperator.facility}`;
}

document.getElementById('operatorForm').addEventListener('submit', (e) => {
  e.preventDefault();

  currentOperator = {
    name: document.getElementById('op_name').value.trim(),
    employeeId: document.getElementById('op_employeeId').value.trim(),
    facility: document.getElementById('op_facility').value.trim(),
  };
  localStorage.setItem(OPERATOR_KEY, JSON.stringify(currentOperator));

  updateOperatorBadge();
  screenStack.length = 0;
  showScreen('screen-home', { push: false });
});

document.getElementById('switchOperatorBtn').addEventListener('click', () => {
  currentOperator = null;
  localStorage.removeItem(OPERATOR_KEY);
  document.getElementById('operatorForm').reset();
  screenStack.length = 0;
  showScreen('screen-operator', { push: false });
});

// ---------------------------------------------------------------------
// Draft case state (accumulated across intake -> abha -> capture)
// ---------------------------------------------------------------------
let draftCase = null;

function newDraftCase() {
  return {
    id: 'case_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
    operatorName: currentOperator ? currentOperator.name : null,
    facility: currentOperator ? currentOperator.facility : null,
    patient: null,
    abhaId: null,
    consent: null,
    imageDataUrl: null,
    imageWidth: null,
    imageHeight: null,
    quality: null,
    result: null,
    reviewStatus: 'Pending Ophthalmologist Review',
    reviewedAt: null,
  };
}

document.getElementById('startNewBtn').addEventListener('click', () => {
  draftCase = newDraftCase();
  resetIntakeForm();
  showScreen('screen-intake');
});

document.getElementById('viewHistoryBtn').addEventListener('click', () => {
  renderHistoryList();
  showScreen('screen-history');
});

// ---------------------------------------------------------------------
// Intake form
// ---------------------------------------------------------------------
function resetIntakeForm() {
  document.getElementById('intakeForm').reset();
  document.querySelectorAll('.radio-opt').forEach((el) => el.classList.remove('checked'));
  document.getElementById('diabetesDurationWrap').classList.remove('visible');
}

// radio button visual state + conditional field
document.querySelectorAll('.radio-row').forEach((row) => {
  row.addEventListener('click', (e) => {
    const opt = e.target.closest('.radio-opt');
    if (!opt) return;
    row.querySelectorAll('.radio-opt').forEach((o) => o.classList.remove('checked'));
    opt.classList.add('checked');
  });
});

document.querySelectorAll('input[name="f_diagnosedDiabetes"]').forEach((input) => {
  input.addEventListener('change', (e) => {
    document.getElementById('diabetesDurationWrap').classList.toggle('visible', e.target.value === 'Yes');
  });
});

function getRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : null;
}

document.getElementById('intakeForm').addEventListener('submit', (e) => {
  e.preventDefault();

  draftCase.patient = {
    name: document.getElementById('f_name').value.trim(),
    age: document.getElementById('f_age').value,
    gender: document.getElementById('f_gender').value,
    pregnancyOrBirths: document.getElementById('f_pregnancy').value.trim(),
    familyHistoryDiabetes: getRadioValue('f_familyHistory'),
    diagnosedDiabetes: getRadioValue('f_diagnosedDiabetes'),
    diabetesDuration:
      getRadioValue('f_diagnosedDiabetes') === 'Yes'
        ? document.getElementById('f_diabetesDuration').value.trim()
        : null,
    otherConditions: document.getElementById('f_otherConditions').value.trim(),
    smoking: getRadioValue('f_smoking'),
    smokingDetails: document.getElementById('f_smokingDetails').value.trim(),
    alcohol: getRadioValue('f_alcohol'),
    alcoholDetails: document.getElementById('f_alcoholDetails').value.trim(),
    drugUse: getRadioValue('f_drugUse'),
    drugUseDetails: document.getElementById('f_drugUseDetails').value.trim(),
    occupationalExposure: document.getElementById('f_occupationalExposure').value.trim(),
  };

  showScreen('screen-abha');
});

// ---------------------------------------------------------------------
// Mock ABHA
// ---------------------------------------------------------------------
document.getElementById('abhaContinueBtn').addEventListener('click', () => {
  draftCase.abhaId = document.getElementById('f_abhaId').value.trim() || null;
  goToConsent();
});
document.getElementById('abhaSkipBtn').addEventListener('click', () => {
  draftCase.abhaId = null;
  goToConsent();
});

// ---------------------------------------------------------------------
// Pre-capture consent (Section 4)
// ---------------------------------------------------------------------
function goToConsent() {
  document.getElementById('consentCheckbox').checked = false;
  document.getElementById('consentContinueBtn').disabled = true;
  showScreen('screen-consent');
}

document.getElementById('consentCheckbox').addEventListener('change', (e) => {
  document.getElementById('consentContinueBtn').disabled = !e.target.checked;
});

document.getElementById('consentContinueBtn').addEventListener('click', () => {
  draftCase.consent = { given: true, timestamp: new Date().toISOString() };
  goToCapture();
});

function goToCapture() {
  resetCaptureScreen();
  showScreen('screen-capture');
}

// ---------------------------------------------------------------------
// Capture: camera + file upload
// ---------------------------------------------------------------------
const workCanvas = document.getElementById('workCanvas');
const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
let cameraStream = null;

function resetCaptureScreen() {
  document.getElementById('captureChooser').style.display = 'block';
  document.getElementById('cameraArea').style.display = 'none';
  document.getElementById('previewArea').style.display = 'none';
  document.getElementById('qualityResult').innerHTML = '';
  document.getElementById('inferenceResult').innerHTML = '';
  document.getElementById('fileInput').value = '';
  stopCamera();
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
}

document.getElementById('openCameraBtn').addEventListener('click', async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    const video = document.getElementById('cameraVideo');
    video.srcObject = cameraStream;
    document.getElementById('captureChooser').style.display = 'none';
    document.getElementById('cameraArea').style.display = 'block';
  } catch (err) {
    alert('Could not access camera: ' + err.message + '\nUse "Upload Image" instead.');
  }
});

document.getElementById('cancelCameraBtn').addEventListener('click', () => {
  stopCamera();
  document.getElementById('cameraArea').style.display = 'none';
  document.getElementById('captureChooser').style.display = 'block';
});

document.getElementById('snapBtn').addEventListener('click', () => {
  const video = document.getElementById('cameraVideo');
  workCanvas.width = video.videoWidth;
  workCanvas.height = video.videoHeight;
  workCtx.drawImage(video, 0, 0);
  stopCamera();
  document.getElementById('cameraArea').style.display = 'none';
  onImageCaptured();
});

document.getElementById('chooseFileBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      workCanvas.width = img.naturalWidth;
      workCanvas.height = img.naturalHeight;
      workCtx.drawImage(img, 0, 0);
      document.getElementById('captureChooser').style.display = 'none';
      onImageCaptured();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

function onImageCaptured() {
  const dataUrl = workCanvas.toDataURL('image/jpeg', 0.9);
  document.getElementById('previewImg').src = dataUrl;
  document.getElementById('previewArea').style.display = 'block';

  // Pre-quality-gate check: is this even a plausible fundus-camera photo?
  // Runs BEFORE the focus/illumination/FOV quality gate, since there's no
  // point measuring blur/exposure on a photo of a hand or a face.
  const fundusCheck = runFundusPlausibilityCheck(workCanvas);
  if (!fundusCheck.pass) {
    renderFundusCheckFailure(fundusCheck);
    return;
  }

  const quality = runQualityGate(workCanvas);
  renderQualityResult(quality);

  if (quality.pass) {
    draftCase.quality = quality.metrics;
    runInferenceFlow();
  }
}

function renderFundusCheckFailure(fundusCheck) {
  const el = document.getElementById('qualityResult');
  el.innerHTML = `
    <div class="verdict-banner fail"><svg class="icon"><use href="#icon-x-circle"/></svg>RECAPTURE — ${fundusCheck.reason}</div>
    <div class="btn-row">
      <button class="btn" id="retakeBtn">Retake Image</button>
    </div>
  `;
  document.getElementById('retakeBtn').addEventListener('click', () => {
    resetCaptureScreen();
  });
}

function renderQualityResult(quality) {
  const el = document.getElementById('qualityResult');
  if (quality.pass) {
    el.innerHTML = `<div class="verdict-banner pass"><svg class="icon"><use href="#icon-check-circle"/></svg>Image quality: PASS</div>`;
  } else {
    el.innerHTML = `
      <div class="verdict-banner fail"><svg class="icon"><use href="#icon-alert-triangle"/></svg>RECAPTURE — ${quality.reason}</div>
      <div class="btn-row">
        <button class="btn" id="retakeBtn">Retake Image</button>
      </div>
    `;
    document.getElementById('retakeBtn').addEventListener('click', () => {
      resetCaptureScreen();
    });
  }
}

async function runInferenceFlow() {
  const inferenceEl = document.getElementById('inferenceResult');
  inferenceEl.innerHTML = `
    <div class="spinner-row"><div class="spinner"></div> Loading model and analyzing image...</div>
    <div class="skeleton-card">
      <div class="skeleton-line w-80"></div>
      <div class="skeleton-line w-40"></div>
      <div class="skeleton-line w-60"></div>
    </div>
  `;

  const result = await runInference(workCanvas);
  draftCase.result = result;

  renderInferenceResult(result);
}

function renderInferenceResult(result) {
  const inferenceEl = document.getElementById('inferenceResult');
  const referral = result.referral;

  inferenceEl.innerHTML = `
    <div class="notice info">
      AI-assisted grading (drNet, ResNet18 transfer-learned on APTOS 2019). This is a
      screening aid, not a clinical diagnosis — final review by an ophthalmologist is
      required.
    </div>
    <div class="result-grade">${result.label}</div>
    <div class="result-confidence">Confidence: ${result.confidence}%</div>
    <div class="referral-badge ${referral.level}">${referral.text}</div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn secondary" id="retakeAfterResultBtn">Retake Image</button>
      <button class="btn" id="saveCaseBtn">Save &amp; Finish</button>
    </div>
  `;

  document.getElementById('retakeAfterResultBtn').addEventListener('click', () => {
    resetCaptureScreen();
  });
  document.getElementById('saveCaseBtn').addEventListener('click', saveDraftCase);
}

async function saveDraftCase() {
  const { dataUrl, width, height } = await downscaleDataUrl(workCanvas, MAX_STORED_IMAGE_DIM);
  draftCase.imageDataUrl = dataUrl;
  draftCase.imageWidth = width;
  draftCase.imageHeight = height;

  const savedCaseId = draftCase.id;
  const cases = loadCases();
  cases.unshift(draftCase);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
  } catch (err) {
    alert('Could not save case to local storage (storage may be full): ' + err.message);
    return;
  }

  draftCase = null;
  screenStack.length = 0;
  screenStack.push('screen-home');
  renderCaseDetail(savedCaseId);
  showScreen('screen-case-detail');
}

function downscaleDataUrl(sourceCanvas, maxDim) {
  return new Promise((resolve) => {
    const scale = Math.min(1, maxDim / Math.max(sourceCanvas.width, sourceCanvas.height));
    const w = Math.max(1, Math.round(sourceCanvas.width * scale));
    const h = Math.max(1, Math.round(sourceCanvas.height * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(sourceCanvas, 0, 0, w, h);
    resolve({ dataUrl: c.toDataURL('image/jpeg', 0.85), width: w, height: h });
  });
}

// ---------------------------------------------------------------------
// Case history / persistence
// ---------------------------------------------------------------------
function loadCases() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function statusChipClass(status) {
  if (status === 'Approved') return 'approved';
  if (status === 'Flagged for Review') return 'flagged';
  return 'pending';
}

/** Grade-4/urgent cases first (Section 4: reviewer queue sorted by urgency), then most recent. */
function sortCasesByUrgency(cases) {
  return [...cases].sort((a, b) => {
    const rankA = a.result ? getReferralInterval(a.result.grade).urgencyRank : -1;
    const rankB = b.result ? getReferralInterval(b.result.grade).urgencyRank : -1;
    if (rankB !== rankA) return rankB - rankA;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function renderHistoryList() {
  const cases = sortCasesByUrgency(loadCases());
  const listEl = document.getElementById('historyList');

  if (cases.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No screenings saved yet.</div>`;
    return;
  }

  listEl.innerHTML = cases
    .map((c) => {
      const urgencyRank = c.result ? getReferralInterval(c.result.grade).urgencyRank : -1;
      return `
    <div class="case-list-item" data-id="${c.id}">
      ${urgencyRank === 2 ? '<span class="urgency-dot" title="Urgent referral"></span>' : ''}
      <div>
        <div class="name">${escapeHtml(c.patient?.name || 'Unnamed')}</div>
        <div class="meta">${new Date(c.createdAt).toLocaleString()} · ${
        c.result ? c.result.label : 'No result'
      }</div>
      </div>
      <span class="status-chip ${statusChipClass(c.reviewStatus)}">${c.reviewStatus}</span>
    </div>
  `;
    })
    .join('');

  listEl.querySelectorAll('.case-list-item').forEach((item) => {
    item.addEventListener('click', () => {
      renderCaseDetail(item.getAttribute('data-id'));
      showScreen('screen-case-detail');
    });
  });
}

function renderCaseDetail(caseId) {
  const cases = loadCases();
  const c = cases.find((x) => x.id === caseId);
  const body = document.getElementById('caseDetailBody');
  if (!c) {
    body.innerHTML = `<div class="empty-state">Case not found.</div>`;
    return;
  }

  const p = c.patient || {};
  const r = c.result || {};

  renderResultsViewer(c);

  body.innerHTML = `
    <h2>${escapeHtml(p.name || 'Unnamed')}</h2>
    <p class="desc">${new Date(c.createdAt).toLocaleString()}</p>
    <span class="status-chip ${statusChipClass(c.reviewStatus)}">${c.reviewStatus}</span>
    ${c.reviewedAt ? `<div class="meta" style="margin-top:4px">Reviewed: ${new Date(c.reviewedAt).toLocaleString()}</div>` : ''}

    <table class="kv-table" style="margin-top:16px">
      <tr><td>Age</td><td>${escapeHtml(p.age || '')}</td></tr>
      <tr><td>Gender</td><td>${escapeHtml(p.gender || '')}</td></tr>
      <tr><td>Pregnancy / births</td><td>${escapeHtml(p.pregnancyOrBirths || '')}</td></tr>
      <tr><td>Family history of diabetes</td><td>${escapeHtml(p.familyHistoryDiabetes || '')}</td></tr>
      <tr><td>Diagnosed with diabetes</td><td>${escapeHtml(p.diagnosedDiabetes || '')}</td></tr>
      ${p.diabetesDuration ? `<tr><td>Duration of diabetes</td><td>${escapeHtml(p.diabetesDuration)}</td></tr>` : ''}
      <tr><td>Other medical conditions</td><td>${escapeHtml(p.otherConditions || '—')}</td></tr>
      <tr><td>Smoking</td><td>${escapeHtml(p.smoking || '')}${p.smokingDetails ? ' — ' + escapeHtml(p.smokingDetails) : ''}</td></tr>
      <tr><td>Alcohol use</td><td>${escapeHtml(p.alcohol || '')}${p.alcoholDetails ? ' — ' + escapeHtml(p.alcoholDetails) : ''}</td></tr>
      <tr><td>Drug use</td><td>${escapeHtml(p.drugUse || '')}${p.drugUseDetails ? ' — ' + escapeHtml(p.drugUseDetails) : ''}</td></tr>
      <tr><td>Occupational exposure</td><td>${escapeHtml(p.occupationalExposure || '—')}</td></tr>
      <tr><td>ABHA ID</td><td>${escapeHtml(c.abhaId || 'Not linked (demo)')}</td></tr>
      <tr><td>Consent</td><td>${c.consent?.given ? 'Given — ' + new Date(c.consent.timestamp).toLocaleString() : 'Not recorded'}</td></tr>
      <tr><td>Captured by</td><td>${escapeHtml(c.operatorName || '—')}${c.facility ? ' — ' + escapeHtml(c.facility) : ''}</td></tr>
    </table>

    <div class="card" style="margin-top:16px;padding:16px">
      <h2 style="font-size:15px">Reviewer Actions</h2>
      <div class="notice demo">
        Simulated human-in-the-loop review step for demo purposes only — not a real
        clinician authentication system or portal. Anyone with this device can click
        these buttons.
      </div>
      <div class="btn-row">
        <button class="btn success" id="approveBtn" ${c.reviewStatus === 'Approved' ? 'disabled' : ''}><svg class="icon"><use href="#icon-check"/></svg>Approve</button>
        <button class="btn danger" id="flagBtn" ${c.reviewStatus === 'Flagged for Review' ? 'disabled' : ''}><svg class="icon"><use href="#icon-flag"/></svg>Flag for Review</button>
      </div>
    </div>
  `;

  document.getElementById('approveBtn')?.addEventListener('click', () => {
    setCaseReviewStatus(c.id, 'Approved');
  });
  document.getElementById('flagBtn')?.addEventListener('click', () => {
    setCaseReviewStatus(c.id, 'Flagged for Review');
  });

  const fab = document.getElementById('pdfFabBtn');
  fab.style.display = 'block';
  fab.onclick = () => downloadCasePdf(c);
}

// ---------------------------------------------------------------------
// Results viewer: structure-toggle layout (spec: results-screen redesign)
// ---------------------------------------------------------------------
let rvActiveStructure = 'segmentation';
let rvGrayscale = false;

function renderResultsViewer(c) {
  const container = document.getElementById('resultsViewer');
  const r = c.result || {};

  if (!c.imageDataUrl || !r.label) {
    container.innerHTML = '';
    document.getElementById('pdfFabBtn').style.display = 'none';
    return;
  }

  rvActiveStructure = 'segmentation';
  rvGrayscale = false;

  const structureLabels = {
    segmentation: 'Segmentation',
    microaneurysm: 'Microaneurysm',
    hard_exudate: 'Hard Exudate',
    soft_exudate: 'Soft Exudate',
    optic_disc: 'Optic Disc',
    haemorrhage: 'Haemorrhage',
  };
  const structureIcons = {
    segmentation: 'eye',
    microaneurysm: 'circle-dot',
    hard_exudate: 'droplet',
    soft_exudate: 'droplet',
    optic_disc: 'circle-dot',
    haemorrhage: 'droplet',
  };

  container.innerHTML = `
    <div class="results-viewer">
      <div class="rv-toggle-row">
        <button class="rv-toggle-btn active" id="rvNormalBtn">Normal</button>
        <button class="rv-toggle-btn" id="rvGrayscaleBtn">Grayscale</button>
      </div>
      <div class="rv-body">
        <div class="rv-sidebar" id="rvSidebar">
          ${STRUCTURE_KEYS.map(
            (key) =>
              `<button class="rv-structure-row${key === rvActiveStructure ? ' active' : ''}" data-structure="${key}"><svg class="icon icon-sm"><use href="#icon-${structureIcons[key]}"/></svg>${structureLabels[key]}</button>`
          ).join('')}
        </div>
        <div class="rv-image-area">
          <img class="rv-base" id="rvBaseImg" src="${c.imageDataUrl}" alt="Retinal image" />
          <div class="rv-mask-overlay" id="rvMaskOverlay"></div>
        </div>
      </div>
      <div class="rv-chip-row">
        <div class="rv-chip">Eye: <strong>${escapeHtml(c.eyeSide || '—')}</strong></div>
        <div class="rv-chip">Grade: <strong>${escapeHtml(r.label)}</strong></div>
        <div class="rv-chip">Confidence: <strong>${r.confidence}%</strong></div>
        <div class="rv-chip">Follow-up: <strong>${escapeHtml(getReferralInterval(r.grade).interval)}</strong></div>
      </div>
    </div>
  `;

  document.getElementById('rvNormalBtn').addEventListener('click', () => setRvGrayscale(false));
  document.getElementById('rvGrayscaleBtn').addEventListener('click', () => setRvGrayscale(true));

  document.getElementById('rvSidebar').querySelectorAll('.rv-structure-row').forEach((btn) => {
    btn.addEventListener('click', () => selectRvStructure(c.id, btn.getAttribute('data-structure')));
  });

  selectRvStructure(c.id, rvActiveStructure);
}

function setRvGrayscale(on) {
  rvGrayscale = on;
  document.getElementById('rvNormalBtn').classList.toggle('active', !on);
  document.getElementById('rvGrayscaleBtn').classList.toggle('active', on);
  document.getElementById('rvBaseImg').classList.toggle('grayscale', on);
}

/** Lazy-loads (fetches on demand, not eagerly) the mask for one structure and overlays it. */
async function selectRvStructure(caseId, structureKey) {
  rvActiveStructure = structureKey;
  const sidebar = document.getElementById('rvSidebar');
  if (!sidebar) return; // screen navigated away before the async load resolved
  sidebar.querySelectorAll('.rv-structure-row').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-structure') === structureKey);
  });

  const overlay = document.getElementById('rvMaskOverlay');
  overlay.innerHTML = `<div class="rv-mask-pending">Loading…</div>`;

  const mask = await loadStructureMask(caseId, structureKey);

  if (rvActiveStructure !== structureKey) return; // user switched tabs while this was loading
  if (!document.getElementById('rvMaskOverlay')) return; // screen navigated away

  if (mask.available) {
    overlay.innerHTML = `<img src="${mask.overlayDataUrl}" style="width:100%;height:100%;object-fit:contain" />`;
  } else {
    overlay.innerHTML = `<div class="rv-mask-pending">Lesion segmentation model not yet integrated for this structure.</div>`;
  }
}

/** Updates a case's review status + timestamp in localStorage and re-renders the detail view. */
function setCaseReviewStatus(caseId, status) {
  const cases = loadCases();
  const idx = cases.findIndex((x) => x.id === caseId);
  if (idx === -1) return;

  cases[idx].reviewStatus = status;
  cases[idx].reviewedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));

  renderCaseDetail(caseId);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// PWA install prompt + offline indicator
// ---------------------------------------------------------------------
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installBanner').classList.add('visible');
});

document.getElementById('installBtn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('installBanner').classList.remove('visible');
});

window.addEventListener('appinstalled', () => {
  document.getElementById('installBanner').classList.remove('visible');
});

function updateOfflineChip() {
  document.getElementById('offlineChip').classList.toggle('visible', !navigator.onLine);
}
window.addEventListener('online', updateOfflineChip);
window.addEventListener('offline', updateOfflineChip);
updateOfflineChip();

// ---------------------------------------------------------------------
// Service worker registration
// ---------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// ---------------------------------------------------------------------
// Welcome carousel (first run only, Section 3)
// ---------------------------------------------------------------------
const WELCOME_SEEN_KEY = 'dr_pwa_welcome_seen';
let welcomeSlideIndex = 0;
const WELCOME_SLIDE_COUNT = 3;

function goToPostWelcomeScreen() {
  currentOperator = loadOperator();
  if (currentOperator) {
    updateOperatorBadge();
    showScreen('screen-home', { push: false });
  } else {
    showScreen('screen-operator', { push: false });
  }
}

function showWelcomeSlide(i) {
  welcomeSlideIndex = i;
  document.querySelectorAll('.welcome-slide').forEach((el) => {
    el.classList.toggle('active', Number(el.getAttribute('data-slide')) === i);
  });
  document.querySelectorAll('.welcome-dot').forEach((el, idx) => {
    el.classList.toggle('active', idx === i);
  });
  document.getElementById('welcomeNextBtn').textContent = i === WELCOME_SLIDE_COUNT - 1 ? 'Get Started' : 'Next';
}

document.getElementById('welcomeNextBtn').addEventListener('click', () => {
  if (welcomeSlideIndex < WELCOME_SLIDE_COUNT - 1) {
    showWelcomeSlide(welcomeSlideIndex + 1);
  } else {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    screenStack.length = 0;
    goToPostWelcomeScreen();
  }
});
document.getElementById('welcomeSkipBtn').addEventListener('click', () => {
  localStorage.setItem(WELCOME_SEEN_KEY, 'true');
  screenStack.length = 0;
  goToPostWelcomeScreen();
});

// ---------------------------------------------------------------------
// Init — splash stays up while the TF.js model preloads from cache
// (Section 3: functional, not just decorative), then routes to
// Welcome (first run) or straight to Operator/Home.
// ---------------------------------------------------------------------
(async function init() {
  const splashStart = Date.now();
  const MIN_SPLASH_MS = 500;

  try {
    await loadModel();
  } catch (err) {
    console.warn('Model preload failed, will retry at first inference:', err);
  }

  const elapsed = Date.now() - splashStart;
  if (elapsed < MIN_SPLASH_MS) {
    await new Promise((r) => setTimeout(r, MIN_SPLASH_MS - elapsed));
  }

  document.getElementById('splashScreen').classList.add('hidden');

  if (!localStorage.getItem(WELCOME_SEEN_KEY)) {
    showWelcomeSlide(0);
    showScreen('screen-welcome', { push: false });
  } else {
    goToPostWelcomeScreen();
  }
})();
