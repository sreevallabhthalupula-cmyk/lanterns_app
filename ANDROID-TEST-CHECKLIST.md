# Android real-device test checklist

Run this on an actual Android phone, in Chrome, over your real mobile connection or
home wifi — not desktop DevTools device emulation. Emulation cannot reproduce the
native camera/gallery picker behavior this checklist exists to verify.

Nothing in this file has been marked done by me. Every box below is unchecked because
none of it can be verified from this environment — that's the whole point of the file.

---

## 0. Setup

1. On the phone, open Chrome and go to the deployed URL (or `http://<your-computer's-LAN-IP>:8765`
   if testing the local dev server on the same wifi network).
2. [ ] Page loads, splash screen briefly shows the lantern mark + "Lanterns" in blue, then
   the Home screen appears.

---

## 1. Upload picker (the bug this session's Phase 1 fixed)

1. Tap **Start New Screening**.
2. Fill Name and Age (anything), pick a Gender, answer the Yes/No rows however.
3. Tap **Continue** at the bottom of the intake form.
4. On the "Link ABHA ID" screen, tap **Skip**.
5. On "Patient Consent", tap the checkbox, then tap **Continue to Capture**.
6. Tap **Upload Image**.
   - [ ] **Expected**: Android's normal photo picker / "Choose an app" sheet appears
     (Photos, Files, Gallery, etc. — whatever the phone normally shows for a file
     input). It must NOT jump straight into the camera viewfinder.
   - If it opens the camera directly instead of a picker, the fix did not hold on
     this device/Chrome version — note the Chrome version (chrome://version) and tell me.
7. Pick any existing photo from the gallery.
   - [ ] **Expected**: you're returned to the app, the chosen photo appears in the
     capture preview (not a blank/broken image).

---

## 2. Camera capture

1. From the Home screen, repeat steps 1-5 above to get back to the Capture screen
   (or tap **Retake Image** if you're still mid-flow from section 1).
2. Tap **Use Camera**.
   - [ ] **Expected**: Chrome asks for camera permission (first time only) — tap
     **Allow**. A live camera preview appears in the app (not a new tab, not a
     picker).
3. Point the camera at anything and tap the shutter/capture button.
   - [ ] **Expected**: a still frame is captured and shown in the preview. The
     live camera feed stops (viewfinder disappears).
4. Tap **Retake Image**.
   - [ ] **Expected**: you're back at the Use Camera / Upload Image choice, and the
     phone's camera indicator (the green dot / camera-in-use icon in the Android
     status bar) goes away — confirms the camera was actually released, not just
     hidden. If the green camera-in-use indicator stays on after backing out or
     retaking, that's a real bug — tell me.
5. Tap the **Back** arrow (top-left) while the live camera preview is showing
   (i.e., camera on, before tapping capture).
   - [ ] **Expected**: same as above — camera indicator goes away within a second
     or two of tapping Back.

---

## 3. Add to Home Screen

1. From the Home screen in Chrome, tap the **⋮** menu (top-right) → **Add to Home
   screen** (or **Install app**, wording varies by Chrome version).
2. Confirm the install prompt.
   - [ ] **Expected**: the icon Chrome shows in the install preview is the new blue
     lantern mark, not the old eye icon, and the suggested name is "Lanterns".
3. Find the new icon on your home screen / app drawer and tap it.
   - [ ] **Expected**: the app opens full-screen with no browser address bar/tabs
     (standalone mode), status bar area is the app's blue, not white/default.

---

## 4. Offline reload

1. With the app open (installed icon or Chrome tab) and already loaded once,
   turn on Airplane Mode (or disable wifi + mobile data).
2. Fully close the app/tab and reopen it.
   - [ ] **Expected**: the app still loads and the Home screen appears (served from
     the service worker cache, no "no internet" browser error page).
3. Navigate to Case History, Dashboard, and start a New Screening (intake form)
   while still offline.
   - [ ] **Expected**: all three screens open normally. Existing saved cases (if
     any) still show in History.
4. Turn wifi/data back on.

---

## If anything above fails

Note: which section, which exact step, the phone model, Android version, and Chrome
version (chrome://version). That's enough for me to reproduce and fix without needing
the device myself.
