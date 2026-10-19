# Worklog — 2026-10-19 — Stage 1: security

Plan rows 1.1–1.8 of `implementation-plan-2026-10-18.md`. Built on branch `review-stages-2-8`, not pushed, not deployed.
**The rules file is NOT deployed and the app is not tested in a browser.** Deploying in the wrong order locks everyone out — follow the rollout below exactly.

## What changed
| Item | Change |
|---|---|
| 1.1 Close the database | `firestore.rules` rewritten: every request needs a Firebase Auth email/password user with a **verified email** and a record in `authorized_users` that is not inactive. Anonymous sessions are refused. `authorized_users`, `security_roles`, `approval_policies`, `company_branches`, `settings` are admin-only to write. `audit_logs` and `deal_stage_changes` are append-only. The `sales` role is read-only. Everything else (ledger, deals, invoices, counters, attachments…) needs an authorised, non-sales user. |
| 1.2 No plaintext codes | Access codes are gone from login and from User Management. Login is Firebase email + password. Admins **Send invite** (creates the login account through a secondary Firebase app instance and emails a password-setup link). A **Remove legacy access codes** button deletes the codes still stored on user records. The login page has **Forgot password** and **First time here? Set your password** (for people an admin has already added). |
| 1.3 Settings / backup / restore | Save settings is admin-only. Backup and restore are admin-only; backups never include access codes; restore only writes the collections the app exports, never the audit log, and never a collection merely named in the file. |
| 1.4 Audit trail | Every ledger write and delete is logged from the App's save path (`txn_create` / `txn_update` with the changed fields / `txn_batch` / `txn_delete` with the full deleted entry), plus login/logout, user changes, invites, backups. The rules make `audit_logs` create-only — nobody, including admins, can edit or delete a log entry. |
| 1.5 Local cache | The local mirror is wiped on sign-out, and when a different person signs in on the same machine. |
| 1.6 Mass-delete tools | "Delete All BP Today" and the "reversal entries adding money to bank" panel are removed. |
| 1.7 VAT print | Company name and TRN are HTML-escaped in the printed VAT report. |
| 1.8 Scheduled backups | Not something the app can do by itself — it needs a Google Cloud job. Commands below. |

## Rollout — do this in order (15 minutes, by an admin)
1. **Firebase console → Authentication → Sign-in method:** enable **Email/Password**. Leave Anonymous enabled for now.
2. **Authentication → Settings → Authorized domains:** make sure every domain the app is served from is listed (GitHub Pages host, Hostinger domain, `localhost` for testing).
3. **Deploy the new app code** (push the branch to `main`, or upload to the host). Do **not** deploy the rules yet.
4. **Create your own admin login:** on the login page choose *First time here? Set your password* with your admin email, verify the email from the link, sign in.
5. **User Management → Send invite** for every other user. Each gets an email to set their password; the link also verifies their address. Then click **Remove legacy access codes**.
6. Once everyone can sign in: **deploy the rules** — `firebase deploy --only firestore:rules` from the repo (project `nasama-accuntant`). From that moment anonymous and unverified sessions are refused.
7. **Authentication → Sign-in method:** disable **Anonymous**.
8. Check: a signed-out browser tab can no longer read anything (the old rule let anyone who called `signInAnonymously()` read and delete the whole database).

If step 6 locks you out (a typo in an email, say), roll the rules back in the console (Firestore → Rules → history) — the rules can be redeployed any time.

## 1.8 Scheduled encrypted backups (run once with the gcloud CLI)
Firestore exports go to a Cloud Storage bucket; the bucket is encrypted at rest by Google and only your project's admins can read it.
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
- Posting limits and role are read at sign-in; after changing a user's limits they sign out and in.
- Settings (incl. depreciation lives, VAT period cycle, invoicing basis) are admin-only to save under the new rules; accountants can still read them.
- The rules were written by hand and could not be run against the Firestore emulator here. Test step 8 before relying on them.
- Attachments, frozen PDFs and reconciliation sessions sit under the catch-all rule (authorised, non-sales).
