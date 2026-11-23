# Draw.io Mobile (PWA)

Phone-friendly shell around the official draw.io editor. Open `.drawio` / `.xml` / `.svg` / `.png` (with embedded diagram) files, edit, and save back via the share sheet ("Save to Files"). Installable on the iOS home screen.

## Run / deploy
Static files only, no build step. Must be served over **HTTPS** for install + service worker.

- GitHub Pages: Settings → Pages → deploy from branch, root folder.
- Or Vercel / Netlify / any static host.
- Local test: `python3 -m http.server 8000` (then open http://localhost:8000).

## Install on iPhone
1. Open the HTTPS URL in **Safari**.
2. Share → **Add to Home Screen**.

## Notes
- The editor loads from `embed.diagrams.net`, so editing needs a connection. The toolbar shell is cached.
- The current diagram is auto-saved in the browser as a draft; use **Save** to export a `.drawio` file.
