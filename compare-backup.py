import json
from datetime import datetime

# Load backup file
with open(r'c:\Users\hp\Documents\Nasama-Accounting\nasama-backup-2026-05-25.json', 'r', encoding='utf-8', errors='ignore') as f:
    backup_data = json.load(f)

# Extract backup transactions
backup_txns = backup_data['collections']['transactions']

print("=" * 80)
print("BACKUP FILE ANALYSIS - nasama-backup-2026-05-25.json")
print("=" * 80)
print(f"\nExported At: {backup_data['exportedAt']}")
print(f"Total Transactions: {len(backup_txns)}")
print(f"Total Accounts: {len(backup_data['collections']['accounts'])}")

# Analyze bank transactions
bank_txns = [t for t in backup_txns if t.get('txnType') == 'BK']
print(f"\nBank Transactions (BK): {len(bank_txns)}")

# Group by date
from collections import defaultdict
by_date = defaultdict(int)
by_month = defaultdict(int)

for txn in bank_txns:
    if 'date' in txn:
        by_date[txn['date']] += 1
        month = txn['date'][:7]  # YYYY-MM
        by_month[month] += 1

print("\nBank Transactions by Month:")
for month in sorted(by_month.keys()):
    print(f"  {month}: {by_month[month]} transactions")

print("\n" + "=" * 80)
print("SAMPLE BANK TRANSACTIONS (first 5)")
print("=" * 80)

for i, txn in enumerate(bank_txns[:5]):
    print(f"\n{i+1}. Date: {txn.get('date')}")
    print(f"   Description: {txn.get('description', txn.get('import_narration', 'N/A'))}")
    print(f"   Amount: {txn.get('import_amount', 'N/A')} AED")
    print(f"   Reference: {txn.get('ref', 'N/A')}")
    print(f"   External ID: {txn.get('external_id', 'N/A')[:60]}...")

print("\n" + "=" * 80)
print("CHECKING FOR CURRENT DATA...")
print("=" * 80)

# Check if there's a local data export in the workspace
import os
workspace_path = r'c:\Users\hp\Documents\GitHub\nasama-accounting'
local_data_files = [f for f in os.listdir(workspace_path) if f.endswith('.json')]
print(f"\nJSON files in workspace: {local_data_files}")

# Summary by transaction type
print("\n" + "=" * 80)
print("TRANSACTION TYPES IN BACKUP")
print("=" * 80)
txn_types = defaultdict(int)
for txn in backup_txns:
    txn_types[txn.get('txnType', 'Unknown')] += 1

for txn_type in sorted(txn_types.keys()):
    print(f"  {txn_type}: {txn_types[txn_type]}")
