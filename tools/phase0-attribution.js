#!/usr/bin/env node
/**
 * Phase 0 — Employee-module readiness diagnostic.   READ-ONLY. Zero dependencies.
 *
 *   node tools/phase0-attribution.js
 *
 * Answers three questions before the Employee module is built:
 *   1. Is the broker identity link (broker_id ↔ broker_name) trustworthy?
 *   2. How much payroll/commission expense is tagged to an actual person?
 *   3. Of the untagged remainder, how much can a script recover, and from what?
 *
 * Reads `brokers`, `deals`, `transactions`, `accounts` over the Firestore REST API using
 * an anonymous sign-in — the same auth path the app's access-code login uses. It never
 * writes. Each run creates one anonymous user in Firebase Auth; they are safe to delete.
 *
 * Matching notes (see employee-section-plan.md §3):
 *   - Arabic transliteration varies by bank: FOAD/FOUAD → Faoud, TARIQ/TAREQ → Tarek,
 *     AHMED → Ahmad, KHAIRI → Khiari. Plain edit-distance FAILS on these and silently
 *     drops the largest broker. Use the consonant skeleton instead.
 *   - Narrations identify the payee three different ways, in descending reliability:
 *     a name, a full IBAN, or a bare 12-digit internal account number.
 */

const API_KEY = "AIzaSyDc4SS-bJyGJKo5ZbK0legkZDT3JPFE82A";     // public web config, same as index.html
const PROJECT = "nasama-accuntant";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const PAYROLL_ACCOUNTS = {
  "5000": "Admin Salary", "5010": "Employee Salaries", "5020": "Manager Salary",
  "5030": "Broker Incentive", "5040": "Sales Mgr Override",
  "5500": "Broker Commission", "5510": "Secondary Agent",
};

// Nasama's own accounts. Money moved here is NOT a payment to a person.
const OWN_ACCOUNTS = [
  { re: /AE360351646005642164001|FAB MY ACCOUNT/i, label: "FAB MY ACCOUNT" },
  { re: /AE930330000019101303277|NASAMA PROPERTIES/i, label: "NASAMA PROPERTIES L L C" },
];

// Bank spelling variants, confirmed by the owner 2026-07-25. Keyed by roster name.
// These belong in `employees.aliases[]` once the collection exists — see
// employee-section-plan.md §6. Loosening the matcher instead would trade false
// negatives for false positives on real money.
const ALIASES = {
  "Tarek Momneh": ["TAREQ MOMNEA", "TAREK MOUMNEH", "TAREK MOUMNEHTOC", "TAREQ MOMNEATOC"],
  "Ahmad Ibrahim": ["AHMAD MOHAMAD IBRAHIM", "AHMED IBRAHIM"],
};

// Literal job-title rules. These bypass skeleton matching because short titles reduce to a
// single letter and get filtered out ("CEO" → "K"). Owner rulings, so highest confidence.
// Confirmed 2026-07-25: the CEO is the same person as the sales manager — no separate record.
const TITLE_HINTS = [
  { re: /\bCEO\b/i, person: "Ahmad Ibrahim" },
];

// People paid through payroll who have no record in the app yet.
// All confirmed by the owner 2026-07-25. Seeds of the future `employees` collection.
const NON_BROKER_STAFF = [
  { id: "EMP-NISADI", name: "Nisadi Sandunika Fernando", role: "Admin", status: "Active",
    aliases: ["SALPADORUGE NISADI SANDUNIKA FERNANDO", "NISADI SANDUNIKA FERNANDO",
              "NISADI SANDUNIKA FERNANDOTOC", "SALPADORUGE NISADI SANDUNIKA FERNAN"] },
  // Ex-broker, left during 2025. He must stay on the roster: his 2025 payments are real and
  // removing him would stop the 2025 period reconciling to the GL. See §9 open question 1.
  { id: "EMP-SHOUMAN", name: "Mohammed Shouman", role: "Broker", status: "Left",
    aliases: ["MOHAMMED SHOUMAN", "MOHAMED SHOUMAN"] },
];

// Confirmed reversible/contra transactions, not people to onboard (owner, 2026-07-25).
// Consistent with the reversal contra-entry model (Reverse posts a contra entry).
const KNOWN_REVERSALS = ["ALAADIN ZIBAN", "HAYA TAWFIK ISMAIEL", "MANUEL EDUARDO PINILLA VARGAS"];

// ── Firestore REST ────────────────────────────────────────────────
const decodeFields = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, decodeVal(v)]));
function decodeVal(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeVal);
  return null;
}
async function readCollection(name, token) {
  const out = []; let pageToken = "";
  for (;;) {
    const url = `${BASE}/${name}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) throw new Error(`${name}: ${JSON.stringify(json)}`);
    (json.documents || []).forEach(d => out.push({ __id: d.name.split("/").pop(), ...decodeFields(d.fields || {}) }));
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return out;
}

// ── name matching ─────────────────────────────────────────────────
/** Consonant skeleton: collapse doubles, keep first letter, drop remaining vowels, Q/C→K. */
function skel(word) {
  let s = String(word || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";
  s = s.replace(/Q/g, "K").replace(/C/g, "K").replace(/PH/g, "F").replace(/Y/g, "I").replace(/W/g, "U");
  s = s.replace(/(.)\1+/g, "$1");
  return s[0] + s.slice(1).replace(/[AEIOU]/g, "");
}
const wordsOf = s => String(s || "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(w => w.length >= 3);
const IBAN_RE = /AE\d{21}/g;
const ACCTNO_RE = /\b0\d{11}\b/g;          // bare internal account number, e.g. 019120282831
const money = c => "AED " + ((c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const H = t => { console.log("\n" + "═".repeat(78)); console.log(t); console.log("═".repeat(78)); };

(async () => {
  const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }),
  });
  const token = (await authRes.json()).idToken;
  if (!token) throw new Error("anonymous sign-in failed");

  const [brokers, deals, txns, accounts] = await Promise.all(
    ["brokers", "deals", "transactions", "accounts"].map(c => readCollection(c, token)));
  console.log(`Read: brokers=${brokers.length} deals=${deals.length} transactions=${txns.length} accounts=${accounts.length}`);

  const rosterById = new Map(brokers.map(b => [b.id || b.__id, b]));
  // Each person carries one or more name "variants" (legal name + confirmed bank aliases).
  // A variant matches independently, so an alias never has to resemble the roster spelling.
  const mkVariants = (name, aliases = []) => [name, ...aliases]
    .map(v => wordsOf(v).map(skel).filter(x => x.length >= 2)).filter(v => v.length);
  const roster = [
    ...brokers.filter(b => (b.name || "").replace(/[^A-Za-z]/g, "").length >= 3)
      .map(b => ({ id: b.id || b.__id, name: b.name, kind: "Broker",
        variants: mkVariants(b.name, ALIASES[b.name] || []) })),
    ...NON_BROKER_STAFF.map(s => ({ id: s.id, name: s.name,
      kind: s.status === "Left" ? `${s.role} (left)` : s.role,
      variants: mkVariants(s.name, s.aliases || []) })),
  ];
  const skCount = new Map();
  roster.forEach(b => new Set(b.variants.flat()).forEach(s => skCount.set(s, (skCount.get(s) || 0) + 1)));

  /** @returns {{tier:"A"|"B"|null, people:Array}} A = 2+ name parts, B = 1 distinctive part */
  const matchPeople = (text) => {
    const titled = TITLE_HINTS.filter(h => h.re.test(text)).map(h => roster.find(r => r.name === h.person)).filter(Boolean);
    if (titled.length === 1) return { tier: "A", people: titled };
    const tsk = new Set(wordsOf(text).map(skel));
    const scored = roster.map(b => ({
      b, hits: b.variants.reduce((best, v) => { const h = v.filter(s => tsk.has(s)); return h.length > best.length ? h : best; }, []),
    })).filter(x => x.hits.length > 0);
    const strong = scored.filter(x => x.hits.length >= 2);
    if (strong.length) return { tier: "A", people: strong.map(x => x.b) };
    const weak = scored.filter(x => x.hits.length === 1 && skCount.get(x.hits[0]) === 1);
    if (weak.length) return { tier: "B", people: weak.map(x => x.b) };
    return { tier: null, people: [] };
  };

  // ── 1. IDENTITY ────────────────────────────────────────────────
  H("1. BROKER IDENTITY — broker_id ↔ broker_name on deals");
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
  let bad = 0, badComm = 0;
  const pairs = new Map();
  deals.forEach(d => {
    const k = `${d.broker_id || ""}||${d.broker_name || ""}`;
    if (!pairs.has(k)) pairs.set(k, { id: d.broker_id || "", name: d.broker_name || "", n: 0, comm: 0 });
    const p = pairs.get(k); p.n++; p.comm += (d.expected_commission_net || 0);
  });
  for (const p of pairs.values()) {
    const r = p.id ? rosterById.get(p.id) : null;
    const broken = !p.id || !r || (p.name && norm(r.name) !== norm(p.name));
    if (broken) { bad += p.n; badComm += p.comm;
      console.log(`  ❌ ${String(p.id || "(no id)").padEnd(10)} deal says "${p.name}"${r ? ` — roster says "${r.name}"` : " — id not in roster"}  ×${p.n}`); }
  }
  console.log(bad ? `\n  ${bad} of ${deals.length} deals broken — ${money(badComm)} of commission affected.`
    : `  ✓ all ${deals.length} deals consistent — no identity migration needed.`);

  // ── 2. TAGGED vs UNTAGGED ──────────────────────────────────────
  const acctById = new Map(accounts.map(a => [a.id || a.__id, a]));
  const allText = t => [t.description, t.ref, t.counterparty, ...(t.lines || []).map(l => l.memo)].filter(Boolean).join(" ");
  let taggedAmt = 0, taggedN = 0;
  const untagged = [], perAcct = {};
  txns.forEach(t => (t.lines || []).forEach(l => {
    if (t.isVoid) return;
    const a = acctById.get(l.accountId);
    if (!a || !PAYROLL_ACCOUNTS[a.code]) return;
    const amt = (l.debit || 0) - (l.credit || 0);
    perAcct[a.code] = (perAcct[a.code] || 0) + amt;
    if (l.broker_id || l.manager_id || t.broker_id) { taggedN++; taggedAmt += amt; }
    else untagged.push({ date: t.date, code: a.code, txnType: t.txnType, amt, text: allText(t) });
  }));
  const untaggedAmt = untagged.reduce((s, r) => s + r.amt, 0);
  H("2. PAYROLL / COMMISSION — HOW MUCH IS TAGGED TO A PERSON?");
  Object.keys(PAYROLL_ACCOUNTS).sort().forEach(c => { if (perAcct[c]) console.log(`  ${c} ${PAYROLL_ACCOUNTS[c].padEnd(20)} ${money(perAcct[c]).padStart(20)}`); });
  console.log(`\n  Tagged   ${String(taggedN).padStart(3)} lines  ${money(taggedAmt).padStart(20)}`);
  console.log(`  UNTAGGED ${String(untagged.length).padStart(3)} lines  ${money(untaggedAmt).padStart(20)}   ← the Employee module's blind spot`);

  // ── 3. BUILD IBAN + ACCOUNT-NUMBER → PERSON MAPS ───────────────
  // Harvest from narrations that carry BOTH an identifier and a name. Proximity first
  // (name within 80 chars after the identifier), whole-text only as a fallback.
  const harvest = (regex) => {
    const hits = new Map(), labels = new Map();
    txns.forEach(t => {
      const text = allText(t);
      const found = text.match(regex);
      if (!found) return;
      [...new Set(found)].forEach(key => {
        const at = text.indexOf(key);
        const after = text.slice(at + key.length, at + key.length + 80);
        if (!labels.has(key)) labels.set(key, after.replace(/\s+/g, " ").trim().slice(0, 44));
        let m = matchPeople(after);
        if (!m.people.length) m = matchPeople(text);
        if (m.people.length !== 1) return;
        if (!hits.has(key)) hits.set(key, new Map());
        const inner = hits.get(key);
        inner.set(m.people[0].name, (inner.get(m.people[0].name) || 0) + 1);
      });
    });
    const map = new Map(), conflicts = [];
    for (const [k, names] of hits) {
      if (names.size === 1) map.set(k, [...names.keys()][0]);
      else conflicts.push({ k, detail: [...names.entries()].map(([n, c]) => `${n}×${c}`).join(" / ") });
    }
    return { map, conflicts, labels };
  };
  const iban = harvest(IBAN_RE);
  const acctNo = harvest(ACCTNO_RE);
  H("3. IDENTIFIER → PERSON MAPS harvested from narrations");
  console.log(`  IBANs resolved to a person          : ${iban.map.size}   (conflicting, excluded: ${iban.conflicts.length})`);
  console.log(`  Internal acct numbers resolved      : ${acctNo.map.size}   (conflicting, excluded: ${acctNo.conflicts.length})`);
  [...acctNo.map.entries()].sort().forEach(([k, v]) => console.log(`    ${k}  →  ${v}`));

  // ── 4. ATTRIBUTION PASSES ──────────────────────────────────────
  const B = { A: [], IBAN: [], ACCT: [], B: [], OWN: [], NONE: [] };
  untagged.forEach(r => {
    const own = OWN_ACCOUNTS.find(o => o.re.test(r.text));
    const m = matchPeople(r.text);
    if (m.tier === "A" && m.people.length === 1) return B.A.push({ ...r, who: m.people[0].name });
    const byAcct = [...new Set((r.text.match(ACCTNO_RE) || []).filter(k => acctNo.map.has(k)).map(k => acctNo.map.get(k)))];
    if (byAcct.length === 1) return B.ACCT.push({ ...r, who: byAcct[0] });
    const byIban = [...new Set((r.text.match(IBAN_RE) || []).filter(k => iban.map.has(k)).map(k => iban.map.get(k)))];
    if (byIban.length === 1) return B.IBAN.push({ ...r, who: byIban[0] });
    if (m.tier === "B" && m.people.length === 1) return B.B.push({ ...r, who: m.people[0].name });
    if (own) return B.OWN.push({ ...r, who: own.label });
    B.NONE.push(r);
  });
  const sum = a => a.reduce((s, r) => s + r.amt, 0);
  const pct = v => (v / untaggedAmt * 100).toFixed(1) + "%";
  H("4. ATTRIBUTION RESULT");
  const line = (k, label) => console.log(`  ${label.padEnd(38)} ${String(B[k].length).padStart(3)} lines  ${money(sum(B[k])).padStart(20)}  ${pct(sum(B[k]))}`);
  line("A", "TIER A  name in narration");
  line("ACCT", "TIER A2 matched by internal acct no.");
  line("IBAN", "TIER A3 matched by IBAN");
  line("B", "TIER B  one distinctive name part");
  line("OWN", "OWN ACCOUNT — not a person at all");
  line("NONE", "MANUAL  nothing to go on");
  const auto = sum(B.A) + sum(B.ACCT) + sum(B.IBAN) + sum(B.B);
  console.log(`\n  → recoverable by script (A+A2+A3+B): ${money(auto)}  (${pct(auto)})`);
  console.log(`  → needs a human (OWN + MANUAL)     : ${money(sum(B.OWN) + sum(B.NONE))}  (${pct(sum(B.OWN) + sum(B.NONE))})`);

  H("5. PROPOSED ATTRIBUTION BY PERSON");
  const kindOf = new Map(roster.map(r => [r.name, r.kind]));
  const per = new Map();
  [...B.A, ...B.ACCT, ...B.IBAN, ...B.B].forEach(r => {
    if (!per.has(r.who)) per.set(r.who, { n: 0, amt: 0 });
    const p = per.get(r.who); p.n++; p.amt += r.amt;
  });
  [...per.entries()].sort((a, b) => b[1].amt - a[1].amt).forEach(([k, v]) =>
    console.log(`  ${k.padEnd(28)} ${String(kindOf.get(k) || "?").padEnd(7)} ${String(v.n).padStart(3)} lines  ${money(v.amt).padStart(20)}`));

  // ── OWN-ACCOUNT REVIEW LIST ────────────────────────────────────
  // Every payroll/commission line paid to a Nasama account. These need a human ruling:
  // misclassified transfer (should be BT) vs cash drawdown later handed to a broker.
  H(`8. OWN-ACCOUNT LINES — FULL REVIEW LIST (${B.OWN.length} lines, ${money(sum(B.OWN))})`);
  console.log("  Date        Typ Acct            Amount  Narration");
  console.log("  " + "─".repeat(74));
  B.OWN.sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(r =>
    console.log(`  ${String(r.date).padEnd(11)} ${String(r.txnType || "").padEnd(3)} ${r.code} ${money(r.amt).padStart(16)}  ${r.text.replace(/\s+/g, " ").slice(0, 70)}`));
  const byYear = {};
  B.OWN.forEach(r => { const y = String(r.date || "").slice(0, 4); byYear[y] = (byYear[y] || 0) + r.amt; });
  console.log("\n  By year: " + Object.entries(byYear).sort().map(([y, v]) => `${y} ${money(v)}`).join("   |   "));

  // ── 6. PEOPLE PAID BUT NOT IN THE SYSTEM ───────────────────────
  // Names sitting after an internal acct number / IBAN that match nobody on the roster.
  H("6. PAID BUT NOT ON THE ROSTER — candidate employees to create");
  const unknown = new Map();
  untagged.forEach(r => {
    const seg = r.text.match(/(?:FUND TRANSFER|IPP TRANSFER)[^A-Za-z]*(?:0\d{11}|AE\d{21})\s*-\s*([A-Z][A-Z ]{5,40})/g) || [];
    seg.forEach(s => {
      const nm = (s.split("-").pop() || "").trim();
      if (nm.length < 6) return;
      if (matchPeople(nm).people.length) return;                       // already a known person
      if (OWN_ACCOUNTS.some(o => o.re.test(nm))) return;                // own account label
      if (KNOWN_REVERSALS.some(k => nm.includes(k) || k.includes(nm))) return;  // confirmed contra entry
      const key = nm.replace(/\s+/g, " ");
      if (!unknown.has(key)) unknown.set(key, { n: 0, amt: 0, codes: new Set() });
      const u = unknown.get(key); u.n++; u.amt += r.amt; u.codes.add(r.code);
    });
  });
  if (!unknown.size) console.log("  (none found)");
  [...unknown.entries()].sort((a, b) => b[1].amt - a[1].amt).slice(0, 25).forEach(([k, v]) =>
    console.log(`  ${k.padEnd(40)} ${String(v.n).padStart(3)} lines ${money(v.amt).padStart(16)}  acct ${[...v.codes].join(",")}`));

  H(`7. STILL MANUAL (${B.NONE.length} lines, ${money(sum(B.NONE))})`);
  B.NONE.sort((a, b) => b.amt - a.amt).slice(0, 15).forEach(r =>
    console.log(`  ${String(r.date).padEnd(11)} ${String(r.txnType || "").padEnd(3)} ${r.code} ${money(r.amt).padStart(15)}  ${r.text.replace(/\s+/g, " ").slice(0, 78)}`));
  if (B.NONE.length > 15) console.log(`  … and ${B.NONE.length - 15} more, totalling ${money(sum(B.NONE.slice(15)))}`);

  // ── 9. PAYROLL REGISTER PREVIEW ────────────────────────────────
  // This is Tab 3 of the Employee module, computed from projected attribution: person × account,
  // closed off with the control total that must tie back to the general ledger.
  H("9. PAYROLL REGISTER PREVIEW — person × account, with control total");
  const CODES = Object.keys(PAYROLL_ACCOUNTS).sort();
  const cell = new Map();  // person → {code: amt}
  [...B.A, ...B.ACCT, ...B.IBAN, ...B.B].forEach(r => {
    if (!cell.has(r.who)) cell.set(r.who, {});
    cell.get(r.who)[r.code] = (cell.get(r.who)[r.code] || 0) + r.amt;
  });
  const w = 11;
  console.log("  " + "Person".padEnd(27) + CODES.map(c => c.padStart(w)).join("") + "TOTAL".padStart(w + 3));
  console.log("  " + "─".repeat(27 + CODES.length * w + w + 3));
  const fmtCell = v => v === undefined ? "—".padStart(w) : (v / 100).toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(w);
  [...cell.entries()].map(([k, v]) => ({ k, v, t: Object.values(v).reduce((s, x) => s + x, 0) }))
    .sort((a, b) => b.t - a.t)
    .forEach(({ k, v, t }) => console.log("  " + k.slice(0, 26).padEnd(27) + CODES.map(c => fmtCell(v[c])).join("") + fmtCell(t).padStart(w + 3)));
  console.log("  " + "─".repeat(27 + CODES.length * w + w + 3));
  const colTot = {};
  CODES.forEach(c => { colTot[c] = [...cell.values()].reduce((s, v) => s + (v[c] || 0), 0); });
  console.log("  " + "ATTRIBUTED".padEnd(27) + CODES.map(c => fmtCell(colTot[c])).join("") + fmtCell(sum(B.A) + sum(B.ACCT) + sum(B.IBAN) + sum(B.B)).padStart(w + 3));
  console.log("\n  Control total — must tie to the general ledger:");
  const attributed = sum(B.A) + sum(B.ACCT) + sum(B.IBAN) + sum(B.B);
  const glTotal = Object.values(perAcct).reduce((s, v) => s + v, 0);
  console.log(`    Already tagged in the ledger      ${money(taggedAmt).padStart(20)}`);
  console.log(`    Projected by attribution          ${money(attributed).padStart(20)}`);
  console.log(`    Own-account (not a person)        ${money(sum(B.OWN)).padStart(20)}   ← ruling pending`);
  console.log(`    Unattributed remainder            ${money(sum(B.NONE)).padStart(20)}`);
  console.log(`    ${"─".repeat(48)}`);
  const recon = taggedAmt + attributed + sum(B.OWN) + sum(B.NONE);
  console.log(`    Sum                               ${money(recon).padStart(20)}`);
  console.log(`    GL movement 5000–5510             ${money(glTotal).padStart(20)}`);
  console.log(`    Difference                        ${money(recon - glTotal).padStart(20)}  ${recon === glTotal ? "✓ ties" : "✗ DOES NOT TIE"}`);
})().catch(e => { console.error("\nFAILED:", e.message); process.exit(1); });
