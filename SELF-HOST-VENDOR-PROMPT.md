# Prompt: Self-host all CDN libraries (Option B)

Paste the prompt below to Claude Code (in this repo) when you want to make the app
fully independent of third-party CDNs. Everything Claude needs is included.

---

## THE PROMPT (copy everything between the lines)

---

Self-host all external JavaScript/CSS libraries for this app so it has **zero runtime
dependency on any third-party CDN**. The app is a no-build static site (plain
`type="text/babel"` scripts, deployed to GitHub Pages from `main`). Today it loads
10 libraries from unpkg / gstatic / cdnjs in `index.html`. I want them downloaded
into the repo and loaded locally instead, so the app can only change when I change a file.

Do this:

1. Create a `vendor/` folder in the repo root.

2. Download these exact files into `vendor/` (keep these exact versions — they are
   already pinned and known-good; do not upgrade them):

   - react 18.3.1           → https://unpkg.com/react@18.3.1/umd/react.production.min.js
   - react-dom 18.3.1       → https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js
   - @babel/standalone 7.29.7 → https://unpkg.com/@babel/standalone@7.29.7/babel.min.js
     (MUST stay on Babel 7.x — Babel 8 defaults to the automatic JSX runtime, which injects
      `import` statements and blanks the app. See memory/babel-version-pin.md.)
   - firebase-app-compat 10.11.0       → https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js
   - firebase-firestore-compat 10.11.0 → https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore-compat.js
   - firebase-auth-compat 10.11.0      → https://www.gstatic.com/firebasejs/10.11.0/firebase-auth-compat.js
   - html2canvas 1.4.1 → https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
   - jsPDF 2.5.1       → https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
   - xlsx 0.18.5       → https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
   - pdf.js 3.11.174   → https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js

   Give them clear local filenames, e.g. `vendor/react-18.3.1.production.min.js`, etc.

3. CHECK pdf.js: it uses a separate **worker** file (`pdf.worker.min.js`). If the
   reconcile feature sets `pdfjsLib.GlobalWorkerOptions.workerSrc` to a CDN URL, also
   download the matching worker
   (https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js) into
   `vendor/` and update that workerSrc to point at the local file. Grep the code for
   `workerSrc` and `pdf.worker` to confirm.

4. Edit `index.html`: replace each external `src="https://..."` with the local
   `src="./vendor/<file>"`. Keep the same load order. Leave the `type="text/babel"`
   JSX `<script>` tags (the `nasama-accounting-v2.*.jsx` files) exactly as they are —
   those are already local app code, not vendored libraries.

5. Verify: the files exist on disk with non-trivial sizes (each should be tens of KB to
   a few hundred KB; a tiny/HTML-looking file means the download failed — refetch it).

6. Commit and push to `main` (this app deploys straight from main via default GitHub
   Pages, no custom workflow). Then poll the live site
   (https://alaithan.github.io/nasama-accounting/) until the rebuilt page references
   `./vendor/` and loads with an empty/clean console (the yellow "in-browser Babel
   transformer" warning is expected and harmless).

7. Tell me to hard-refresh (Ctrl+Shift+R) and confirm the Dashboard, Invoices, and
   Bank Reconciliation (PDF/Excel/CSV upload) all still work.

Notes:
- Do NOT introduce a build step / bundler / npm. Keep it a plain static site.
- Repo grows by ~5 MB; that's expected and is the whole point (libraries frozen in the repo).
- Firebase still talks to Google's servers at runtime for data — that's the database
  connection, not a library load, and is unaffected by this change.

---

## Why you'd run this

After self-hosting, no outside server can ever change what your app runs. The only
remaining external calls are to Firebase (your actual database), which is required.
This permanently ends the class of failure where a CDN silently ships a breaking
version (what happened on 2026-06-17 when unpkg moved Babel from 7.x to 8.0.1).
