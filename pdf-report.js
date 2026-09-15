/**
 * pdf-report.js — generates the DR screening PDF report (jsPDF, client-side).
 *
 * The PDF is NOT stored anywhere; it is built fresh from the case record
 * every time generateCasePDF() is called. That's what makes "regenerate
 * the PDF after a review decision" trivial -- the case record's
 * reviewStatus/reviewedAt fields are simply read again at generation time.
 *
 * Deliberately excluded: a CSME/macular-edema flag. drNet does not predict
 * CSME, so no such field exists on the case record and none is printed
 * here -- see inference.js for where that would plug in once a real
 * CSME-capable model exists.
 */

const STATUS_COLORS = {
  'Pending Ophthalmologist Review': [232, 163, 61], // amber
  'Approved': [46, 158, 90], // green
  'Flagged for Review': [200, 60, 50], // red
};

const REFERRAL_LABELS = {
  'non-referable': 'Non-referable',
  referable: 'Referable',
  urgent: 'Urgent referral',
};

/**
 * Builds the report PDF for a case and returns the jsPDF document instance
 * (caller decides whether to .save() it, open it in a new tab, etc.)
 * @param {object} c - a case record as stored in localStorage (see app.js)
 * @returns {import('jspdf').jsPDF}
 */
function buildCasePdf(c) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 50;

  const p = c.patient || {};
  const r = c.result || {};
  const status = c.reviewStatus || 'Pending Ophthalmologist Review';
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS['Pending Ophthalmologist Review'];

  // --- Header ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Diabetic Retinopathy Screening Report', margin, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Case ID: ${c.id}`, margin, y);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, y, { align: 'right' });
  y += 12;
  doc.text(`Screening date: ${new Date(c.createdAt).toLocaleString()}`, margin, y);
  doc.setTextColor(0);
  y += 22;

  // --- Status stamp ---
  doc.setDrawColor(...statusColor);
  doc.setFillColor(...statusColor);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 28, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(status.toUpperCase(), pageWidth / 2, y + 18, { align: 'center' });
  doc.setTextColor(0);
  y += 40;

  if (c.reviewedAt) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`Reviewed: ${new Date(c.reviewedAt).toLocaleString()}`, pageWidth / 2, y, { align: 'center' });
    doc.setTextColor(0);
    y += 18;
  }

  y += 6;
  doc.setDrawColor(210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // --- Patient information ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Patient Information', margin, y);
  y += 16;

  const rows = [
    ['Name', p.name || '—'],
    ['Age', p.age || '—'],
    ['Gender', p.gender || '—'],
    ['Pregnancy / births', p.pregnancyOrBirths || '—'],
    ['Family history of diabetes', p.familyHistoryDiabetes || '—'],
    ['Diagnosed with diabetes', p.diagnosedDiabetes || '—'],
  ];
  if (p.diagnosedDiabetes === 'Yes') {
    rows.push(['Duration of diabetes', p.diabetesDuration || '—']);
  }
  rows.push(['Other medical conditions', p.otherConditions || '—']);
  rows.push(['Smoking', p.smoking ? `${p.smoking}${p.smokingDetails ? ' — ' + p.smokingDetails : ''}` : '—']);
  rows.push(['Alcohol use', p.alcohol ? `${p.alcohol}${p.alcoholDetails ? ' — ' + p.alcoholDetails : ''}` : '—']);
  rows.push(['Drug use', p.drugUse ? `${p.drugUse}${p.drugUseDetails ? ' — ' + p.drugUseDetails : ''}` : '—']);
  rows.push(['Occupational exposure', p.occupationalExposure || '—']);
  rows.push(['ABHA ID', c.abhaId ? `${c.abhaId} (demo — not a real ABDM link)` : 'Not linked (demo)']);
  rows.push(['Captured by', c.operatorName ? `${c.operatorName}${c.facility ? ' — ' + c.facility : ''}` : '—']);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const labelWidth = 170;
  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(String(label), margin, y);
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(String(value), pageWidth - margin * 2 - labelWidth);
    doc.text(valueLines, margin + labelWidth, y);
    y += 14 * Math.max(1, valueLines.length);
  });

  y += 10;
  doc.setDrawColor(210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // --- AI screening result ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('AI-Assisted Screening Result', margin, y);
  y += 18;

  if (r.label) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DR grade:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(r.label), margin + labelWidth, y);
    y += 16;

    doc.setFont('helvetica', 'bold');
    doc.text('Confidence:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${r.confidence}%`, margin + labelWidth, y);
    y += 16;

    doc.setFont('helvetica', 'bold');
    doc.text('Referral status:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(r.referral?.text || '—', margin + labelWidth, y);
    y += 20;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('No AI screening result recorded for this case.', margin, y);
    y += 20;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  const disclaimer = doc.splitTextToSize(
    'This is an AI-assisted screening aid, not a clinical diagnosis. All results require review and sign-off ' +
      'by a qualified ophthalmologist before being acted on clinically.',
    pageWidth - margin * 2
  );
  doc.text(disclaimer, margin, y);
  doc.setTextColor(0);
  y += disclaimer.length * 11 + 14;

  // --- Retinal image ---
  if (c.imageDataUrl) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Captured Retinal Image', margin, y);
    y += 14;

    const maxImgWidth = pageWidth - margin * 2;
    const maxImgHeight = 220;
    try {
      // imageWidth/imageHeight are recorded on the case record at capture
      // time (see downscaleDataUrl in app.js) so the true aspect ratio is
      // known here without an async image decode. Falls back to a generic
      // 4:3 box for any older/malformed record missing those fields.
      const dims = { width: c.imageWidth || 4, height: c.imageHeight || 3 };
      let w = maxImgWidth;
      let h = (dims.height / dims.width) * w;
      if (h > maxImgHeight) {
        h = maxImgHeight;
        w = (dims.width / dims.height) * h;
      }
      const x = margin + (maxImgWidth - w) / 2;
      doc.addImage(c.imageDataUrl, 'JPEG', x, y, w, h);
      y += h + 10;
    } catch (err) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('(Image could not be embedded)', margin, y);
      y += 14;
    }
  }

  // --- Footer ---
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(150);
  doc.text(
    'Generated by a hackathon prototype PWA. Not a certified medical device. Demo-only ABHA link, no real ABDM ' +
      'integration.',
    margin,
    pageHeight - 24
  );
  doc.setTextColor(0);

  return doc;
}

/**
 * Generates and downloads the PDF report for a case.
 * @param {object} c - case record
 */
function downloadCasePdf(c) {
  const doc = buildCasePdf(c);
  const safeName = (c.patient?.name || 'patient').replace(/[^a-z0-9]+/gi, '_');
  doc.save(`DR_Report_${safeName}_${c.id}.pdf`);
}

if (typeof window !== 'undefined') {
  window.buildCasePdf = buildCasePdf;
  window.downloadCasePdf = downloadCasePdf;
}
