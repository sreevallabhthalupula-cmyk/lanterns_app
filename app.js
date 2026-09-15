/**
 * app.js — screen navigation, patient intake, mock ABHA, capture flow,
 * and localStorage case persistence for the DR Screening PWA.
 */

const STORAGE_KEY = 'dr_pwa_cases';
const MAX_STORED_IMAGE_DIM = 800; // downscale captured images before persisting to localStorage

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------
const screenStack = ['screen-home'];

function showScreen(id, opts = {}) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  if (opts.push !== false) {
    screenStack.push(id);
  }

  const titles = {
    'screen-home': 'DR Screening',
    'screen-intake': 'Patient Intake',
    'screen-abha': 'Link ABHA ID',
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
// Draft case state (accumulated across intake -> abha -> capture)
// ---------------------------------------------------------------------
let draftCase = null;

function newDraftCase() {
  return {
    id: 'case_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
    patient: null,
    abhaId: null,
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
    substanceUse: getRadioValue('f_substanceUse'),
    substanceUseDetails: document.getElementById('f_substanceUseDetails').value.trim(),
  };

  showScreen('screen-abha');
});

// ---------------------------------------------------------------------
// Mock ABHA
// ---------------------------------------------------------------------
document.getElementById('abhaContinueBtn').addEventListener('click', () => {
  draftCase.abhaId = document.getElementById('f_abhaId').value.trim() || null;
  goToCapture();
});
document.getElementById('abhaSkipBtn').addEventListener('click', () => {
  draftCase.abhaId = null;
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
    <div class="verdict-banner fail">RECAPTURE — ${fundusCheck.reason}</div>
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
    el.innerHTML = `<div class="verdict-banner pass">Image quality: PASS</div>`;
  } else {
    el.innerHTML = `
      <div class="verdict-banner fail">RECAPTURE — ${quality.reason}</div>
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

function renderHistoryList() {
  const cases = loadCases();
  const listEl = document.getElementById('historyList');

  if (cases.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No screenings saved yet.</div>`;
    return;
  }

  listEl.innerHTML = cases
    .map(
      (c) => `
    <div class="case-list-item" data-id="${c.id}">
      <div>
        <div class="name">${escapeHtml(c.patient?.name || 'Unnamed')}</div>
        <div class="meta">${new Date(c.createdAt).toLocaleString()} · ${
        c.result ? c.result.label : 'No result'
      }</div>
      </div>
      <span class="status-chip ${statusChipClass(c.reviewStatus)}">${c.reviewStatus}</span>
    </div>
  `
    )
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

  body.innerHTML = `
    <h2>${escapeHtml(p.name || 'Unnamed')}</h2>
    <p class="desc">${new Date(c.createdAt).toLocaleString()}</p>
    <span class="status-chip ${statusChipClass(c.reviewStatus)}">${c.reviewStatus}</span>
    ${c.reviewedAt ? `<div class="meta" style="margin-top:4px">Reviewed: ${new Date(c.reviewedAt).toLocaleString()}</div>` : ''}

    ${c.imageDataUrl ? `<div class="capture-area" style="margin-top:16px"><img class="preview" src="${c.imageDataUrl}" /></div>` : ''}

    ${
      r.label
        ? `
      <div class="notice info">AI-assisted grading — screening aid, not a clinical diagnosis.</div>
      <div class="result-grade">${r.label}</div>
      <div class="result-confidence">Confidence: ${r.confidence}%</div>
      <div class="referral-badge ${r.referral?.level}">${r.referral?.text || ''}</div>
    `
        : ''
    }

    <table class="kv-table" style="margin-top:16px">
      <tr><td>Age</td><td>${escapeHtml(p.age || '')}</td></tr>
      <tr><td>Gender</td><td>${escapeHtml(p.gender || '')}</td></tr>
      <tr><td>Pregnancy / births</td><td>${escapeHtml(p.pregnancyOrBirths || '')}</td></tr>
      <tr><td>Family history of diabetes</td><td>${escapeHtml(p.familyHistoryDiabetes || '')}</td></tr>
      <tr><td>Diagnosed with diabetes</td><td>${escapeHtml(p.diagnosedDiabetes || '')}</td></tr>
      ${p.diabetesDuration ? `<tr><td>Duration of diabetes</td><td>${escapeHtml(p.diabetesDuration)}</td></tr>` : ''}
      <tr><td>Other medical conditions</td><td>${escapeHtml(p.otherConditions || '—')}</td></tr>
      <tr><td>Smoking/tobacco/narcotic use</td><td>${escapeHtml(p.substanceUse || '')} ${escapeHtml(
    p.substanceUseDetails ? '— ' + p.substanceUseDetails : ''
  )}</td></tr>
      <tr><td>ABHA ID</td><td>${escapeHtml(c.abhaId || 'Not linked (demo)')}</td></tr>
    </table>

    <div class="card" style="margin-top:16px;padding:16px">
      <h2 style="font-size:15px">Reviewer Actions</h2>
      <div class="notice demo">
        Simulated human-in-the-loop review step for demo purposes only — not a real
        clinician authentication system or portal. Anyone with this device can click
        these buttons.
      </div>
      <div class="btn-row">
        <button class="btn success" id="approveBtn" ${c.reviewStatus === 'Approved' ? 'disabled' : ''}>Approve</button>
        <button class="btn danger" id="flagBtn" ${c.reviewStatus === 'Flagged for Review' ? 'disabled' : ''}>Flag for Review</button>
      </div>
      <button class="btn secondary" id="downloadPdfBtn" style="margin-top:10px">Download PDF Report</button>
    </div>
  `;

  document.getElementById('approveBtn')?.addEventListener('click', () => {
    setCaseReviewStatus(c.id, 'Approved');
  });
  document.getElementById('flagBtn')?.addEventListener('click', () => {
    setCaseReviewStatus(c.id, 'Flagged for Review');
  });
  document.getElementById('downloadPdfBtn')?.addEventListener('click', () => {
    downloadCasePdf(c);
  });
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
// Init
// ---------------------------------------------------------------------
showScreen('screen-home', { push: false });
