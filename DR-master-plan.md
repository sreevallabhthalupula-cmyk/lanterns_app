# DR Screening — Master Architecture & Feature Plan (Production Target)

**Status:** decisions made below are final for this pass — not options to re-litigate with me mid-build. Supersedes earlier ad-hoc prompts in this session where they conflict. `DR-model-upgrade-spec.md` (classifier + segmentation) is still authoritative for the ML work and is referenced, not repeated, here.

**How to use this:** drag this file directly into your Claude Code chat as an attachment before sending the execution prompt in Section 8 — don't rely on it already being in the working tree, confirm it first.

---

## 1. Where this stands vs. the two repos you liked

| | This app | Tirth27 | OccuLight (Manoj-Sh-AI) |
|---|---|---|---|
| Full clinical workflow (intake, consent, capture, review) | ✅ | ❌ (single-image demo) | ❌ (single-image demo) |
| Fully offline, on-device, no backend | ✅ | ❌ | ❌ (Flask backend) |
| Per-lesion segmentation | 🔧 in progress (Sec 3 of model spec) | ❌ | ✅ |
| Structure-toggle results UI | ✅ (built this session) | ❌ | ✅ (source of the pattern) |
| Facility/throughput awareness | 🔧 this doc, Section 4 | ❌ | ❌ |
| Multi-language | 🔧 this doc, Section 4 | ❌ | ❌ |
| Cohesive visual design | 🔧 in progress | partial | ✅ |

You're already ahead on workflow depth and offline architecture — those were never the gap. The gap was polish and feature depth, which is what this plan closes. Don't let "add lots of features" turn into scope creep that undermines the offline/no-backend architecture that's your actual structural advantage over both repos.

---

## 2. Unified design system (finish what's in flight)

One token set, two surface modes — not two unrelated palettes. Recap (already landed, verify it's actually complete per the checklist in your last commit's task list):
- `--color-primary: #2260ff` everywhere, light surfaces (`#fff`/`#ecf1ff`/`#cad6ff`) for data/admin screens, dark surfaces (`--bg:#0f1115`/`--card:#1a1d24`) for capture screens — same accent, same radius scale, same font, both modes.
- `manifest.json` + `<meta theme-color>` matched to the unified palette.

**New in this pass — icon system (currently zero icons in the app, verified: no `<svg>`, no icon font, no icon classes anywhere in `index.html`/`app.js`).** This is a concrete, fixable "looks AI-generated" signal — text-only buttons read as a prototype. Self-host a small single-color-stroke SVG set (Lucide or Feather, ISC-licensed, vendor only the ~20 icons you need — no CDN, matches your offline requirement):
- Nav: home, user (operator), history/clock, camera
- Actions: check (approve), flag, download, upload/export
- Status: check-circle (pass), alert-triangle (warn), x-circle (fail/urgent)
- Segmentation sidebar: replace the current text-only structure list with icon+label rows (eye/droplet/circle-dot per structure)

**New — motion/micro-interaction pass**, because on-device inference isn't instant and a blank screen during it reads as broken, not premium:
- Skeleton/pulse loader during model inference and segmentation mask decode (you already have loading states for TF.js — upgrade them from spinner-only to skeleton cards matching the result layout)
- Screen-transition slide (100-150ms) instead of hard cuts
- Button press state (scale 0.97 + slight opacity) on all primary/secondary buttons

**Typography scale** (consolidate current ad hoc pixel values into one table Claude Code should apply everywhere): Display 24px SemiBold / Section 18px Medium / Body 14px Regular / Caption 12px Light — matches values actually pulled from the Figma kit.

---

## 3. Onboarding — new, legitimate reuse from the Figma kit

Earlier I told you the kit's screens don't map onto your workflow (booking/payment/chat don't). Splash and Welcome are the exception — generic enough to genuinely reuse:
- **Splash**: logo + app name on primary blue, shown while the TF.js model files load from cache (functional, not just decorative — gives the load time somewhere to go instead of a blank white flash)
- **Welcome / first-run walkthrough**: 2–3 card carousel — what the app does, explicit "works fully offline" notice (a real selling point for rural PHC staff, say it outright), then into Operator setup. Shown once, gated on a localStorage flag, skippable.

---

## 4. New features — curated, not exhaustive

Picked for high clinical/professional value within your existing constraints (offline, no backend, on-device). Each row is a decision, not a menu.

| Feature | Why | Notes |
|---|---|---|
| **Referral-interval engine** | Turns a bare grade into an actionable clinical recommendation — standard DR follow-up intervals: Grade 0-1 → re-screen 12 months, Grade 2-3 → refer within 4 weeks, Grade 4 → urgent referral within 1 week | Pure rule-based JS on top of the existing grade output, no model change, cheap to build, high perceived clinical maturity |
| **Facility dashboard** | Today's/this-week's screening count, referral rate, pending-review count | Client-side aggregation over existing localStorage case records — directly gives your deliverable #5 (throughput/district-scale) a visible in-app face, not just a Simulink diagram in a pitch deck |
| **Reviewer queue sorted by urgency** | Grade-4/urgent cases surface first, not insertion order | Small change to the existing Case History/reviewer screen's sort logic |
| **CSV/JSON export** | Facility-level reporting to hand off to a district health office — complements the per-patient PDF, which doesn't serve aggregate reporting | Client-side generation, same self-hosted-library pattern as jsPDF, no backend |
| **Pre-capture consent step** | Explicit, timestamped consent checkbox before image capture, stored with the case record | Small screen addition between Intake and Capture; real clinical/regulatory polish signal, near-zero engineering cost |
| **Multi-language UI (English + Hindi minimum)** | Actual rural-PHC-deployment differentiator neither reference repo has | String-table pattern (`i18n.js` with a key→string map per language), toggle on Operator screen, persisted per-operator in localStorage |
| **Version/changelog footer** | Small, but "v1.2.0 · last updated" on a settings/about screen reads as maintained software, not a one-off hackathon build | Trivial to add, easy to forget |

**Explicitly not adding** (consistent with decisions already made this session, don't relitigate): IndexedDB migration (localStorage is still fine at your stated scale — this was a deliberate cut, not an oversight), real ABHA/ABDM integration (correctly out of scope, needs facility certification), LLM-generated reports or any backend call (this is exactly the OccuLight feature rejected earlier — it breaks the offline/no-backend architecture that's your actual advantage over both reference repos).

---

## 5. Updated architecture (consolidated)

```
MATLAB (training)                         Web App (deployment, unchanged shape)
──────────────────                        ─────────────────────────────────────
APTOS + IDRiD datasets                    Progressive Web App, offline, no backend
  → EfficientNet-b0 regression              - Unified design system (Sec 2)
  → U-Net lesion segmentation               - Splash/Welcome onboarding (Sec 3)
  → ONNX → TF.js (classifier +              - Referral engine (pure JS, new)
    lazy-loaded segmentation)               - Dashboard (client-side aggregation, new)
                                             - i18n string layer (new)
                                             - CSV/JSON export (client-side, new)
                                             - Existing: intake, ABHA-mock, capture,
                                               quality-gate, reviewer, PDF report
```
Nothing here reintroduces a backend or changes the offline guarantee — every addition in Section 4 is either pure client-side JS or a static asset.

---

## 6. File-by-file (consolidated across this doc + the model spec)

| File | Change |
|---|---|
| `style.css`, `manifest.json`, `index.html` `<head>` | Finish palette unification (Sec 2), add typography scale |
| new: `icons/` (SVGs) | Vendor the ~20-icon set (Sec 2) |
| `app.js` | Screen-transition + button-press classes; new screens: splash, welcome, consent, dashboard; reviewer-queue sort change |
| new: `referral-engine.js` | Grade → interval/urgency mapping (Sec 4) |
| new: `i18n.js` + `strings/en.json`, `strings/hi.json` | Language string tables |
| new: `export.js` | CSV/JSON case export |
| `pdf-report.js` | No change needed unless you want consent info on the PDF too — your call, not required |
| (separately) MATLAB files, `inference.js`, `sw.js` | Per `DR-model-upgrade-spec.md`, unchanged by this doc |

---

## 7. Execution order

1. **Finish Section 2 (design unification + icons)** — highest visible impact, directly answers "looks horrible."
2. **Section 3 (onboarding)** — cheap, high perceived-polish return, do right after.
3. **Section 4 features**, in the table's order (referral engine and consent are near-zero-cost; dashboard/export/i18n are bigger, do them in that sequence).
4. **Model spec (classifier + segmentation)** — runs independently on the MATLAB side, doesn't block or get blocked by 1-3, keep it moving in parallel.
5. **Outstanding items from the original status doc** — real-image spot-check, real-device test, the still-blank Netlify URL — these were open before this doc and stay open until actually done.

---

## 8. Execution prompt (paste into Claude Code after confirming this file is in the working tree)

```
Read DR-master-plan.md and DR-model-upgrade-spec.md in this repo root, both
already-decided specs — don't re-derive or ask me to confirm decisions in
them. Execute DR-master-plan.md Section 7's order: design unification +
icons first, then onboarding, then the Section 4 feature table in order,
then continue the model spec work in parallel on the MATLAB side.

Working style: small commits per numbered item, reference file/line instead
of pasting full files back to me, checkpoint with a one-line status after
each phase rather than after each file. Only stop and ask if genuinely
blocked — everything in both specs is a closed decision, not a discussion.
```
