#!/usr/bin/env python3
"""
convert.py — TBC Training System v3.0
Excel/CSV → JSON Question Bank Converter

Usage:
    python convert.py input.xlsx
    python convert.py input.csv
    python convert.py input.xlsx --output-dir ./data
    python convert.py input.csv --quotes-sheet "Quotes"

Output files (in --output-dir, default: ./data):
    bankA.json, bankB.json, bankC.json, bankD.json

Column mapping (Excel/CSV columns A–L):
    A  = book
    B  = chapter     (numeric)
    C  = verse       (numeric)
    D  = question
    E  = optionA
    F  = optionB
    G  = optionC
    H  = optionD
    I  = correctAnswer   (A/B/C/D only)
    J  = explanation
    K  = round
    L  = bank            (A/B/C/D only)

For quotes.json, use a separate sheet/file with columns:
    book | chapter | verse | text
"""

import sys
import os
import json
import argparse
from collections import defaultdict

REQUIRED_FIELDS = [
    'book', 'chapter', 'verse', 'question',
    'optionA', 'optionB', 'optionC', 'optionD',
    'correctAnswer', 'explanation', 'round', 'bank'
]

COLUMN_MAP = {
    0: 'book',
    1: 'chapter',
    2: 'verse',
    3: 'question',
    4: 'optionA',
    5: 'optionB',
    6: 'optionC',
    7: 'optionD',
    8: 'correctAnswer',
    9: 'explanation',
    10: 'round',
    11: 'bank',
}

VALID_BANKS = {'A', 'B', 'C', 'D'}
VALID_ANSWERS = {'A', 'B', 'C', 'D'}

BANK_INFO = {
    'A': 'Study Mode',
    'B': 'Timed Mode',
    'C': 'Mock Mode',
    'D': 'Round 5A (max 5 questions)',
}


def log(msg): print(msg)
def warn(msg): print(f"  ⚠  {msg}")
def error(msg): print(f"  ✗  {msg}")
def ok(msg): print(f"  ✓  {msg}")


def load_xlsx(filepath):
    """Load rows from an Excel file using openpyxl."""
    try:
        import openpyxl
    except ImportError:
        print("ERROR: openpyxl not installed. Run: pip install openpyxl")
        sys.exit(1)

    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            # Check if first row looks like a header
            first_cell = str(row[0]).strip().lower() if row[0] else ''
            if first_cell in ('book', 'a', 'column a'):
                log(f"    Skipping header row: {row[:4]}")
                continue
        rows.append(row)
    wb.close()
    return rows


def load_csv(filepath):
    """Load rows from a CSV file."""
    import csv
    rows = []
    with open(filepath, newline='', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if i == 0:
                first_cell = row[0].strip().lower() if row else ''
                if first_cell in ('book', 'a', 'column a'):
                    log(f"    Skipping header row: {row[:4]}")
                    continue
            rows.append(row)
    return rows


def map_row_to_dict(raw_row):
    """Map positional row data to field names."""
    record = {}
    for col_idx, field_name in COLUMN_MAP.items():
        val = raw_row[col_idx] if col_idx < len(raw_row) else None
        record[field_name] = str(val).strip() if val is not None else ''
    return record


def validate_record(record, row_num):
    """Validate a single question record. Returns (is_valid, list_of_issues)."""
    issues = []

    # Check all fields present
    for field in REQUIRED_FIELDS:
        val = record.get(field, '').strip()
        if not val:
            issues.append(f"Missing required field: '{field}'")

    # Validate bank
    bank = record.get('bank', '').strip().upper()
    if bank and bank not in VALID_BANKS:
        issues.append(f"Invalid bank value '{bank}' — must be A, B, C, or D")

    # Validate correctAnswer
    ans = record.get('correctAnswer', '').strip().upper()
    if ans and ans not in VALID_ANSWERS:
        issues.append(f"Invalid correctAnswer '{ans}' — must be A, B, C, or D")

    # Normalize case
    record['bank'] = bank
    record['correctAnswer'] = ans

    return len(issues) == 0, issues


def check_bank_d_limit(banks):
    """Warn if Bank D exceeds 5 questions."""
    d_count = len(banks.get('D', []))
    if d_count > 5:
        warn(f"Bank D has {d_count} questions — spec requires exactly 5. Only first 5 will be used.")
        banks['D'] = banks['D'][:5]
    elif d_count < 5:
        warn(f"Bank D has only {d_count} questions — spec requires exactly 5.")


def process_rows(rows):
    """Process all rows and sort into banks. Returns (banks, stats)."""
    banks = defaultdict(list)
    stats = {
        'total': len(rows),
        'skipped': 0,
        'warnings': 0,
        'processed': 0,
        'skip_details': [],
        'duplicate_warnings': [],
    }

    # Track questions for duplicate detection (within each bank)
    seen_questions = defaultdict(set)

    for row_num, raw_row in enumerate(rows, start=2):
        # Skip fully empty rows
        if all(cell is None or str(cell).strip() == '' for cell in raw_row):
            stats['skipped'] += 1
            continue

        # Ensure row has at least 12 columns
        if len(raw_row) < 12:
            stats['skipped'] += 1
            detail = f"Row {row_num}: Only {len(raw_row)} columns (need 12) — skipped"
            stats['skip_details'].append(detail)
            continue

        record = map_row_to_dict(raw_row)
        is_valid, issues = validate_record(record, row_num)

        if not is_valid:
            stats['skipped'] += 1
            for issue in issues:
                detail = f"Row {row_num}: {issue} — skipped"
                stats['skip_details'].append(detail)
            continue

        # Duplicate check within same bank
        bank = record['bank']
        q_text = record['question'].lower().strip()
        if q_text in seen_questions[bank]:
            dup_warn = f"Row {row_num}: Duplicate question in Bank {bank}: \"{record['question'][:60]}...\""
            stats['duplicate_warnings'].append(dup_warn)
            stats['warnings'] += 1
        seen_questions[bank].add(q_text)

        banks[bank].append(record)
        stats['processed'] += 1

    return dict(banks), stats


def write_json(data, filepath):
    """Write list of records to a JSON file."""
    os.makedirs(os.path.dirname(filepath) if os.path.dirname(filepath) else '.', exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def print_summary(banks, stats, output_dir):
    """Print a formatted conversion summary."""
    print()
    print("═" * 52)
    print("  CONVERSION SUMMARY")
    print("═" * 52)
    print(f"  Total rows processed : {stats['total']}")
    print(f"  Successfully imported: {stats['processed']}")
    print(f"  Rows skipped         : {stats['skipped']}")
    print(f"  Warnings issued      : {stats['warnings']}")
    print()
    print("  Bank Breakdown:")
    for bank in ['A', 'B', 'C', 'D']:
        count = len(banks.get(bank, []))
        mode = BANK_INFO.get(bank, '')
        marker = "✓" if count > 0 else "–"
        print(f"    {marker} Bank {bank} ({mode}): {count} questions")
    print()

    if stats['skip_details']:
        print("  SKIPPED ROWS:")
        for detail in stats['skip_details'][:20]:
            error(detail)
        if len(stats['skip_details']) > 20:
            print(f"    ... and {len(stats['skip_details']) - 20} more (check input file)")
        print()

    if stats['duplicate_warnings']:
        print("  DUPLICATE WARNINGS:")
        for dw in stats['duplicate_warnings'][:10]:
            warn(dw)
        if len(stats['duplicate_warnings']) > 10:
            print(f"    ... and {len(stats['duplicate_warnings']) - 10} more")
        print()

    print("  Output files written:")
    for bank in ['A', 'B', 'C', 'D']:
        path = os.path.join(output_dir, f"bank{bank}.json")
        count = len(banks.get(bank, []))
        ok(f"{path}  ({count} questions)")

    print()
    print("═" * 52)
    print("  Done. Open index.html to begin training.")
    print("═" * 52)


def main():
    parser = argparse.ArgumentParser(
        description='TBC Training System — Excel/CSV to JSON converter',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument('input', help='Path to .xlsx or .csv input file')
    parser.add_argument('--output-dir', default='data', help='Output directory for JSON files (default: ./data)')
    args = parser.parse_args()

    input_path = args.input
    output_dir = args.output_dir

    # Validate input file
    if not os.path.exists(input_path):
        print(f"ERROR: File not found: {input_path}")
        sys.exit(1)

    ext = os.path.splitext(input_path)[1].lower()
    if ext not in ('.xlsx', '.csv'):
        print(f"ERROR: Unsupported file type '{ext}'. Use .xlsx or .csv")
        sys.exit(1)

    print()
    print("═" * 52)
    print("  TBC Training System — Question Bank Converter")
    print("  ICGC Bible Challenge 2026 · v3.0")
    print("═" * 52)
    print(f"  Input  : {input_path}")
    print(f"  Output : {output_dir}/")
    print()

    # Load data
    log(f"  Loading {ext[1:].upper()} file...")
    if ext == '.xlsx':
        rows = load_xlsx(input_path)
    else:
        rows = load_csv(input_path)
    log(f"  Found {len(rows)} data rows.")
    print()

    # Process
    log("  Validating and sorting into banks...")
    banks, stats = process_rows(rows)

    # Bank D limit check
    check_bank_d_limit(banks)

    # Write output files
    log(f"  Writing JSON files to '{output_dir}/'...")
    for bank in ['A', 'B', 'C', 'D']:
        questions = banks.get(bank, [])
        filepath = os.path.join(output_dir, f"bank{bank}.json")
        write_json(questions, filepath)

    # Load quotes for embedded bundle
    quotes_path = os.path.join(output_dir, 'quotes.json')
    if os.path.exists(quotes_path):
        with open(quotes_path, encoding='utf-8') as qf:
            quotes_data = json.load(qf)
    else:
        quotes_data = []

    # Generate data_embedded.js for double-click offline use
    log("  Generating data_embedded.js...")
    write_embedded_js(banks, quotes_data, output_dir)

    # Print summary
    print_summary(banks, stats, output_dir)


if __name__ == '__main__':
    main()


def write_embedded_js(banks, quotes_data, output_dir):
    """
    Generate data_embedded.js — bundles all banks + quotes into one JS file
    so index.html works by double-click with no local server needed.
    Placed next to index.html (parent of output_dir).
    """
    a = json.dumps(banks.get('A', []), ensure_ascii=False)
    b = json.dumps(banks.get('B', []), ensure_ascii=False)
    c = json.dumps(banks.get('C', []), ensure_ascii=False)
    d = json.dumps(banks.get('D', []), ensure_ascii=False)
    q = json.dumps(quotes_data,        ensure_ascii=False)

    content = (
        "// AUTO-GENERATED by convert.py — do not edit manually\n"
        "// Re-run: python convert.py your-questions.xlsx\n"
        f"const EMBEDDED_DATA = {{\n"
        f"  bankA: {a},\n"
        f"  bankB: {b},\n"
        f"  bankC: {c},\n"
        f"  bankD: {d},\n"
        f"  quotes: {q}\n"
        "};\n"
    )

    parent = os.path.dirname(os.path.abspath(output_dir))
    embed_path = os.path.join(parent, 'data_embedded.js')
    with open(embed_path, 'w', encoding='utf-8') as f:
        f.write(content)
    ok(f"{embed_path}  (double-click bundle)")
