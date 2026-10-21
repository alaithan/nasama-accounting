# Worklog — 2026-10-19 — Stage 1: security

Plan rows 1.1–1.8 of `implementation-plan-2026-10-18.md`. Built on branch `review-stages-2-8`, not pushed, not deployed.
**The rules file is NOT deployed and the app is not tested in a browser.** Deploying in the wrong order locks everyone out — follow the rollout below exactly.

**Usernames are not real mailboxes.** Nothing in this design sends or verifies email: an admin creates every login with a temporary password and tells the person; the person changes it at first sign-in; the database rules trust a login only when an admin has linked it to a username.

## What changed
| Item | Change |
|---|---|
| 1.1 Close the database | `firestore.rules` rewritten: a request is accepted only from a Firebase **email/password** sign-in (never anonymous) whose user id is mapped to a username in `auth_users/{uid}` — a mapping only an admin can write — and whose `authorized_users` record is active. `authorized_users`, `auth_users`, `security_roles`, `approval_policies`, `company_branches`, `settings` are admin-only to write. `audit_logs` and `deal_stage_changes` are append-only. The `sales` role is read-only. Everything else needs an authorised, non-sales user. |
| 1.2 No plaintext codes | Access codes are gone. Sign-in is **username + password** (behind the scenes a username that is not a valid email gets a synthetic login id such as `ahmed@login.nasama.local`). **User Management → Create login** makes the Firebase login with a temporary password the admin types; the person is forced to set their own at first sign-in. **Remove legacy access codes** deletes the codes still stored on user records. Everyone has **Settings → Change my password**. A forgotten password: the admin deletes the login in the Firebase console and clicks Create login again. |
| 1.2b Google sign-in | **Continue with Google** on the login page. An admin links a person's Google address to their username (User Management → Edit → *Google account*); that writes `google_logins/{address}` → username. The rules accept a Google sign-in only when its (verified) address has such a mapping, so an unknown Google account gets nothing. A Google session has no app password (Settings shows that instead of *Change my password*); the temporary-password rule only applies to password logins. Both ways lead to the same user record, role and limits. |
| 1.3 Settings / backup / restore | Save settings is admin-only. Backup and restore are admin-only; backups never include access codes; restore only writes the collections the app exports, never the audit log, never a collection merely named in the file. |
| 1.4 Audit trail | Every ledger write and delete is logged (`txn_create` / `txn_update` with the changed fields / `txn_batch` / `txn_delete` with the full deleted entry), plus login/logout, user changes, logins created, password changes, backups. The rules make `audit_logs` create-only — nobody can edit or delete a log entry. |
| 1.5 Local cache | Wiped on sign-out, and when a different person signs in on the same machine. Old anonymous sessions left by the previous version are discarded. |
| 1.6 Mass-delete tools | "Delete All BP Today" and the "reversal entries adding money to bank" panel are removed. |
| 1.7 VAT print | Company name and TRN are HTML-escaped in the printed VAT report. |
| 1.8 Scheduled backups | Needs a Google Cloud job the app cannot create — commands below. |

## Rollout — do this in order (about 20 minutes, by an admin)
1. **Backup first:** current live app → Settings → Download Backup.
2. **Firebase console → Authentication → Sign-in method:** enable **Email/Password**. To offer *Continue with Google*, also enable **Google** (it asks for a project support email — any real address of yours). Leave Anonymous enabled for now.
3. **Authentication → Settings → Authorized domains:** every domain the app is served from must be listed (`localhost` for testing, the GitHub Pages host, the Hostinger domain).
4. **Run or deploy the new app code.** Do **not** deploy the rules yet.
5. **Create your own admin login:** login page → *First admin setup* → your admin username + a password → *Create admin login*. This works only while the old rules are live, and only for a username whose record is admin.
6. **User Management → Create login** for every other user: type a temporary password, tell it to the person. At their first sign-in they are asked to choose their own. Then click **Remove legacy access codes**. For anyone who prefers Google: **Edit** the user, enter their Google address in *Google account*, Save — they press *Continue with Google* on the login page (a password login is optional for them).
7. Once everyone has signed in at least once: **deploy the rules** — `firebase deploy --only firestore:rules` from the repo (project `nasama-accuntant`). From now on only admin-created logins work.
8. **Authentication → Sign-in method:** disable **Anonymous**.
9. Check: open the site in a private window without signing in — nothing loads; a wrong password is refused; a username you never created a login for cannot get in.

**Logins left behind by the old version.** Anyone who signed in with the previous app may already have a Firebase login under their username (its password was their old access code, or unknown). The app then refuses *First admin setup* / *Create login* with "A login already exists". Fix: Firebase console → Authentication → Users → find the username → ⋮ → **Delete account** (not *Reset password*, which tries to email), reload the app, and create the login again. The red message on the login page only refreshes when you press the button again.

If step 7 locks you out (a mapping missing for your own login, say), roll the rules back in the console (Firestore → Rules → history), fix the mapping, redeploy.

## Resetting a forgotten password (admin)
Firebase cannot reset a password without a real email. Procedure: Firebase console → Authentication → Users → find the login id shown next to the user in User Management (e.g. `ahmed@login.nasama.local`) → ⋮ → Delete account. Back in the app, User Management → **Create login** for that user with a new temporary password. The old mapping is replaced automatically.

## 1.8 Scheduled encrypted backups (run once with the gcloud CLI)
Firestore exports go to a Cloud Storage bucket; the bucket is encrypted at rest and only your project's admins can read it.
```
gcloud config set project nasama-accuntant
gsutil mb -l me-central1 gs://nasama-accuntant-backups          # once; choose your region
gcloud firestore export gs://nasama-accuntant-backups/manual-$(date +%F)   # test it
# weekly, Mondays 02:00 Dubai time
gcloud scheduler jobs create http nasama-weekly-backup --location=me-central1 \
  --schedule="0 2 * * 1" --time-zone="Asia/Dubai" \
  --uri="https://firestore.googleapis.com/v1/projects/nasama-accuntant/databases/(default):exportDocuments" \
  --http-method=POST --oauth-service-account-email="<project-number>-compute@developer.gserviceaccount.com" \
  --message-body='{"outputUriPrefix":"gs://nasama-accuntant-backups/weekly"}'
```
The service account needs the *Cloud Datastore Import Export Admin* role and write access to the bucket. Restore with `gcloud firestore import gs://…/weekly/<folder>`.

## Known limits
- Google sign-in opens a pop-up on a computer. On a phone or tablet, or from a home-screen icon, the page itself goes to Google and comes back (a pop-up there opens in a separate tab the app never hears from, so the login form just stayed). The session is kept on the device, so the next visit opens the app without signing in again. One Google address can be linked to one username.
- Posting limits and role are read at sign-in; after changing a user's limits they sign out and in.
- Settings (incl. depreciation lives, VAT period cycle, invoicing basis) are admin-only to save under the new rules; accountants can still read them.
- The rules were written by hand and could not be run against the Firestore emulator here — step 9 is the test.
- The Firebase web API key is public by design; with these rules it grants nothing without an admin-created login.
