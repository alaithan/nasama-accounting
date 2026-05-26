import json
from datetime import datetime
from collections import defaultdict
import os

def load_json_safe(filepath):
    """Load JSON with proper encoding"""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {filepath}: {e}")
        return None

def compare_backups(backup1_path, backup2_path):
    """Compare two backup files and identify differences"""
    
    print("=" * 90)
    print("NASAMA ACCOUNTING - BACKUP COMPARISON TOOL")
    print("=" * 90)
    
    # Load both backups
    backup1 = load_json_safe(backup1_path)
    backup2 = load_json_safe(backup2_path)
    
    if not backup1:
        print(f"\n❌ Could not load backup 1: {backup1_path}")
        return
    
    if not backup2:
        print(f"\n❌ Could not load backup 2: {backup2_path}")
        return
    
    print(f"\n📊 BACKUP 1 (Older): {backup1.get('exportedAt', 'Unknown')}")
    print(f"📊 BACKUP 2 (Newer): {backup2.get('exportedAt', 'Unknown')}")
    
    # Extract collections
    cols1 = backup1.get('collections', {})
    cols2 = backup2.get('collections', {})
    
    print("\n" + "=" * 90)
    print("COLLECTION COMPARISON")
    print("=" * 90)
    
    all_collections = set(cols1.keys()) | set(cols2.keys())
    for col in sorted(all_collections):
        count1 = len(cols1.get(col, []))
        count2 = len(cols2.get(col, []))
        change = count2 - count1
        symbol = "📈" if change > 0 else "📉" if change < 0 else "➡️"
        print(f"  {col:20s} | Backup1: {count1:4d} | Backup2: {count2:4d} | Change: {symbol} {change:+d}")
    
    # Analyze transactions in detail
    print("\n" + "=" * 90)
    print("BANK TRANSACTIONS ANALYSIS")
    print("=" * 90)
    
    txns1 = {t.get('_id'): t for t in cols1.get('transactions', [])}
    txns2 = {t.get('_id'): t for t in cols2.get('transactions', [])}
    
    # Filter bank transactions
    bank_txns1 = {k: v for k, v in txns1.items() if v.get('txnType') == 'BK'}
    bank_txns2 = {k: v for k, v in txns2.items() if v.get('txnType') == 'BK'}
    
    print(f"\n  Bank Transactions (BK)")
    print(f"    Backup1: {len(bank_txns1)}")
    print(f"    Backup2: {len(bank_txns2)}")
    print(f"    Change: {len(bank_txns2) - len(bank_txns1):+d}")
    
    # Find new bank transactions
    new_bank_ids = set(bank_txns2.keys()) - set(bank_txns1.keys())
    removed_bank_ids = set(bank_txns1.keys()) - set(bank_txns2.keys())
    common_bank_ids = set(bank_txns1.keys()) & set(bank_txns2.keys())
    
    print(f"\n    NEW bank transactions: {len(new_bank_ids)}")
    print(f"    REMOVED bank transactions: {len(removed_bank_ids)}")
    print(f"    MODIFIED bank transactions: {sum(1 for id in common_bank_ids if json.dumps(bank_txns1[id], sort_keys=True) != json.dumps(bank_txns2[id], sort_keys=True))}")
    
    # Show recent new bank transactions
    if new_bank_ids:
        print(f"\n  📌 NEW BANK TRANSACTIONS (last 10):")
        new_bank_list = sorted(
            [(id, bank_txns2[id]) for id in list(new_bank_ids)[:10]],
            key=lambda x: x[1].get('date', ''),
            reverse=True
        )
        for idx, (bid, txn) in enumerate(new_bank_list, 1):
            amount = txn.get('import_amount', 0)
            symbol = "💰" if amount > 0 else "💸"
            print(f"    {idx}. {txn.get('date', 'N/A')} | {symbol} {amount/100:,.2f} AED | {txn.get('description', txn.get('import_narration', 'N/A'))[:50]}")
            print(f"       Ref: {txn.get('ref', 'N/A')[:70]}")
    
    if removed_bank_ids:
        print(f"\n  ❌ REMOVED BANK TRANSACTIONS (last 10):")
        removed_bank_list = sorted(
            [(id, bank_txns1[id]) for id in list(removed_bank_ids)[:10]],
            key=lambda x: x[1].get('date', ''),
            reverse=True
        )
        for idx, (bid, txn) in enumerate(removed_bank_list, 1):
            amount = txn.get('import_amount', 0)
            symbol = "💰" if amount > 0 else "💸"
            print(f"    {idx}. {txn.get('date', 'N/A')} | {symbol} {amount/100:,.2f} AED | {txn.get('description', txn.get('import_narration', 'N/A'))[:50]}")
    
    # Bank transaction amounts by type
    print(f"\n  💼 BANK TRANSACTION AMOUNTS BY TYPE:")
    
    type_amounts1 = defaultdict(int)
    type_amounts2 = defaultdict(int)
    
    for txn in bank_txns1.values():
        key = txn.get('description', txn.get('import_narration', 'Other'))[:30]
        type_amounts1[key] += txn.get('import_amount', 0)
    
    for txn in bank_txns2.values():
        key = txn.get('description', txn.get('import_narration', 'Other'))[:30]
        type_amounts2[key] += txn.get('import_amount', 0)
    
    all_types = set(type_amounts1.keys()) | set(type_amounts2.keys())
    for ttype in sorted(all_types):
        amt1 = type_amounts1.get(ttype, 0)
        amt2 = type_amounts2.get(ttype, 0)
        print(f"    {ttype:30s} | B1: {amt1/100:>12,.2f} | B2: {amt2/100:>12,.2f} | Δ: {(amt2-amt1)/100:>12,.2f}")
    
    # Analyze all transaction types
    print(f"\n" + "=" * 90)
    print("ALL TRANSACTION TYPES ANALYSIS")
    print("=" * 90)
    
    txn_types1 = defaultdict(int)
    txn_types2 = defaultdict(int)
    
    for txn in txns1.values():
        txn_types1[txn.get('txnType', 'Unknown')] += 1
    
    for txn in txns2.values():
        txn_types2[txn.get('txnType', 'Unknown')] += 1
    
    all_txn_types = sorted(set(txn_types1.keys()) | set(txn_types2.keys()))
    
    print("\n  Transaction Type Distribution:")
    print(f"  {'Type':<6} | {'Description':<30} | {'Backup1':>8} | {'Backup2':>8} | {'Change':>8}")
    print(f"  {'-'*75}")
    
    txn_type_labels = {
        'SR': 'Sale Receipt',
        'PV': 'Payment Voucher',
        'BP': 'Broker Payment',
        'BT': 'Bank Transfer',
        'BK': 'Bank Import',
        'JV': 'Journal Voucher',
        'CI': 'Capital Injection',
        'OD': 'Owner Drawing'
    }
    
    for ttype in all_txn_types:
        c1 = txn_types1.get(ttype, 0)
        c2 = txn_types2.get(ttype, 0)
        label = txn_type_labels.get(ttype, ttype)
        change = c2 - c1
        symbol = "📈" if change > 0 else "📉" if change < 0 else "➡️"
        print(f"  {ttype:<6} | {label:<30} | {c1:>8} | {c2:>8} | {symbol} {change:>6}")
    
    # Generate comparison report file
    print("\n" + "=" * 90)
    print("GENERATING DETAILED REPORT...")
    print("=" * 90)
    
    report_file = r'c:\Users\hp\Documents\GitHub\nasama-accounting\backup-comparison-report.txt'
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write("NASAMA ACCOUNTING - DETAILED BACKUP COMPARISON REPORT\n")
        f.write("=" * 90 + "\n\n")
        
        f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write(f"BACKUP 1: {backup1.get('exportedAt', 'Unknown')}\n")
        f.write(f"BACKUP 2: {backup2.get('exportedAt', 'Unknown')}\n\n")
        
        f.write("COLLECTION TOTALS\n")
        f.write("-" * 90 + "\n")
        for col in sorted(all_collections):
            c1 = len(cols1.get(col, []))
            c2 = len(cols2.get(col, []))
            f.write(f"{col:20s}: {c1:6d} → {c2:6d} (change: {c2-c1:+d})\n")
        
        f.write(f"\nBANK TRANSACTIONS (BK TYPE)\n")
        f.write("-" * 90 + "\n")
        f.write(f"Total Bank Txns B1: {len(bank_txns1)}\n")
        f.write(f"Total Bank Txns B2: {len(bank_txns2)}\n")
        f.write(f"NEW: {len(new_bank_ids)}\n")
        f.write(f"REMOVED: {len(removed_bank_ids)}\n")
        f.write(f"MODIFIED: {sum(1 for id in common_bank_ids if json.dumps(bank_txns1[id], sort_keys=True) != json.dumps(bank_txns2[id], sort_keys=True))}\n\n")
        
        if new_bank_ids:
            f.write("NEW BANK TRANSACTIONS\n")
            f.write("-" * 90 + "\n")
            for bid in sorted(new_bank_ids):
                txn = bank_txns2[bid]
                f.write(f"ID: {bid}\n")
                f.write(f"  Date: {txn.get('date', 'N/A')}\n")
                f.write(f"  Description: {txn.get('description', txn.get('import_narration', 'N/A'))}\n")
                f.write(f"  Amount: {txn.get('import_amount', 0)/100:,.2f} AED\n")
                f.write(f"  Ref: {txn.get('ref', 'N/A')}\n\n")
    
    print(f"✅ Report saved: {report_file}\n")
    
    return {
        'backup1': backup1,
        'backup2': backup2,
        'new_bank_count': len(new_bank_ids),
        'removed_bank_count': len(removed_bank_ids),
        'new_bank_ids': new_bank_ids,
        'removed_bank_ids': removed_bank_ids
    }

# Main execution
if __name__ == "__main__":
    # Check if we have a second backup to compare
    backup_path = r'c:\Users\hp\Documents\Nasama-Accounting\nasama-backup-2026-05-25.json'
    
    # Look for other backup files
    backup_dir = r'c:\Users\hp\Documents\Nasama-Accounting'
    backup_files = [f for f in os.listdir(backup_dir) if f.startswith('nasama-backup-') and f.endswith('.json')]
    
    print(f"\n📁 Found {len(backup_files)} backup files in {backup_dir}\n")
    if backup_files:
        for bf in sorted(backup_files, reverse=True):
            print(f"  • {bf}")
    
    if len(backup_files) >= 2:
        # Compare the two most recent backups
        backup_files_sorted = sorted(backup_files, reverse=True)
        print(f"\n\nComparing recent backups...")
        print(f"Newer: {backup_files_sorted[0]}")
        print(f"Older: {backup_files_sorted[1]}\n")
        
        path1 = os.path.join(backup_dir, backup_files_sorted[1])  # Older
        path2 = os.path.join(backup_dir, backup_files_sorted[0])  # Newer
        
        compare_backups(path1, path2)
    else:
        print(f"\n⚠️ Need at least 2 backup files to compare.")
        print(f"\nInstructions:")
        print(f"1. Open your Nasama Accounting app")
        print(f"2. Go to Settings → Database Backup")
        print(f"3. Click 'Download Backup'")
        print(f"4. Save it to: {backup_dir}")
        print(f"5. Run this script again")
