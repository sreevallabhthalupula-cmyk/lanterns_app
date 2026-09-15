/**
 * segmentation.js — per-structure lesion mask loading for the results
 * viewer (spec Section 3 / Section 1 lazy-load decision).
 *
 * The U-Net segmentation model has NOT been trained/exported yet (spec
 * Section 3 requires a MATLAB training run this environment can't run).
 * Per Section 1, its weights are deliberately excluded from the app-shell
 * cache and are only fetched when a structure tab is opened here -- this
 * module is that fetch point. Until real weights exist, it reports
 * "not available" rather than fabricating a mask, matching the project's
 * standing rule against showing output the app can't back up.
 *
 * Wiring in the real model later: replace the body of loadStructureMask
 * with a TF.js graph-model load (lazy, cached in `modelPromise` below)
 * + inference producing a per-pixel class mask, then rasterize the
 * requested structure's channel to a canvas and return its data URL.
 */

const STRUCTURE_KEYS = ['segmentation', 'microaneurysm', 'hard_exudate', 'soft_exudate', 'optic_disc', 'haemorrhage'];

let segModelPromise = null; // set once Section 3 delivers tfjs_model_seg/model.json

/**
 * @param {string} caseId
 * @param {string} structureKey - one of STRUCTURE_KEYS
 * @returns {Promise<{available: boolean, overlayDataUrl: string|null}>}
 */
async function loadStructureMask(caseId, structureKey) {
  if (!segModelPromise) {
    // Section 3 integration point: no segmentation model shipped yet.
    return { available: false, overlayDataUrl: null };
  }
  // Real path once wired: await segModelPromise, run inference on the
  // case's stored image, extract the structureKey channel, return a
  // data URL sized to the source image for direct <img> overlay.
  return { available: false, overlayDataUrl: null };
}

if (typeof window !== 'undefined') {
  window.STRUCTURE_KEYS = STRUCTURE_KEYS;
  window.loadStructureMask = loadStructureMask;
}
