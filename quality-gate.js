/**
 * quality-gate.js
 * Client-side image quality gate for retinal fundus images.
 * No model dependency — pure canvas/pixel analysis.
 *
 * Checks (in this order):
 *   1. Focus       — Laplacian variance of grayscale image (blur detection)
 *   2. Illumination — mean pixel intensity (too dark / overexposed)
 *   3. Field of view — fraction of non-black pixels (retinal disc coverage)
 *
 * Thresholds are fixed per spec:
 *   focusVariance < 50   -> "Image too blurry"
 *   meanIntensity < 40   -> "Image too dark"
 *   meanIntensity > 220  -> "Image overexposed"
 *   fovFraction  < 0.55  -> "Insufficient retinal field of view"
 */

const QUALITY_THRESHOLDS = {
  MIN_FOCUS_VARIANCE: 50,
  MIN_MEAN_INTENSITY: 40,
  MAX_MEAN_INTENSITY: 220,
  MIN_FOV_FRACTION: 0.55,
  // pixel is considered "non-black" (part of the imaged field) above this
  // grayscale value; separates the retinal disc from the surrounding
  // black border that fundus cameras typically produce.
  NON_BLACK_THRESHOLD: 10,
  // analysis is done on a downscaled copy for speed; this doesn't change
  // the statistics meaningfully for these metrics but keeps things fast
  // even on large camera captures.
  MAX_ANALYSIS_DIMENSION: 512,
};

/**
 * Draws an image (HTMLImageElement, HTMLVideoElement, or ImageBitmap) onto a
 * scratch canvas, downscaled so the longest side is at most maxDim, and
 * returns the resulting ImageData.
 */
function getDownscaledImageData(source, maxDim) {
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

/** Converts RGBA ImageData to a Float32Array of grayscale luminance values. */
function toGrayscale(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // standard luminance weighting
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return { gray, width, height };
}

/**
 * Computes the variance of the Laplacian response of a grayscale image.
 * Low variance = few sharp edges = blurry image. This is the standard
 * OpenCV-style blur detector, reimplemented in plain JS.
 */
function laplacianVariance(gray, width, height) {
  // 3x3 Laplacian kernel: [[0,1,0],[1,-4,1],[0,1,0]]
  const responses = new Float32Array((width - 2) * (height - 2));
  let idx = 0;
  let sum = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = gray[y * width + x];
      const up = gray[(y - 1) * width + x];
      const down = gray[(y + 1) * width + x];
      const left = gray[y * width + (x - 1)];
      const right = gray[y * width + (x + 1)];

      const response = up + down + left + right - 4 * center;
      responses[idx++] = response;
      sum += response;
    }
  }

  const n = responses.length;
  if (n === 0) return 0;

  const mean = sum / n;
  let sqDiffSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = responses[i] - mean;
    sqDiffSum += diff * diff;
  }
  return sqDiffSum / n;
}

/** Mean grayscale intensity, 0-255. */
function meanIntensity(gray) {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  return sum / gray.length;
}

/** Fraction of pixels above the non-black threshold. */
function fovFraction(gray, threshold) {
  let count = 0;
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] > threshold) count++;
  }
  return count / gray.length;
}

/**
 * Runs the full quality gate on an image source.
 *
 * @param {HTMLImageElement|HTMLVideoElement|ImageBitmap|ImageData} source
 * @returns {{pass: boolean, reason: string|null, metrics: {focusVariance: number, meanIntensity: number, fovFraction: number}}}
 */
function runQualityGate(source) {
  const imageData =
    source instanceof ImageData
      ? source
      : getDownscaledImageData(source, QUALITY_THRESHOLDS.MAX_ANALYSIS_DIMENSION);

  const { gray, width, height } = toGrayscale(imageData);

  const focusVariance = laplacianVariance(gray, width, height);
  const mean = meanIntensity(gray);
  const fov = fovFraction(gray, QUALITY_THRESHOLDS.NON_BLACK_THRESHOLD);

  const metrics = {
    focusVariance: Math.round(focusVariance * 100) / 100,
    meanIntensity: Math.round(mean * 100) / 100,
    fovFraction: Math.round(fov * 1000) / 1000,
  };

  // checks run in a fixed priority order: focus, then illumination, then FOV
  if (focusVariance < QUALITY_THRESHOLDS.MIN_FOCUS_VARIANCE) {
    return { pass: false, reason: 'Image too blurry', metrics };
  }
  if (mean < QUALITY_THRESHOLDS.MIN_MEAN_INTENSITY) {
    return { pass: false, reason: 'Image too dark', metrics };
  }
  if (mean > QUALITY_THRESHOLDS.MAX_MEAN_INTENSITY) {
    return { pass: false, reason: 'Image overexposed', metrics };
  }
  if (fov < QUALITY_THRESHOLDS.MIN_FOV_FRACTION) {
    return { pass: false, reason: 'Insufficient retinal field of view', metrics };
  }

  return { pass: true, reason: null, metrics };
}

// Exposed for use by both the standalone test page and the main app.
if (typeof window !== 'undefined') {
  window.runQualityGate = runQualityGate;
  window.QUALITY_THRESHOLDS = QUALITY_THRESHOLDS;
}
