// ─────────────────────────────────────────────────────────────────────────────
//  Client funds held (2230) — regression spec
//
//  Zero dependencies (uses the vendored Babel to load core.jsx). Run with:
//      node tests/client-funds.test.js
//  Exits non-zero if any assertion fails.
//
//  Drives the REAL journal engine and the REAL KPI calculator out of core.jsx —
//  not a reimplementation — so these assertions guard the shipped code. All
//  amounts are integer CENTS (AED × 100), as money is stored throughout the app.
//
//  The model being pinned down (see the CLIENT FUNDS block in core.jsx):
//
//    Client money is NOT segregated. It lands in the company's own Mashreq
//    account, so the same dirhams are simultaneously real cash in 1002 and a
//    real liability in 2230. That pair must net to zero on revenue, profit and
//    equity — and `cash` therefore OVERSTATES what the company may spend.
//
//    • Receiving client funds moves no revenue and no VAT. It is not a supply.
//    • Recognising commission out of held funds carries NO cash line: the money
//      is already in the bank, it just stops being someone else's.
//    • Paying funds out is not an expense — it clears a liability.
//    • availableCash = cash − clientFundsHeld, and the RUNWAY must divide
//      availableCash. Dividing `cash` reports client money as company runway,
//      which is the whole bug this feature exists to prevent.
//    • Nothing may be released that is not held (no negative 2230).
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const babel = require(path.join(ROOT, "vendor", "babel-standalone-7.29.7.min.js"));

// core.jsx is a plain script of top-level declarations; nothing executes on load,
// so the browser globals it closes over only need to exist as names.
const code = babel.transform(fs.readFileSync(path.join(ROOT, "nasama-accounting-v2.core.jsx"), "utf8"),
  { presets: ["react", "env"] }).code;
const NAMES = ["React", "firebase", "db", "auth", "window", "document", "localStorage",
  "toast", "XLSX", "html2canvas", "jspdf", "logAudit", "console"];
const CORE = new Function(...NAMES, code + `
  ; return { createJournalEngine, calculateAppKpis, accountBalance, buildLedger, toCents,
             clientFundsHeldTotal, isClientFundsTxn, clientFundsMovement,
             depositCloseoutPlan, buildClientFundsLedger, dealGrossCents, dealCollection,
             TXN_TYPES, SEED_ACCOUNTS, CLIENT_FUNDS_CODE };`)
  .apply(null, NAMES.map(n =>
    n === "React"   ? { createElement: () => null, Fragment: "F", useState: () => [], useEffect: () => {}, useMemo: () => {}, useCallback: () => {}, useRef: () => ({}) }
  : n === "console" ? console
  : () => undefined));

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  if (actual === expected) passed++;
  else { failed++; console.error(`  ✗ ${msg}\n      expected ${expected}, got ${actual}`); }
}
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error(`  ✗ ${msg}`); } }
function throws(fn, match, msg) {
  try { fn(); failed++; console.error(`  ✗ ${msg}\n      expected a throw, got none`); }
  catch (e) {
    if (!match || String(e.message).includes(match)) passed++;
    else { failed++; console.error(`  ✗ ${msg}\n      threw "${e.message}", expected to include "${match}"`); }
  }
}

// ── fixtures ────────────────────────────────────────────────────────────────
const ACCOUNTS = [
  { id: "aCash", code: "1001", name: "Cash",              type: "Asset",     isCash: true },
  { id: "aBank", code: "1002", name: "Bank — Mashreq",    type: "Asset",     isBank: true },
  { id: "aVAT",  code: "2101", name: "Output VAT Payable",type: "Liability", isOutputVAT: true },
  { id: "aRnd",  code: "2105", name: "VAT Rounding",      type: "Liability" },
  { id: "aCF",   code: "2230", name: "Client Funds Held", type: "Liability" },
  { id: "a4000", code: "4000", name: "Developer Commission", type: "Revenue" },
  { id: "a5100", code: "5100", name: "Office Rent",       type: "Expense" },
];
const DEAL = { id: "d1", type: "Off-Plan", property_name: "The View Island", client_name: "Acme LLC", broker_id: "BR003", developer: "DEV1" };

const ledgerOf   = txns => CORE.buildLedger(txns, ACCOUNTS);
const balOf      = (code, txns) => CORE.accountBalance(ACCOUNTS.find(a => a.code === code), ledgerOf(txns));
const engineOver = txns => CORE.createJournalEngine({ accounts: ACCOUNTS, txns, saveTxn: () => {} });
const sumD = t => (t.lines || []).reduce((s, l) => s + (l.debit || 0), 0);
const sumC = t => (t.lines || []).reduce((s, l) => s + (l.credit || 0), 0);
const lineFor = (t, code) => {
  const id = ACCOUNTS.find(a => a.code === code).id;
  return (t.lines || []).find(l => l.accountId === id) || null;
};
const kpisOver = txns => CORE.calculateAppKpis({
  accounts: ACCOUNTS, txns, deals: [], ledger: ledgerOf(txns), settings: {},
});

// ── 0. wiring ───────────────────────────────────────────────────────────────
console.log("wiring");
eq(CORE.CLIENT_FUNDS_CODE, "2230", "client funds live in account 2230");
ok(!!CORE.TXN_TYPES.CF, "CF is a registered transaction type (so the Journal filter can select it)");
ok(/not company revenue/i.test(CORE.TXN_TYPES.CF.desc),
  "the CF label states outright that client funds are not company revenue");
ok(CORE.SEED_ACCOUNTS.some(a => a.code === "2230" && a.type === "Liability"),
  "2230 is seeded as a Liability — money held is owed, never equity");
ok(!CORE.SEED_ACCOUNTS.some(a => a.code === "2230" && (a.isBank || a.isCash)),
  "2230 is NOT flagged as bank/cash — flagging it would double-count the commingled dirhams into kpis.cash");

// ── 1. Receiving client funds — the entry the owner approved ─────────────────
console.log("client funds received");
const J0 = engineOver([]);
const RCV = J0.postClientFunds({ date: "2026-08-12", amount: 121000, receivedFrom: "Acme LLC", deal_id: "d1", commit: false });

eq(sumD(RCV), sumC(RCV), "receipt is balanced");
eq(sumD(RCV), 12100000, "DR/CR are AED 121,000.00 in fils");
eq(lineFor(RCV, "1002").debit, 12100000, "DR 1002 Bank 121,000");
eq(lineFor(RCV, "2230").credit, 12100000, "CR 2230 Client Funds Held 121,000");
eq(RCV.lines.length, 2, "exactly two lines — nothing else is touched");
eq(lineFor(RCV, "4000"), null, "NO revenue line: receiving client money is not a supply");
eq(lineFor(RCV, "2101"), null, "NO output VAT line: it is not our consideration");
eq(RCV.txnType, "CF", "posts as a CF transaction");
eq(CORE.clientFundsMovement(RCV), "received", "classified as a 'received' movement");
ok(CORE.isClientFundsTxn(RCV), "recognised as a client-funds transaction");

const held121 = [RCV];
eq(balOf("2230", held121), 12100000, "2230 balance = 121,000 held");
eq(balOf("1002", held121), 12100000, "bank balance rose by the full 121,000 — the cash is really there");
eq(balOf("4000", held121), 0, "revenue is untouched");
eq(balOf("2101", held121), 0, "output VAT is untouched");

// Whose money it is must be recorded, or the liability is untraceable.
throws(() => J0.postClientFunds({ date: "2026-08-12", amount: 5000, receivedFrom: "", commit: false }),
  "receivedFrom", "a receipt with no payer name is refused");
throws(() => J0.postClientFunds({ date: "2026-08-12", amount: 0, receivedFrom: "Acme LLC", commit: false }),
  "positive", "a zero amount is refused");
throws(() => J0.postClientFunds({ date: "2026-08-12", amount: -100, receivedFrom: "Acme LLC", commit: false }),
  "positive", "a negative amount is refused");

// ── 2. Profit and equity are untouched while money is merely held ───────────
console.log("no profit effect while held");
const K_held = kpisOver(held121);
eq(K_held.rev, 0, "revenue KPI stays 0 while funds are only held");
eq(K_held.cash, 12100000, "cash KPI sees the full bank balance (it must tie to the statement)");
eq(K_held.clientFundsHeld, 12100000, "clientFundsHeld reports the 2230 balance");
eq(K_held.availableCash, 0, "availableCash is 0 — none of this money is ours");
eq(K_held.totalAssets - K_held.totalLiabilities, 0,
  "assets − liabilities = 0: the matched pair nets out, so equity does not move");

// ── 3. THE BUG THIS PREVENTS: runway must not spend client money ─────────────
console.log("runway uses availableCash, not cash");
const RENT = {
  id: "t_rent", date: "2026-07-01", txnType: "PV", isVoid: false,
  lines: [{ accountId: "a5100", debit: 1000000, credit: 0 }, { accountId: "aBank", debit: 0, credit: 1000000 }],
};
// Company money of its own: 50,000 in, plus 121,000 of client money, against a
// 10,000 expense. Spendable runway is driven by the 50,000, never the 171,000.
const OWN = {
  id: "t_own", date: "2026-07-02", txnType: "SR", isVoid: false, deal_id: "d1",
  lines: [{ accountId: "aBank", debit: 5000000, credit: 0 }, { accountId: "a4000", debit: 0, credit: 5000000 }],
};
const K_mixed = kpisOver([RENT, OWN, RCV]);
eq(K_mixed.cash, 16100000, "total cash = 50,000 own + 121,000 client − 10,000 spent = 161,000");
eq(K_mixed.clientFundsHeld, 12100000, "121,000 of that is held for clients");
eq(K_mixed.availableCash, 4000000, "available to the company = 40,000");
ok(K_mixed.avgMonthlyExpense > 0, "fixture produces a non-zero average monthly expense");
eq(K_mixed.runwayMonths, K_mixed.availableCash / K_mixed.avgMonthlyExpense,
  "runwayMonths divides availableCash");
ok(K_mixed.runwayMonths < K_mixed.cash / K_mixed.avgMonthlyExpense,
  "runway is SHORTER than a cash-based runway would report — client money is not runway");

// ── 4. Recognising commission out of held funds ──────────────────────────────
console.log("client funds → earned");
const J1 = engineOver(held121);
const EARN = J1.postClientFundsEarned({ date: "2026-08-12", deal: DEAL, gross: 21000, vatRate: 5, commit: false });

eq(sumD(EARN), sumC(EARN), "recognition is balanced");
eq(lineFor(EARN, "2230").debit, 2100000, "DR 2230 by the gross 21,000 — the liability shrinks");
eq(lineFor(EARN, "4000").credit, 2000000, "CR 4000 revenue NET of VAT = 20,000.00");
eq(lineFor(EARN, "2101").credit, 100000, "CR 2101 output VAT = 1,000.00");
eq(lineFor(EARN, "1002"), null, "NO bank line — the dirhams are already in the bank, they just stop being the client's");
eq(lineFor(EARN, "1001"), null, "no cash line either");
eq(CORE.clientFundsMovement(EARN), "earned", "classified as an 'earned' movement");

const afterEarn = [RCV, EARN];
eq(balOf("2230", afterEarn), 10000000, "2230 falls to 100,000 still held");
eq(balOf("1002", afterEarn), 12100000, "bank balance is UNCHANGED by recognition");
eq(balOf("4000", afterEarn), 2000000, "revenue is now 20,000");
eq(balOf("2101", afterEarn), 100000, "output VAT payable is 1,000");
const K_earn = kpisOver(afterEarn);
eq(K_earn.availableCash, 2100000, "availableCash rises to 21,000 — exactly the amount that became ours");
eq(K_earn.cash, 12100000, "total cash did not move: no money entered or left the bank");

// VAT split lands exactly, and the deal drives the revenue account.
eq(lineFor(EARN, "4000").credit + lineFor(EARN, "2101").credit, 2100000,
  "net + VAT reconstitutes the gross to the fils");
throws(() => J1.postClientFundsEarned({ date: "2026-08-12", deal: { id: "dX", type: "Bogus" }, gross: 100, commit: false }),
  "Invalid deal type", "an unknown deal type is refused rather than guessed");
throws(() => J1.postClientFundsEarned({ date: "2026-08-12", deal: null, gross: 100, commit: false }),
  "deal is required", "recognition without a deal is refused — revenue must be attributable");

// ── 5. Paying the money out ─────────────────────────────────────────────────
console.log("client funds paid out");
const J2 = engineOver(afterEarn);
const PAY = J2.postClientFundsPayout({ date: "2026-08-13", amount: 100000, paidTo: "Seller Ltd", commit: false });

eq(sumD(PAY), sumC(PAY), "payout is balanced");
eq(lineFor(PAY, "2230").debit, 10000000, "DR 2230 clears the remaining 100,000");
eq(lineFor(PAY, "1002").credit, 10000000, "CR 1002 the cash actually leaves the bank");
eq(PAY.lines.length, 2, "two lines only");
eq(lineFor(PAY, "5100"), null, "NO expense line: handing back money that was never income is not a cost");
eq(CORE.clientFundsMovement(PAY), "paid", "classified as a 'paid' movement");

const settled = [RCV, EARN, PAY];
eq(balOf("2230", settled), 0, "2230 is back to zero — nothing is held any more");
eq(balOf("1002", settled), 2100000, "bank retains exactly our 21,000 commission");
const K_done = kpisOver(settled);
eq(K_done.clientFundsHeld, 0, "nothing held");
eq(K_done.availableCash, K_done.cash, "with nothing held, availableCash == cash");
eq(K_done.rev, 2000000, "revenue over the whole cycle is the 20,000 net — never the 121,000 passing through");

throws(() => J2.postClientFundsPayout({ date: "2026-08-13", amount: 100, paidTo: "", commit: false }),
  "paidTo", "a payout with no recipient is refused");

// ── 6. You cannot release what you do not hold ───────────────────────────────
console.log("cannot over-release");
const JEmpty = engineOver([]);
throws(() => JEmpty.postClientFundsPayout({ date: "2026-08-13", amount: 1000, paidTo: "Seller Ltd", commit: false }),
  "only AED 0.00 is held", "paying out with nothing held is refused");
throws(() => JEmpty.postClientFundsEarned({ date: "2026-08-13", deal: DEAL, gross: 1000, commit: false }),
  "only AED 0.00 is held", "recognising revenue with nothing held is refused");
const J3 = engineOver(held121);
throws(() => J3.postClientFundsPayout({ date: "2026-08-13", amount: 121000.01, paidTo: "Seller Ltd", commit: false }),
  "Cannot pay out", "paying out one fils more than is held is refused");
ok(!!J3.postClientFundsPayout({ date: "2026-08-13", amount: 121000, paidTo: "Seller Ltd", commit: false }),
  "paying out exactly what is held is allowed");
eq(J3.clientFundsHeldCents(), 12100000, "the engine reports the held balance in fils");

// Voided receipts stop counting as held, or a void would strand a phantom liability.
const VOIDED = { ...RCV, id: "t_void", isVoid: true };
eq(engineOver([VOIDED]).clientFundsHeldCents(), 0, "a voided receipt holds nothing");
eq(kpisOver([VOIDED]).clientFundsHeld, 0, "a voided receipt does not appear in clientFundsHeld");

// ── 7. Tag discipline — the accrual trap, repeated here ─────────────────────
console.log("tag discipline");
// All three tags begin with "client-funds"; a substring test cannot tell them
// apart, and mislabelling a payout as a receipt would invert the liability.
eq(CORE.clientFundsMovement({ txnType: "CF", tags: "client-funds-received" }), "received", "received tag");
eq(CORE.clientFundsMovement({ txnType: "CF", tags: "client-funds-earned" }),   "earned",   "earned tag");
eq(CORE.clientFundsMovement({ txnType: "CF", tags: "client-funds-paid" }),     "paid",     "paid tag");
eq(CORE.clientFundsMovement({ txnType: "SR", tags: "sale-receipt" }), null, "a sale receipt is not client funds");
eq(CORE.clientFundsMovement({ txnType: "PV", tags: "accrual-settlement" }), null, "an accrual settlement is not client funds");
ok(!CORE.isClientFundsTxn({ txnType: "PV", tags: "client-funds-adjacent-nonsense" }),
  "an unknown tag beginning with 'client-funds' is not silently accepted as one of the three");
ok(!CORE.isClientFundsTxn({ txnType: "JV", tags: "" }), "an untagged JV is not client funds");
ok(!CORE.isClientFundsTxn(null), "null is handled");

// clientFundsHeldTotal must not invent a balance when the account is absent.
eq(CORE.clientFundsHeldTotal([{ id: "x", code: "1002", type: "Asset" }], {}), 0,
  "a chart without 2230 reports zero held rather than throwing");

// ── 8. The deposit lifecycle — refund in full, or deduct commission ──────────
// Owner's workflow: money is held as a REFUNDABLE security deposit until the deal
// closes. Then it is either refunded in full, or the commission is deducted and
// the rest refunded. VAT arises on the commission only, and only at that moment.
console.log("deposit closeout");

// TVI-126's real figures, in both VAT modes (2,420,000 @ 5%).
const DEAL_INCL = { id: "d_incl", type: "Off-Plan", property_name: "The View Island",
  transaction_value: 242000000, commission_pct: 5, vat_applicable: true,
  commission_vat_inclusive: true, expected_commission_net: 11523810 };
const DEAL_TOP  = { id: "d_top", type: "Off-Plan", property_name: "On Top Deal",
  transaction_value: 242000000, commission_pct: 5, vat_applicable: true,
  commission_vat_inclusive: false, expected_commission_net: 12100000 };
const DEAL_NOVAT = { id: "d_novat", type: "Rental", property_name: "No VAT Deal",
  transaction_value: 11000000, commission_pct: 5, vat_applicable: false,
  expected_commission_net: 550000 };

// Deal cancelled: the whole deposit goes back, and no VAT ever arises.
const full = CORE.depositCloseoutPlan(null, 20000000);
eq(full.applied, 0, "no commission applied when there is no deal to close against");
eq(full.vat, 0, "a full refund carries no VAT — nothing was ever supplied");
eq(full.refundDue, 20000000, "the entire 200,000 deposit is refundable");
eq(full.shortfall, 0, "no shortfall on a full refund");

// Deal closes, commission deducted, remainder refunded — VAT INCLUSIVE terms.
const inc = CORE.depositCloseoutPlan(DEAL_INCL, 20000000);
eq(inc.commissionGross, 12100000, "INCLUSIVE: the all-in commission is AED 121,000.00");
eq(inc.applied, 12100000, "121,000 is deducted from the deposit");
eq(inc.net, 11523810, "net commission AED 115,238.10 — the deal's own stored net");
eq(inc.vat, 576190, "VAT AED 5,761.90 is the REMAINDER, not 5% of net");
eq(inc.net + inc.vat, inc.applied, "net + VAT reconstitutes the deducted amount exactly");
eq(inc.refundDue, 7900000, "AED 79,000.00 goes back to the client");
eq(inc.applied + inc.refundDue, inc.held, "deducted + refunded = deposit held (nothing is lost)");

// Same deal value under VAT-ON-TOP terms deducts more from the deposit.
const top = CORE.depositCloseoutPlan(DEAL_TOP, 20000000);
eq(top.commissionGross, 12705000, "ON TOP: 121,000 fee + 6,050 VAT = AED 127,050.00 deducted");
eq(top.net, 12100000, "net commission AED 121,000.00");
eq(top.vat, 605000, "VAT AED 6,050.00 added on top");
eq(top.net + top.vat, top.applied, "net + VAT ties to the deduction");
eq(top.refundDue, 7295000, "AED 72,950.00 refunded");
ok(top.applied > inc.applied, "ON TOP terms take more out of the deposit than INCLUSIVE terms");

// A deal with no VAT deducts the commission flat.
const nov = CORE.depositCloseoutPlan(DEAL_NOVAT, 2000000);
eq(nov.applied, 550000, "no-VAT deal deducts the bare commission");
eq(nov.vat, 0, "and charges no VAT");
eq(nov.net, 550000, "the whole deduction is net");
eq(nov.refundDue, 1450000, "the rest is refunded");

// Deposit too small to cover the commission — flagged, never silently netted off.
const short = CORE.depositCloseoutPlan(DEAL_INCL, 5000000);
eq(short.applied, 5000000, "only what is held can be applied");
eq(short.shortfall, 7100000, "AED 71,000.00 of commission is still to collect elsewhere");
eq(short.refundDue, 0, "nothing left to refund");
eq(short.net + short.vat, short.applied, "a partial deduction still splits exactly");
eq(short.vat, 238095, "partial deduction backs VAT out of the applied amount");

// The plan drives the real postings, and they tie back to it.
const J4 = engineOver([RCV]);   // 121,000 held
const planFromHeld = CORE.depositCloseoutPlan(DEAL_NOVAT, J4.clientFundsHeldCents());
eq(planFromHeld.held, 12100000, "the plan reads the live held balance");
eq(planFromHeld.refundDue, 11550000, "121,000 held − 5,500 commission = 115,500 refundable");

// ── 9. Per-deal deposit subledger ────────────────────────────────────────────
console.log("per-deal subledger");
const cfLine = (credit, debit) => [
  { accountId: "aCF", debit: debit || 0, credit: credit || 0 },
  { accountId: "aBank", debit: credit || 0, credit: debit || 0 },
];
const D1_IN  = { id: "x1", date: "2026-08-01", txnType: "CF", tags: "client-funds-received", isVoid: false, deal_id: "dA", counterparty: "Acme LLC", lines: cfLine(20000000, 0) };
const D2_IN  = { id: "x2", date: "2026-08-02", txnType: "CF", tags: "client-funds-received", isVoid: false, deal_id: "dB", counterparty: "Beta FZE", lines: cfLine(5000000, 0) };
const D1_OUT = { id: "x3", date: "2026-08-05", txnType: "CF", tags: "client-funds-paid",     isVoid: false, deal_id: "dA", counterparty: "Acme LLC", lines: cfLine(0, 7900000) };
const D1_EARN= { id: "x4", date: "2026-08-05", txnType: "CF", tags: "client-funds-earned",   isVoid: false, deal_id: "dA", counterparty: "Acme LLC",
  lines: [{ accountId: "aCF", debit: 12100000, credit: 0 }, { accountId: "a4000", debit: 0, credit: 11523810 }, { accountId: "aVAT", debit: 0, credit: 576190 }] };

const SUB = CORE.buildClientFundsLedger({ txns: [D1_IN, D2_IN, D1_OUT, D1_EARN], accounts: ACCOUNTS });
eq(SUB.parties.length, 2, "two parties hold deposits");
eq(SUB.received, 25000000, "AED 250,000 received in total");
eq(SUB.applied, 12100000, "AED 121,000 applied to commission");
eq(SUB.refunded, 7900000, "AED 79,000 refunded");
eq(SUB.held, 5000000, "AED 50,000 still held");
eq(SUB.received - SUB.applied - SUB.refunded, SUB.held, "received − applied − refunded = held");
eq(SUB.untracked, 0, "control total ties: the subledger accounts for every fils of 2230 movement");

const dA = SUB.parties.find(p => p.deal_id === "dA");
const dB = SUB.parties.find(p => p.deal_id === "dB");
eq(dA.held, 0, "deal A is fully closed out — nothing still held");
eq(dA.applied, 12100000, "deal A applied 121,000 to commission");
eq(dA.refunded, 7900000, "deal A refunded 79,000");
eq(dB.held, 5000000, "deal B still holds its 50,000 deposit");
eq(dB.applied, 0, "deal B has applied nothing yet");

// A manual JV touching 2230 without a client-funds tag must SURFACE, not vanish.
const ROGUE = { id: "x5", date: "2026-08-06", txnType: "JV", tags: "", isVoid: false, lines: cfLine(1500000, 0) };
const SUB2 = CORE.buildClientFundsLedger({ txns: [D1_IN, D2_IN, D1_OUT, D1_EARN, ROGUE], accounts: ACCOUNTS });
eq(SUB2.held, 5000000, "the untagged entry does not silently join a party's balance");
eq(SUB2.untracked, 1500000, "it is reported as AED 15,000 of untracked 2230 movement");
eq(SUB2.glMovement, 6500000, "GL movement on 2230 includes it, as the ledger does");

// Voids are excluded, and the date filter narrows both sides together.
eq(CORE.buildClientFundsLedger({ txns: [{ ...D1_IN, isVoid: true }], accounts: ACCOUNTS }).held, 0,
  "a voided deposit holds nothing");
const SUB3 = CORE.buildClientFundsLedger({ txns: [D1_IN, D2_IN, D1_OUT, D1_EARN], accounts: ACCOUNTS, from: "2026-08-01", to: "2026-08-02" });
eq(SUB3.received, 25000000, "date filter keeps both deposits");
eq(SUB3.applied, 0, "and excludes the later closeout");
eq(SUB3.untracked, 0, "the control total still ties inside the filtered window");

// ── 10. A deposit is not a collection ────────────────────────────────────────
// dealCollection sums bank/cash DEBITS on every txn linked to a deal. A deposit
// debits the bank, and the refund that reverses it is a CREDIT that a debit-only
// sum never subtracts — so before this was fixed, taking a 121,000 deposit on a
// deal made the deal read as 121,000 of commission collected, for good, even
// after the money went back. Only the moment it becomes ours may count.
console.log("deposits are not collection");
const DEAL_COLL = { id: "d1", type: "Off-Plan", property_name: "The View Island",
  vat_applicable: true, expected_commission_net: 2000000 };   // 20,000 net → 21,000 gross

eq(CORE.dealCollection(DEAL_COLL, [RCV], ACCOUNTS).collectedCents, 0,
  "a 121,000 deposit linked to the deal collects NOTHING — the money is not ours");
eq(CORE.dealCollection(DEAL_COLL, [RCV], ACCOUNTS).count, 0,
  "and it does not appear as an installment on the deal");
eq(CORE.dealCollection(DEAL_COLL, [RCV], ACCOUNTS).remainingCents, 2100000,
  "the full 21,000 gross commission is still outstanding");

// The closeout DOES collect: the cash is already in the bank, it just stopped
// being the client's. That entry has no cash line, so its 2230 debit is the figure.
const collAfterEarn = CORE.dealCollection(DEAL_COLL, [RCV, EARN], ACCOUNTS);
eq(collAfterEarn.collectedCents, 2100000, "recognising the commission collects the gross 21,000");
eq(collAfterEarn.count, 1, "and shows as exactly one installment, not two");
eq(collAfterEarn.remainingCents, 0, "nothing left outstanding");

// Deposit taken then refunded in full (deal cancelled) must leave no trace.
const PAY_D1 = engineOver([RCV]).postClientFundsPayout({
  date: "2026-08-14", amount: 121000, paidTo: "Acme LLC", deal_id: "d1", commit: false });
eq(CORE.dealCollection(DEAL_COLL, [RCV, PAY_D1], ACCOUNTS).collectedCents, 0,
  "deposit in and straight back out leaves the deal with nothing collected");

// An ordinary Sale Receipt must still count — the filter is narrow, not blanket.
eq(CORE.dealCollection(DEAL_COLL, [OWN], ACCOUNTS).collectedCents, 5000000,
  "a real Sale Receipt still collects its 50,000");
eq(CORE.dealCollection(DEAL_COLL, [OWN, RCV, EARN], ACCOUNTS).collectedCents, 7100000,
  "receipt + closeout add up; the deposit between them adds nothing");

// ── 11. A commission already collected is not recognised twice ───────────────
console.log("no double recognition at closeout");
const twice = CORE.depositCloseoutPlan(DEAL_TOP, 20000000, 12705000);
eq(twice.fullCommission, 12705000, "the deal's whole commission is 127,050");
eq(twice.alreadyCollected, 12705000, "all of it was already collected elsewhere");
eq(twice.commissionGross, 0, "so nothing remains to deduct from the deposit");
eq(twice.applied, 0, "nothing is applied — the revenue was booked once already");
eq(twice.vat, 0, "and no second lot of VAT arises");
eq(twice.refundDue, 20000000, "the entire 200,000 deposit goes back");

// Partly collected: only the balance comes out of the deposit.
const part = CORE.depositCloseoutPlan(DEAL_TOP, 20000000, 5000000);
eq(part.commissionGross, 7705000, "127,050 − 50,000 already collected = 77,050 outstanding");
eq(part.applied, 7705000, "and that is what the deposit covers");
eq(part.net + part.vat, part.applied, "the partial deduction still splits exactly");
ok(part.vat > 0, "VAT is positive — the stored full-deal net must not be reused here");
eq(part.net, 7338095, "net is backed out of the deduction, not taken from the deal");
eq(part.refundDue, 12295000, "the rest of the deposit is refunded");

// The default keeps the original behaviour for every existing caller.
eq(CORE.depositCloseoutPlan(DEAL_TOP, 20000000).applied,
   CORE.depositCloseoutPlan(DEAL_TOP, 20000000, 0).applied,
   "omitting alreadyCollected reads as zero");

// ── 12. The posting honours the split the user approved ─────────────────────
// The modal shows a net/VAT split taken from the deal's own stored net. The
// posting used to re-derive gross/1.05, which disagrees under INCLUSIVE terms
// when the stored net has drifted — the user would approve one split and the
// ledger would record another.
console.log("approved split is what gets posted");
const DRIFTED = { id: "d_drift", type: "Off-Plan", property_name: "Drifted Deal",
  transaction_value: 242000000, commission_pct: 5, vat_applicable: true,
  commission_vat_inclusive: true, expected_commission_net: 11000000 };  // hand-edited, drifted
const driftPlan = CORE.depositCloseoutPlan(DRIFTED, 20000000);
eq(driftPlan.applied, 12100000, "the all-in commission is still 121,000");
eq(driftPlan.net, 11000000, "the modal shows the deal's own stored net, 110,000");
eq(driftPlan.vat, 1100000, "and VAT as the remainder, 11,000");

const J5 = engineOver([RCV]);
const DRIFT_TXN = J5.postClientFundsEarned({ date: "2026-08-14", deal: DRIFTED,
  gross: driftPlan.applied / 100, vatRate: 5, netCents: driftPlan.net, commit: false });
eq(lineFor(DRIFT_TXN, "4000").credit, 11000000, "revenue posted = the net the user approved");
eq(lineFor(DRIFT_TXN, "2101").credit, 1100000, "VAT posted = the remainder the user approved");
eq(lineFor(DRIFT_TXN, "4000").credit + lineFor(DRIFT_TXN, "2101").credit, driftPlan.applied,
  "and they still reconstitute the gross exactly");

// Without the override it falls back to deriving the split, as before.
const DERIVED = J5.postClientFundsEarned({ date: "2026-08-14", deal: DRIFTED, gross: 121000, vatRate: 5, commit: false });
eq(lineFor(DERIVED, "4000").credit, 11523810, "no override → gross ÷ 1.05, the old behaviour");

// A nonsense override is refused rather than posting an unbalanced-looking split.
throws(() => J5.postClientFundsEarned({ date: "2026-08-14", deal: DRIFTED, gross: 121000, vatRate: 5, netCents: 13000000, commit: false }),
  "netCents must be between", "a net larger than the gross is refused");
throws(() => J5.postClientFundsEarned({ date: "2026-08-14", deal: DRIFTED, gross: 121000, vatRate: 5, netCents: -1, commit: false }),
  "netCents must be between", "a negative net is refused");

// ── done ────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
