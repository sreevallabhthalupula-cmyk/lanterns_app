# DR Screening — Model & Architecture Upgrade Spec

**For:** Claude Code, working in `lanterns_app` (GitHub) + MATLAB Drive (`aptos2019` folder).
**Purpose:** Paste this whole file as context. It replaces re-deriving research — the decisions below are final, not options to re-litigate. Execute in the order given (Section 6). If something here conflicts with a file you find in the repo, the repo is ground truth for *current state*; this doc is ground truth for *what to build next*.

**Sources reviewed** (don't re-fetch these, everything usable is already extracted below): `Tirth27/Detecting-diabetic-retinopathy` (custom CNN + Ben Graham preprocessing), `Manoj-Sh-AI/Diabetic-Retinopathy-Detection-and-Clasification-System` (U-Net lesion segmentation on IDRiD, QWK 0.925 claimed), plus APTOS-2019 top-solution write-ups (`MamatShamshiev` top-3%, `tahsin314` top-2%, `khornlund` top-3%) and one 2026 paper on EfficientNetB0+attention for resource-limited deployment (QWK 0.923, AUC 0.976).

---

## 0. Apply first — pending fix from last session

`fundus-check.js`, in `runFundusPlausibilityCheck()`:
```diff
- const pass = passCount >= 3;
+ const pass = vignette.pass && passCount >= 3;
```
Vignette was the only signal with zero false-positives across 6 test images (2 real fundus, 2 hand/nose rejects, 2 new phone-camera tests). Making it mandatory fixes the indoor-palm false-accept without touching the other three signals. Independent of everything below — do this regardless of what else you take on this session.

---

## 1. Architectural decision

**Unchanged (do not revisit — these are closed decisions):** MATLAB training → `exportONNXNetwork()` → `onnx2tf` → TensorFlow SavedModel → TF.js → self-hosted in the PWA, fully offline, no backend. This satisfies both the hackathon's mandated toolchain and the rural-PHC offline requirement. Intake→ABHA→Capture order, localStorage, mocked ABHA — all unchanged.

**Changing:**

| Component | Was | Becomes | Why |
|---|---|---|---|
| Classifier backbone | ResNet-18, softmax 5-class, cross-entropy | EfficientNet-b0, regression head, MSE + class weighting | Every APTOS-2019 top-3% solution found EfficientNet beats ResNet at equal or smaller size; regression framing is what the actual competition winners used, not classification |
| Preprocessing | CLAHE only (quality-gate.js port) | Ben Graham radius-normalize + local-average subtraction, *then* CLAHE | Ben Graham's method is the single most-cited preprocessing step across every high-scoring APTOS solution; it's complementary to CLAHE, not a replacement |
| Deliverable #2 (segmentation) | Scoped out, Grad-CAM only | Real U-Net lesion segmentation (MA/HE/EX/SE/OD combined into one multi-channel net), MATLAB-side | Closes the one deliverable you've been honestly flagging as incomplete; IDRiD's segmentation set is only 81 images total, trains fast even on free-tier CPU |

**New deployment-split decision (this is the one genuinely new architectural call, flag it to judges as deliberate):** the segmentation net does **not** ship in the always-downloaded app-shell cache. It runs at training time to produce the deliverable and gets included in the pitch/report; if you want it live in the app too, lazy-load its TF.js weights only when a reviewer opens a "lesion detail" view on a referable case — not on first install. Reasoning: your `tfjs_model/` is already ~43MB one-time download for a rural connection; a second full segmentation net (even a lightweight one) roughly doubles that for a feature most operators won't open per-case. Lazy-loading keeps the base install light and still lets you demo real segmentation live if asked.

---

## 2. Classification model — the "best of all worlds" spec

### 2a. Preprocessing pipeline (apply in this order)
1. **Ben Graham radius-normalize + local-average subtract** (new step, insert before your existing CLAHE):
   ```matlab
   function out = benGrahamPreprocess(img, scale)
       % scale: target radius in px, use 300
       midRow = sum(im2double(img(round(size(img,1)/2), :, :)), 3);
       r = max(sum(midRow > mean(midRow)/10) / 2, 1);
       img = imresize(img, scale / r);

       blurred = imgaussfilt(img, scale/30);
       out = double(img)*4 - double(blurred)*4 + 128;
       out = uint8(min(max(out,0),255));

       [h,w,~] = size(out);
       [X,Y] = meshgrid(1:w,1:h);
       mask = ((X-w/2).^2 + (Y-h/2).^2) <= (0.9*scale)^2;
       for c = 1:3
           ch = out(:,:,c); ch(~mask) = 128; out(:,:,c) = ch;
       end
   end
   ```
2. Your existing CLAHE (`adapthisteq` on L channel) — keep as-is, runs *after* step 1.
3. Resize to 224×224 (EfficientNet-b0's native input size — same as your current pipeline, no resize-method mismatch risk introduced by this change).

### 2b. Model
```matlab
net = imagePretrainedNetwork("efficientnetb0", NumClasses=1);  % regression head, 1 output not 5
```
Requires the "Deep Learning Toolbox Model for EfficientNet-b0 Network" add-on (free, Add-On Explorer — same install pattern as your other toolboxes). **Before committing to a full retrain**, do a throwaway smoke test: build the net, run one `exportONNXNetwork()` on it untrained, confirm no placeholder-operator warnings for swish/grouped-conv/squeeze-excite layers. All three are individually documented as ONNX-export-supported, but verify on this exact network before spending a training run on it — this is the same conversion-fidelity risk category flagged in ADR-001.

### 2c. Loss & training
- **Regression, not classification**: predict a single continuous value in `[0,4]`, train with MSE. This is what the majority of top-3% APTOS solutions did — treating DR grade as ordinal (which it is) outperforms 5-way softmax.
- **Class weighting**: your current 85.57% sensitivity shortfall is a minority-class problem (referable grades 2-4 underrepresented vs. No_DR/Mild). Weight the MSE loss per-sample by inverse class frequency — this is the exact "class-weighted loss" fix you already rehearsed for judge Q&A, now with a concrete implementation path via `trainnet`'s custom-loss support.
- Augmentation: keep your existing rotation ±10°/X-reflection/scale, it's fine.
- Optimizer: Adam outperformed SGD in every top-solution write-up reviewed; switch from your current SGD if that's what train_classifierv2.m uses.

### 2d. Inference-time additions
- **TTA**: average predictions over the image and its horizontal flip. Cheap (2x inference, no extra download), used by nearly every top solution.
- **Optimized rounding thresholds** (not naive `round()`): after training, fit 4 cut-points on the validation set that maximize QWK directly, rather than rounding at 0.5/1.5/2.5/3.5. One top-3% write-up reported this as worth +0.003 QWK on its own — small but free once you have the regression output. `fminsearch` over 4 threshold values, objective = `-quadraticWeightedKappa(...)`, is enough.

### 2e. Considered and rejected (don't revisit)
- **Multi-model ensemble** (several papers ensemble 5+ EfficientNets): rejected — marginal QWK gain, multiplies on-device download size, conflicts with your offline-install budget. Single EfficientNet-b0 with the above training tricks gets you most of the available gain.
- **Joint left+right eye feature fusion** (the original 2015 Kaggle winner's approach): rejected for v1 — would require redesigning your per-eye TF.js inference into a joint-inference flow, and your current per-eye grading + worst-eye-determines-referral logic is already clinically correct (ETDRS grading is per-eye). Not worth the on-device architecture change for uncertain gain.

---

## 3. Segmentation add-on — closes deliverable #2

### Dataset
IDRiD Segmentation subset only — **81 images total** (54 train / 27 test), pixel-level masks for microaneurysms (MA), haemorrhages (HE), hard exudates (EX), soft exudates (SE), optic disc (OD). Available on Kaggle (search "IDRiD dataset segmentation") — same `kaggle datasets download` + `unzip()` pattern you already use for APTOS, works within MATLAB Online's no-folder-upload constraint. Small enough to train all structures in one CPU-only session — this is not a repeat of the APTOS-scale compute problem.

### Model — one multi-channel U-Net, not six separate nets
```matlab
imageSize = [256 256 3];
numClasses = 6;  % background + MA + HE + EX + SE + OD
lgraph = unet(imageSize, numClasses, EncoderNetwork="mobilenetv2");  % lightweight encoder, keeps size down for eventual on-device use
```
`EncoderNetwork` lets you swap in a pretrained lightweight backbone instead of the default full-depth U-Net encoder — use this rather than the default, it's the difference between a segmentation net you can plausibly lazy-load later and one you can't.

### Loss
Dice + cross-entropy combo (matches `Manoj-Sh-AI`'s PyTorch DiceBCE exactly, MATLAB has a native equivalent):
```matlab
function loss = segLoss(Y, T)
    diceTerm = 1 - mean(generalizedDice(Y, T), "all");
    ceTerm = crossentropy(Y, T);
    loss = diceTerm + ceTerm;
end
netTrained = trainnet(imds, lgraph, @segLoss, options);
```

### Output / integration
Feed the per-structure masks into your existing Grad-CAM report script (`04_gradcam_report.m`) as overlay layers — this upgrades your explainability module from "implicit CNN features + Grad-CAM" to actual lesion-level evidence, directly answering deliverable #2's "MAs, exudates, hemorrhages" requirement instead of the honest-but-partial coverage you've been flagging.

### Not adopting from `Manoj-Sh-AI`
Their paper's other contribution — LLM-generated treatment recommendations from segmentation output — needs either an on-device LLM or a backend API call. Both conflict with your no-backend/fully-offline constraint. Skip it; don't lose time evaluating it.

---

## 4. File-by-file change list

| File | Change |
|---|---|
| `fundus-check.js` | Section 0 one-line fix |
| `train_classifierv2.m` (or a new `train_classifier_v3.m`) | New preprocessing (2a) + EfficientNet-b0 regression (2b/2c) |
| new: `benGrahamPreprocess.m` | Section 2a function |
| `02_quality_gate.m` | No change — Ben Graham step is separate/new, runs before this |
| `04_gradcam_report.m` | Extend to overlay segmentation masks (Section 3) |
| new: `train_segmentation.m` | Section 3 U-Net training |
| `inference.js` | Re-verify class-order mapping and normalization stats against the *new* model — these are architecture-specific, don't assume last session's resnet18 values (mean=[103.23,55.19,18.39] etc.) carry over to EfficientNet-b0 |
| `sw.js` | Bump `CACHE_NAME` again once new model files land; decide cache-list entries per the lazy-load decision in Section 1 (segmentation weights likely should NOT be in `APP_SHELL_FILES`, fetched on-demand instead) |

---

## 5. Expected outcome
Current: 85.57% sensitivity / 96.55% specificity / QWK 0.820, deliverable #2 partial.
Target, based on comparable published results (EfficientNet-b0 + regression on APTOS-scale data): QWK in the 0.90-0.92 range, sensitivity improvement concentrated in referable classes (2-4) from the class-weighting fix specifically — that's the number to watch, not just aggregate accuracy. Segmentation: expect reasonable Dice scores on HE/EX/OD (larger, higher-contrast lesions) and weaker on MA (tiny, low-contrast — this is a known hard case in the literature, not a bug in your implementation if MA Dice comes in lower than the others).

---

## 6. Execution order (token-budget-aware)

1. Section 0 fix — trivial, do it in the first exchange.
2. **Before retraining anything**: run the still-outstanding real-fundus-image spot-check from the project status doc (Section 7, item 1) against the *current* model, so you have a true "before" baseline to compare the new model against. Don't skip this just because a bigger task is available — without it you can't tell how much of any future improvement is the new model vs. noise.
3. Classification upgrade (Section 2) — highest ROI, directly closes the sensitivity gap judges will ask about.
4. Segmentation add-on (Section 3) — independent of step 3, can be done in parallel/separately.
5. Re-run the spot-check + re-verify class-order/normalization (Section 4 note on `inference.js`) before declaring either piece done.
6. Update the project status doc with new metrics once training actually completes — don't guess numbers into it ahead of time.

**Working efficiently in this session:** don't re-read the full dataset or re-clone the repo state between steps — work file-by-file per Section 4. Don't ask for confirmation on the "considered and rejected" items in 2e/3 — those are closed. Do checkpoint after each of steps 3 and 4 with actual trained metrics before moving on, rather than chaining multiple untested changes together.
