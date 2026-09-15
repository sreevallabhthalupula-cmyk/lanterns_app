/**
 * inference.js
 *
 * PHASE 4 — real model wired up. drNet.onnx (ResNet18 transfer-learned on
 * APTOS 2019, converted to a TF.js graph model under tfjs_model/) replaces
 * the Phase 1-3 placeholder.
 *
 * Preprocessing and class-order/normalization constants below were decoded
 * directly from drNet.mat's DAGNetwork object (ImageInputLayer + Classes
 * properties), not assumed -- see project notes. Verified against the
 * original ONNX model (onnxruntime) and the intermediate TF SavedModel:
 * all three (ONNX, SavedModel, this TF.js graph model) produce matching
 * softmax output on the same test image.
 *
 *   runInference(imageSource) -> Promise<{
 *     grade: 0|1|2|3|4,
 *     label: string,
 *     confidence: number,      // 0-100, raw softmax value for predicted class
 *     referral: {level, text},
 *   }>
 *
 * imageSource can be any element tf.browser.fromPixels() accepts (canvas,
 * img, video) -- the caller is expected to have already passed it through
 * the Phase 1 quality gate.
 *
 * KNOWN LIMITATION: drNet only outputs 5-class DR severity. It has no
 * macular edema / CSME head, so no CSME field is produced here -- per
 * product decision (2026-09-15), we don't show a flag we can't back up.
 * A future CSME-capable model plugs in at the marked spot below.
 */

const MODEL_URL = 'tfjs_model/model.json';

// Decoded from drNet.mat's ImageInputLayer.Normalization ('zscore') and
// Mean/Std properties. Order is R,G,B (fundus images are red-dominant --
// mean[0] >> mean[2] -- which is a strong self-consistency check that this
// is the correct channel order).
const MEAN = [103.22674560546875, 55.19105911254883, 18.386537551879883];
const STD = [70.68042755126953, 38.57248306274414, 20.664936065673828];
const INPUT_SIZE = 224;

// Decoded from drNet.mat's Classes categorical property: the 5 class-name
// strings are stored alphabetically (Mild, Moderate, No_DR, Proliferate_DR,
// Severe) followed by codes [1,2,3,4,5] -- MATLAB's default categorical
// ordering from imageDatastore folder names. This is DIFFERENT from a
// naive severity-order assumption, and was verified (not assumed) by
// reading the raw bytes of the .mat file's MCOS object.
const CLASS_ORDER = ['Mild', 'Moderate', 'No_DR', 'Proliferate_DR', 'Severe'];
const DR_GRADE_LABELS = {
  0: 'No DR',
  1: 'Mild NPDR',
  2: 'Moderate NPDR',
  3: 'Severe NPDR',
  4: 'Proliferative DR',
};
const CLASS_TO_GRADE = { No_DR: 0, Mild: 1, Moderate: 2, Severe: 3, Proliferate_DR: 4 };

/**
 * Maps a DR grade to referral status per the PS's referral categories.
 * @param {0|1|2|3|4} grade
 * @returns {{level: 'non-referable'|'referable'|'urgent', text: string}}
 */
function getReferralStatus(grade) {
  if (grade <= 1) {
    return { level: 'non-referable', text: 'Non-referable — routine annual screening' };
  }
  if (grade === 2 || grade === 3) {
    return { level: 'referable', text: 'Referable — refer to eye specialist' };
  }
  return { level: 'urgent', text: 'Urgent referral — refer to eye specialist' };
}

let modelPromise = null;

/** Loads (and caches) the TF.js graph model. Safe to call repeatedly. */
function loadModel() {
  if (!modelPromise) {
    modelPromise = tf.loadGraphModel(MODEL_URL);
  }
  return modelPromise;
}

/**
 * Resizes the source image to 224x224 via a scratch canvas (matching how
 * the conversion was validated against the Python/ONNX baseline), then
 * builds the NHWC z-score-normalized input tensor the model expects.
 */
function preprocess(imageSource) {
  const resizeCanvas = document.createElement('canvas');
  resizeCanvas.width = INPUT_SIZE;
  resizeCanvas.height = INPUT_SIZE;
  resizeCanvas.getContext('2d').drawImage(imageSource, 0, 0, INPUT_SIZE, INPUT_SIZE);

  return tf.tidy(() => {
    let t = tf.browser.fromPixels(resizeCanvas, 3); // HWC, RGB, uint8
    t = t.toFloat();
    const mean = tf.tensor1d(MEAN);
    const std = tf.tensor1d(STD);
    t = t.sub(mean).div(std);
    t = t.expandDims(0); // NHWC (the converted graph is channels-last)
    return t;
  });
}

/**
 * Runs real inference with drNet (converted to TF.js) on the given image.
 * @param {ImageData|HTMLCanvasElement|HTMLImageElement} imageSource - the captured/uploaded retinal image (post quality-gate pass)
 * @returns {Promise<{grade: number, label: string, confidence: number, referral: object}>}
 */
async function runInference(imageSource) {
  const model = await loadModel();
  const input = preprocess(imageSource);

  let probs;
  try {
    const outputTensor = model.execute(input);
    probs = await outputTensor.data();
    outputTensor.dispose();
  } finally {
    input.dispose();
  }

  let topIdx = 0;
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > probs[topIdx]) topIdx = i;
  }

  const topClass = CLASS_ORDER[topIdx];
  const grade = CLASS_TO_GRADE[topClass];
  const confidence = Math.round(probs[topIdx] * 1000) / 10; // raw softmax value, 0-100%

  // CSME/macular-edema detection plugs in here once a model that actually
  // predicts it is integrated (drNet does not). Until then we deliberately
  // return nothing for it rather than a fake flag -- see product decision
  // 2026-09-15.

  return {
    grade,
    label: `Grade ${grade} — ${DR_GRADE_LABELS[grade]}`,
    confidence,
    referral: getReferralStatus(grade),
    _rawProbs: CLASS_ORDER.reduce((acc, cls, i) => {
      acc[cls] = Math.round(probs[i] * 10000) / 100;
      return acc;
    }, {}),
  };
}

if (typeof window !== 'undefined') {
  window.runInference = runInference;
  window.getReferralStatus = getReferralStatus;
  window.DR_GRADE_LABELS = DR_GRADE_LABELS;
  window.loadModel = loadModel; // exposed so the app can warm the model in advance
}
