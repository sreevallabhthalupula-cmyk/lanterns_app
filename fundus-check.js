/**
 * fundus-check.js
 *
 * Pre-quality-gate plausibility check: is this even a fundus-camera
 * photo (through a 20D lens attachment), before we bother running the
 * Phase 1 focus/illumination/FOV quality gate or the DR model on it?
 *
 * Pure deterministic image analysis -- no AI model, no hallucination
 * risk. Four independent classical signals, each voting pass/fail;
 * at least 3 of 4 must pass for the image to be accepted as a
 * plausible fundus photo.
 *
 *   1. Hard circular vignette  -- sharp near-black ring at the edge
 *   2. Optic disc detection    -- small bright compact blob
 *   3. Vessel-pattern check    -- many thin branching edge structures,
 *                                  spread across the frame
 *   4. Color profile (weak)    -- red-dominant, not flat/gray/blue-green
 *
 * All signals run on the SAME downscaled grayscale/RGB buffers as
 * quality-gate.js (capped at MAX_ANALYSIS_DIMENSION) for speed.
 */

const FUNDUS_CHECK_CONFIG = {
  MAX_ANALYSIS_DIMENSION: 512,

  // Signal 1: vignette
  // Thresholds below were re-calibrated against 10 real fundus photos
  // (mix of No_DR/Mild/Moderate/Severe/Proliferate_DR) after the original
  // values -- tuned only against synthetic test images with an
  // artificially hard black edge -- rejected 10/10 real images. Real
  // fundus vignettes fade gradually over many rings and the edge is a
  // dark reddish-brown, not near-black. See BLOCKERS.md for the numbers.
  VIGNETTE_RING_STEPS: 20, // radius samples from 0.5x to 1.0x of maxR
  VIGNETTE_ANGLE_SAMPLES: 72,
  VIGNETTE_SHARP_DROP: 5, // min brightness drop between adjacent ring samples (was 35; real fundus: 6.7-45.9, hand/nose: ~1.1)
  VIGNETTE_DARK_EDGE_MAX: 90, // outermost ring must be darker than this (was 30; real fundus: 0-67.1, hand/nose: 139-189)
  VIGNETTE_INTERIOR_MIN: 35, // r=0.5 ring must be brighter than this (not all-black photo)

  // Signal 2: optic disc
  DISC_GRID: 20,
  DISC_MIN_MARGIN: 40, // brightest cell must exceed overall mean by this much
  DISC_HOT_TOLERANCE: 22,
  DISC_MIN_FRACTION: 0.0025, // >=1 cell out of 400
  DISC_MAX_FRACTION: 0.15,
  DISC_MAX_ASPECT: 2.6,
  DISC_MAX_CENTER_DIST_FRAC: 0.9, // peak must be within this fraction of maxR from center

  // Signal 3: vessel pattern
  VESSEL_INNER_RADIUS_FRAC: 0.82, // exclude the vignette ring itself
  VESSEL_GRADIENT_STD_MULT: 1.15,
  VESSEL_MIN_COMPONENT_SIZE: 5,
  VESSEL_MAX_COMPONENT_SIZE_FRAC: 0.01, // relative to inner-circle area
  VESSEL_MAX_FILL_RATIO: 0.4, // thin/sparse within its own bounding box
  VESSEL_MIN_QUALIFYING_COMPONENTS: 12,
  VESSEL_GRID: 6,
  VESSEL_MIN_CELLS_HIT: 7, // out of VESSEL_GRID^2

  // Signal 4: color profile
  COLOR_MIN_RED_DOMINANCE: 8, // meanR - meanB
  COLOR_MIN_SPREAD: 12, // max(meanR,meanG,meanB) - min(...)
};

// ---------------------------------------------------------------------
// Shared helpers (downscale + grayscale, matching quality-gate.js)
// ---------------------------------------------------------------------
function fcGetDownscaledImageData(source, maxDim) {
  const srcWidth = source.videoWidth || source.naturalWidth || source.width;
  const srcHeight = source.videoHeight || source.naturalHeight || source.height;
  const scale = Math.min(1, maxDim / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function fcToGrayscale(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

function fcBilinearSample(gray, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) {
    const cx = Math.min(Math.max(Math.round(x), 0), width - 1);
    const cy = Math.min(Math.max(Math.round(y), 0), height - 1);
    return gray[cy * width + cx];
  }
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const v00 = gray[y0 * width + x0];
  const v10 = gray[y0 * width + x0 + 1];
  const v01 = gray[(y0 + 1) * width + x0];
  const v11 = gray[(y0 + 1) * width + x0 + 1];
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}

// ---------------------------------------------------------------------
// Signal 1: hard circular vignette
// ---------------------------------------------------------------------
function checkVignette(gray, width, height, cfg) {
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) / 2;

  const ringMeans = [];
  for (let s = 0; s < cfg.VIGNETTE_RING_STEPS; s++) {
    const frac = 0.5 + (0.5 * s) / (cfg.VIGNETTE_RING_STEPS - 1); // 0.5 -> 1.0
    const r = frac * maxR;
    let sum = 0;
    let count = 0;
    for (let a = 0; a < cfg.VIGNETTE_ANGLE_SAMPLES; a++) {
      const theta = (2 * Math.PI * a) / cfg.VIGNETTE_ANGLE_SAMPLES;
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);
      if (x >= 0 && x < width && y >= 0 && y < height) {
        sum += fcBilinearSample(gray, width, height, x, y);
        count++;
      }
    }
    ringMeans.push(count > 0 ? sum / count : 0);
  }

  let maxDrop = 0;
  let dropIndex = -1;
  for (let i = 1; i < ringMeans.length; i++) {
    const drop = ringMeans[i - 1] - ringMeans[i];
    if (drop > maxDrop) {
      maxDrop = drop;
      dropIndex = i;
    }
  }

  const outerMean = (ringMeans[ringMeans.length - 1] + ringMeans[ringMeans.length - 2]) / 2;
  const interiorMean = ringMeans[0];

  const sharpTransition = maxDrop >= cfg.VIGNETTE_SHARP_DROP;
  const darkEdge = outerMean <= cfg.VIGNETTE_DARK_EDGE_MAX;
  const hasInterior = interiorMean >= cfg.VIGNETTE_INTERIOR_MIN;

  const pass = sharpTransition && darkEdge && hasInterior;

  return {
    pass,
    detail: {
      maxDrop: round1(maxDrop),
      dropIndex,
      outerMean: round1(outerMean),
      interiorMean: round1(interiorMean),
      sharpTransition,
      darkEdge,
      hasInterior,
    },
  };
}

// ---------------------------------------------------------------------
// Signal 2: optic disc detection (grid-based bright compact blob)
// ---------------------------------------------------------------------
function checkOpticDisc(gray, width, height, cfg) {
  const grid = cfg.DISC_GRID;
  const cellW = width / grid;
  const cellH = height / grid;
  const cellMean = new Float32Array(grid * grid);
  let overallSum = 0;

  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const x0 = Math.floor(col * cellW);
      const x1 = Math.floor((col + 1) * cellW);
      const y0 = Math.floor(row * cellH);
      const y1 = Math.floor((row + 1) * cellH);
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += gray[y * width + x];
          count++;
        }
      }
      const m = count > 0 ? sum / count : 0;
      cellMean[row * grid + col] = m;
      overallSum += m;
    }
  }
  const overallMean = overallSum / (grid * grid);

  let peakIdx = 0;
  for (let i = 1; i < cellMean.length; i++) {
    if (cellMean[i] > cellMean[peakIdx]) peakIdx = i;
  }
  const peakMean = cellMean[peakIdx];
  const brightnessMargin = peakMean - overallMean;

  // flood fill from the peak cell to find the connected "hot" blob
  const threshold = peakMean - cfg.DISC_HOT_TOLERANCE;
  const visited = new Uint8Array(grid * grid);
  const stack = [peakIdx];
  visited[peakIdx] = 1;
  let minRow = Math.floor(peakIdx / grid);
  let maxRow = minRow;
  let minCol = peakIdx % grid;
  let maxCol = minCol;
  let hotCount = 0;
  let sumRow = 0;
  let sumCol = 0;

  while (stack.length) {
    const idx = stack.pop();
    const row = Math.floor(idx / grid);
    const col = idx % grid;
    hotCount++;
    sumRow += row;
    sumCol += col;
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);

    const neighbors = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ];
    for (const [nr, nc] of neighbors) {
      if (nr < 0 || nr >= grid || nc < 0 || nc >= grid) continue;
      const nIdx = nr * grid + nc;
      if (visited[nIdx]) continue;
      if (cellMean[nIdx] >= threshold) {
        visited[nIdx] = 1;
        stack.push(nIdx);
      }
    }
  }

  const bboxW = maxCol - minCol + 1;
  const bboxH = maxRow - minRow + 1;
  const aspect = Math.max(bboxW, bboxH) / Math.min(bboxW, bboxH);
  const totalCells = grid * grid;
  const hotFraction = hotCount / totalCells;

  const centroidRow = sumRow / hotCount;
  const centroidCol = sumCol / hotCount;
  const gridCenter = (grid - 1) / 2;
  const centerDistFrac = Math.hypot(centroidRow - gridCenter, centroidCol - gridCenter) / (grid / 2);

  const marginOk = brightnessMargin >= cfg.DISC_MIN_MARGIN;
  const sizeOk = hotFraction >= cfg.DISC_MIN_FRACTION && hotFraction <= cfg.DISC_MAX_FRACTION;
  const shapeOk = aspect <= cfg.DISC_MAX_ASPECT;
  const positionOk = centerDistFrac <= cfg.DISC_MAX_CENTER_DIST_FRAC;

  const pass = marginOk && sizeOk && shapeOk && positionOk;

  return {
    pass,
    detail: {
      brightnessMargin: round1(brightnessMargin),
      hotCellCount: hotCount,
      hotFractionPct: round1(hotFraction * 100),
      aspect: round1(aspect),
      centerDistFrac: round1(centerDistFrac),
      marginOk,
      sizeOk,
      shapeOk,
      positionOk,
    },
  };
}

// ---------------------------------------------------------------------
// Signal 3: vessel pattern (thin branching edges, spread across frame)
// ---------------------------------------------------------------------
function checkVesselPattern(gray, width, height, cfg) {
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) / 2;
  const innerR = maxR * cfg.VESSEL_INNER_RADIUS_FRAC;

  // Sobel gradient magnitude
  const mag = new Float32Array(width * height);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > innerR * innerR) continue;

      const gx =
        -gray[(y - 1) * width + (x - 1)] +
        gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] +
        2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] +
        gray[(y + 1) * width + (x + 1)];
      const gy =
        -gray[(y - 1) * width + (x - 1)] -
        2 * gray[(y - 1) * width + x] -
        gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] +
        2 * gray[(y + 1) * width + x] +
        gray[(y + 1) * width + (x + 1)];
      const m = Math.sqrt(gx * gx + gy * gy);
      mag[y * width + x] = m;
      sum += m;
      sumSq += m * m;
      n++;
    }
  }
  const mean = n > 0 ? sum / n : 0;
  const variance = n > 0 ? sumSq / n - mean * mean : 0;
  const std = Math.sqrt(Math.max(0, variance));
  const threshold = mean + cfg.VESSEL_GRADIENT_STD_MULT * std;

  // binarize
  const edge = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > innerR * innerR) continue;
      if (mag[y * width + x] > threshold) edge[y * width + x] = 1;
    }
  }

  // connected components (4-connectivity, iterative BFS)
  const labels = new Int32Array(width * height).fill(-1);
  const innerArea = Math.PI * innerR * innerR;
  const maxComponentSize = innerArea * cfg.VESSEL_MAX_COMPONENT_SIZE_FRAC;

  let qualifyingCount = 0;
  const grid = cfg.VESSEL_GRID;
  const cellHit = new Uint8Array(grid * grid);
  const queue = new Int32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const startIdx = y * width + x;
      if (!edge[startIdx] || labels[startIdx] !== -1) continue;

      let qHead = 0;
      let qTail = 0;
      queue[qTail++] = startIdx;
      labels[startIdx] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, count = 0;
      let sumX = 0, sumY = 0;

      while (qHead < qTail) {
        const idx = queue[qHead++];
        const py = Math.floor(idx / width);
        const px = idx % width;
        count++;
        sumX += px;
        sumY += py;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);

        const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
        for (const nIdx of neighbors) {
          if (nIdx < 0 || nIdx >= width * height) continue;
          if (!edge[nIdx] || labels[nIdx] !== -1) continue;
          labels[nIdx] = 1;
          queue[qTail++] = nIdx;
        }
      }

      const bboxW = maxX - minX + 1;
      const bboxH = maxY - minY + 1;
      const fillRatio = count / (bboxW * bboxH);

      const sizeOk = count >= cfg.VESSEL_MIN_COMPONENT_SIZE && count <= maxComponentSize;
      const thin = fillRatio <= cfg.VESSEL_MAX_FILL_RATIO;

      if (sizeOk && thin) {
        qualifyingCount++;
        const cRow = Math.min(grid - 1, Math.floor(((sumY / count) / height) * grid));
        const cCol = Math.min(grid - 1, Math.floor(((sumX / count) / width) * grid));
        cellHit[cRow * grid + cCol] = 1;
      }
    }
  }

  let distinctCellsHit = 0;
  for (let i = 0; i < cellHit.length; i++) if (cellHit[i]) distinctCellsHit++;

  const countOk = qualifyingCount >= cfg.VESSEL_MIN_QUALIFYING_COMPONENTS;
  const spreadOk = distinctCellsHit >= cfg.VESSEL_MIN_CELLS_HIT;
  const pass = countOk && spreadOk;

  return {
    pass,
    detail: {
      qualifyingCount,
      distinctCellsHit,
      countOk,
      spreadOk,
    },
  };
}

// ---------------------------------------------------------------------
// Signal 4: color profile (weak supporting signal)
// ---------------------------------------------------------------------
function checkColorProfile(imageData, width, height, cfg) {
  const { data } = imageData;
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) / 2;
  const innerR = maxR * 0.85;

  let sumR = 0, sumG = 0, sumB = 0, n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > innerR * innerR) continue;
      const idx = (y * width + x) * 4;
      sumR += data[idx];
      sumG += data[idx + 1];
      sumB += data[idx + 2];
      n++;
    }
  }
  const meanR = n > 0 ? sumR / n : 0;
  const meanG = n > 0 ? sumG / n : 0;
  const meanB = n > 0 ? sumB / n : 0;

  const redDominance = meanR - meanB;
  const spread = Math.max(meanR, meanG, meanB) - Math.min(meanR, meanG, meanB);

  const redDominant = redDominance >= cfg.COLOR_MIN_RED_DOMINANCE;
  const notFlatOrGray = spread >= cfg.COLOR_MIN_SPREAD;

  const pass = redDominant && notFlatOrGray;

  return {
    pass,
    detail: {
      meanR: round1(meanR),
      meanG: round1(meanG),
      meanB: round1(meanB),
      redDominance: round1(redDominance),
      spread: round1(spread),
      redDominant,
      notFlatOrGray,
    },
  };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

// ---------------------------------------------------------------------
// Combined check
// ---------------------------------------------------------------------
/**
 * Debug mode: when true, every call logs each signal's pass/fail and its
 * underlying detail scores to the console, and renderFundusCheckFailure()
 * (app.js) shows the same breakdown in the rejection banner. Toggle from
 * the console with `FUNDUS_DEBUG = true` or `localStorage.setItem('dr_pwa_fundus_debug','1')`.
 */
let FUNDUS_DEBUG = typeof localStorage !== 'undefined' && localStorage.getItem('dr_pwa_fundus_debug') === '1';

function fcLogDebug(result) {
  const { signals, passCount, pass } = result;
  console.log(
    `[fundus-check] verdict=${pass ? 'PASS' : 'FAIL'} passCount=${passCount}/4 (vignette mandatory)`
  );
  console.log('[fundus-check] vignette       :', signals.vignette.pass, signals.vignette.detail);
  console.log('[fundus-check] opticDisc      :', signals.opticDisc.pass, signals.opticDisc.detail);
  console.log('[fundus-check] vesselPattern  :', signals.vesselPattern.pass, signals.vesselPattern.detail);
  console.log('[fundus-check] colorProfile   :', signals.colorProfile.pass, signals.colorProfile.detail);
}

/**
 * @param {HTMLCanvasElement|HTMLImageElement|HTMLVideoElement} source
 * @returns {{pass: boolean, reason: string|null, passCount: number, signals: object}}
 */
function runFundusPlausibilityCheck(source) {
  const cfg = FUNDUS_CHECK_CONFIG;
  const imageData = fcGetDownscaledImageData(source, cfg.MAX_ANALYSIS_DIMENSION);
  const { width, height } = imageData;
  const gray = fcToGrayscale(imageData);

  const vignette = checkVignette(gray, width, height, cfg);
  const opticDisc = checkOpticDisc(gray, width, height, cfg);
  const vesselPattern = checkVesselPattern(gray, width, height, cfg);
  const colorProfile = checkColorProfile(imageData, width, height, cfg);

  const signals = { vignette, opticDisc, vesselPattern, colorProfile };
  const passCount = Object.values(signals).filter((s) => s.pass).length;
  // Real-image validation (see BLOCKERS.md) showed 3-of-4 was too strict --
  // loosened to 2-of-4. Vignette stays mandatory: it's the one signal that
  // reliably distinguishes an actual fundus-lens photo from a phone photo
  // of literally anything else, so a real fundus image failing it would be
  // a lens/capture problem worth surfacing, not something to paper over by
  // just counting it as one of many equally-weighted votes.
  const pass = vignette.pass && passCount >= 2;

  const result = {
    pass,
    reason: pass
      ? null
      : 'This doesn’t appear to be a retinal image captured through the lens attachment — please recapture using the fundus lens, centered on one eye.',
    passCount,
    signals,
  };

  if (FUNDUS_DEBUG) fcLogDebug(result);

  return result;
}

if (typeof window !== 'undefined') {
  window.runFundusPlausibilityCheck = runFundusPlausibilityCheck;
  window.FUNDUS_CHECK_CONFIG = FUNDUS_CHECK_CONFIG;
  Object.defineProperty(window, 'FUNDUS_DEBUG', {
    get: () => FUNDUS_DEBUG,
    set: (v) => {
      FUNDUS_DEBUG = !!v;
      try {
        localStorage.setItem('dr_pwa_fundus_debug', FUNDUS_DEBUG ? '1' : '0');
      } catch (e) {}
    },
  });
}
