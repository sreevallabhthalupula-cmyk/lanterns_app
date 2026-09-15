/**
 * export.js — facility-level CSV/JSON case export (Section 4).
 *
 * Complements the per-patient PDF, which doesn't serve aggregate
 * reporting. Client-side generation only, same self-hosted-library
 * pattern as everything else -- no backend. Image data URLs are
 * deliberately excluded (large, meaningless in a spreadsheet, and this
 * is an aggregate report, not a per-patient image export).
 */

function caseToExportRow(c) {
  const p = c.patient || {};
  const r = c.result || {};
  const interval = r.grade != null ? getReferralInterval(r.grade).interval : '';
  return {
    caseId: c.id,
    date: c.createdAt,
    patientName: p.name || '',
    age: p.age || '',
    gender: p.gender || '',
    grade: r.grade ?? '',
    gradeLabel: r.label || '',
    confidence: r.confidence ?? '',
    referralStatus: r.referral?.text || '',
    followUpInterval: interval,
    reviewStatus: c.reviewStatus || '',
    reviewedAt: c.reviewedAt || '',
    abhaId: c.abhaId || '',
    operatorName: c.operatorName || '',
    facility: c.facility || '',
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCasesAsCSV() {
  const rows = loadCases().map(caseToExportRow);
  if (rows.length === 0) {
    alert('No cases to export yet.');
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  downloadBlob(lines.join('\n'), `dr-screening-cases-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
}

function exportCasesAsJSON() {
  const rows = loadCases().map(caseToExportRow);
  if (rows.length === 0) {
    alert('No cases to export yet.');
    return;
  }
  downloadBlob(
    JSON.stringify(rows, null, 2),
    `dr-screening-cases-${new Date().toISOString().slice(0, 10)}.json`,
    'application/json'
  );
}

if (typeof window !== 'undefined') {
  window.exportCasesAsCSV = exportCasesAsCSV;
  window.exportCasesAsJSON = exportCasesAsJSON;
}
