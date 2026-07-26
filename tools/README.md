# tools/

Standalone diagnostics. **Read-only**, zero dependencies, no build step — plain `node`,
consistent with the rest of the repo (see `tests/`).

## `phase0-attribution.js`

Readiness check for the Employee module (spec: [`../employee-section-plan.md`](../employee-section-plan.md)).

```bash
node tools/phase0-attribution.js
```

Reports:
1. **Broker identity** — is `broker_id` ↔ `broker_name` consistent across deals?
2. **Payroll tagging** — how much GL movement on 5000/5010/5020/5030/5040/5500/5510
   is tagged to an actual person vs. floating unattributed.
3. **Attribution passes** — how much of the untagged remainder a script can recover, via
   name / internal account number / IBAN, and what is left for a human.
4. **People paid but not on the roster** — candidate employees to create.

### How it reads the data
Firestore REST API with an **anonymous sign-in** — the same auth path the app's access-code
login uses (`signInAnonymously`). It never writes. Each run creates one anonymous user in
Firebase Auth; they are harmless and safe to delete.

### Matching notes
Payee names must be matched on their **consonant skeleton**, not edit distance. Banks
transliterate Arabic names inconsistently — `FOAD`/`FOUAD` for *Faoud*, `TARIQ`/`TAREQ` for
*Tarek*, `AHMED` for *Ahmad*, `KHAIRI` for *Khiari*. An edit-distance matcher silently drops
the largest broker entirely; that bug is why this file exists rather than a one-off script.

The skeleton still misses `MOMNEA`/`MOUMNEH` vs roster `Momneh`. Rather than loosening the
algorithm — which trades false negatives for false positives on real money — the fix is an
explicit `aliases[]` list per employee record.

Narrations identify the payee three ways, in descending reliability: **a name**, a **bare
12-digit internal account number** (`FUND TRANSFER - 019120282831 - AHMAD MOHAMAD IBRAHIM`),
or a **full IBAN**. The account-number pass outperforms the IBAN pass, because the largest
IBANs in the data belong to Nasama's own accounts, not to people.
