# Blockers & flagged decisions

Items where I made a call rather than guessing blindly or halting the session. Review these first.

---

## Phase A — logo mark: not using the actual DC Comics "Green Lantern" ring

You asked for "green lantern ring as logo." The Green Lantern power-ring insignia is a
trademarked/copyrighted DC Comics mark — reproducing it (even redrawn) in a shipping app
is a real legal exposure, not a style nitpick, so I didn't render it.

What I did instead: an original lantern mark (a simple oil-lantern silhouette with a
circular halo/ring motif behind it — evokes "lantern" + "ring" without copying anyone's
IP), used as `#icon-lantern` in the sprite and for the regenerated app icons.

**Color**: I also kept it in the app's established primary blue (`#2260ff`) rather than
green. Section 2/the palette-migration work just finished this session unified every
screen onto that one blue — introducing a green brand mark would immediately put the app
icon and splash logo out of step with every button, badge, and accent color in the app.
If you want an actual green identity, that's a bigger design decision (new token,
touches the whole palette again) — happy to do it, but wanted you looking at it with
eyes open rather than waking up to a green icon that clashes with a blue app.

Original lantern SVG path lives in `index.html`'s icon sprite (`#icon-lantern`) and in
`gen_icons.py`. Swap either if you want a different mark shape once you're back.

---

## Phase C — PDF report body text stays English-only (not translated)

The i18n gap-closing task called out PDF body text specifically. I closed the
case-detail *screen* labels (those are plain DOM text, the browser renders Devanagari
fine via the existing font stack) but deliberately left `pdf-report.js` alone.

Why: jsPDF's built-in fonts (`helvetica` etc., what `buildCasePdf()` uses throughout)
are Latin-only. Hindi text run through `doc.text()` with the current font would not
throw an error — it would silently render as missing glyphs / boxes on the actual PDF,
which is worse than leaving it in English, because it's a report a clinician might
print or forward. Fixing this properly means embedding a Unicode font (e.g. Noto Sans
Devanagari) as a base64 file and registering it with `doc.addFont()`, which is a real
chunk of work with its own failure modes (font licensing, file size, jsPDF version
quirks) — not something to improvise at 3am without being able to check the rendered
output on a device.

Left as-is: `pdf-report.js` generates English-only reports regardless of the UI
language setting. If you want this closed, it needs a font-embedding pass, not a
find-and-replace.

---

## Final sanity sweep — found why the Netlify URL has stayed blank

Not a decision, a root-cause finding: `netlify_response.json` in the repo root contains
`{"code":401,"message":"Access Denied"}`. Somewhere in an earlier session, a deploy to
Netlify was attempted (API or CLI) and rejected for bad/missing auth — that's almost
certainly the reason the Netlify URL has stayed blank across every session, not a task
nobody got to.

There's also a `netlify_deploy/` folder in the repo root — git-ignored, no commit
history, a local build snapshot from whenever that deploy attempt happened. It still
has the entire old branding baked in (old accent blue, "DR Screening" as the app name,
old app icons) because it predates this session's rebrand and palette work, and nothing
in this session touched it since it isn't part of the live app (index.html/style.css/
app.js at the repo root are what `sw.js` actually caches and what Chrome serves).

I didn't touch either file: fixing the 401 needs your actual Netlify credentials (site
ID + auth token, or re-running whatever CLI login this came from), which I don't have
and wouldn't enter even if I did — and I'm not going to attempt a live deploy to a
public URL without you confirming that's what you want. Once you've got valid Netlify
auth sorted, `netlify_deploy/` should just be regenerated fresh from the current repo
root rather than patched — it's a stale, out-of-band, stale-by-months copy of what
`netlify_deploy/index.html` etc. actually reflect now, and quietly patching branding
into a build artifact that's about to be regenerated isn't worth the effort. Delete it
and rebuild once the real deploy target is known — worth a real deploy pipeline
(Netlify CLI in CI, or connecting the GitHub repo directly in Netlify's dashboard so it
builds from `main` automatically) rather than another manual `netlify_deploy/` folder.
