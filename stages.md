Proposed Stages
Stage 1 — Alerts & Quick Intelligence (existing data, low risk)
Everything here is derivable from data you already have. No new fields, no schema changes.

Budget vs Actual thresholds — add 80% (warning) and 100% (critical) visual indicators to the existing Budget section
Decision Alerts panel — a dedicated "Management Alerts" section on the Dashboard: cash runway below 3 months, commission overdue > 60 days, broker payable exceeds collected commission, deal has no receipt
Commission Collection Aging — a table grouping expected commissions by 0–30 / 31–60 / 61–90 / 90+ days (based on deal stage date)
Stage 2 — Profitability & Performance (medium complexity, high value)
Builds on deal, broker, developer, and expense data that already exists.

Deal Profitability View — per-deal breakdown: gross commission → VAT → broker commission → related expenses → net margin
Broker Performance KPIs — total deals, total commission generated, average deal value, net contribution, broker commission paid
Developer Performance — deals, total commission, collection delay, unpaid commission, average commission %
Expense Control Dashboard — expenses grouped by category vs. prior month vs. quarterly average vs. budget, with variance %
Stage 3 — Forecasting & Scenarios (higher complexity, strategic value)
Requires some forecasting logic but no new data entry.

Cash Flow Forecast — 3 / 6 / 12 month projection using current cash + planned expenses + expected commissions
Cash Runway with Scenarios — Conservative / Expected / Optimistic buttons (stage-weighted pipeline probabilities)
Probabilistic pipeline — assign collection probability per DEAL_STAGE (e.g., SPA Signed = 70%, Handover = 90%) and use it in runway calculations
Stage 4 — Advanced Intelligence (requires new data collection)
These require new fields and some retroactive work.

Broker Efficiency Matrix — conversion velocity (days Lead → Collected), deal leakage (cancellation rate per broker)
Fixed vs Variable cost classification — flag each expense as fixed or variable; flag deferrable items during slow months
Lead Source / CAC — add lead_source to Deal form; calculate marketing spend ÷ closed deals per source
VAT Readiness Score — per-period output VAT, input VAT, net payable, missing TRNs, settlement status
