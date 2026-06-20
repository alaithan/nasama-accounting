# Publish to Firebase Hosting

Your app is already configured for Firebase Hosting (`firebase.json` + `.firebaserc`,
project **nasama-accuntant**). GitHub Pages keeps working unchanged — this just adds
a second live copy at **https://nasama-accuntant.web.app**.

## One-time setup (do this once)

Open a terminal **in this project folder** and run:

```bash
npm install -g firebase-tools        # 1. install the Firebase command-line tool
firebase login                       # 2. opens a browser — sign in with the Google
                                     #    account that owns the Firebase project
                                     #    (the same one you use for the database)
firebase deploy --only hosting       # 3. publish
```

When step 3 finishes it prints:

```
Hosting URL: https://nasama-accuntant.web.app
```

Open that URL — your app is live. Login works immediately (Firebase auto-authorises
the web.app domain, so no extra config).

## Every time you want to publish new changes

After committing/pushing your code as usual, just run:

```bash
firebase deploy --only hosting
```

That's the only command you need going forward.

## Notes
- This does **not** touch GitHub Pages. Both sites run at once, sharing the same
  Firebase database, logins, and data. Retire GitHub Pages later only if you want to.
- `firebase.json` deploys the whole folder except dotfiles, `node_modules`, `*.md`
  docs, and the Babel validation temp file.
- The site has no URL routing (everything loads from `/`), so no rewrites are needed.
