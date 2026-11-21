"""Rehearse the additive website management upgrade against a complete SQL export."""
import argparse
import json
import sqlite3
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
args.output.mkdir(parents=True, exist_ok=False)
source = args.input.read_text()
db = sqlite3.connect(args.output / 'upgraded.sqlite')
db.executescript(source)
tables = [row[0] for row in db.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")]
columns = {table: [row[1] for row in db.execute(f'PRAGMA table_info("{table}")')] for table in tables}


def snapshot(connection):
    result = {}
    for table in tables:
        names = ','.join('"' + name + '"' for name in columns[table])
        # Compare all original values, including timestamps and opaque credential ciphertext.
        result[table] = sorted(connection.execute(f'SELECT {names} FROM "{table}"').fetchall(), key=repr)
    return result


before = snapshot(db)
missing_newness = 'new_site_override' not in columns['websites']
if missing_newness:
    db.executescript((root / 'schema-migration-v1.16.0.sql').read_text())
for _ in range(2):
    db.executescript((root / 'schema-migration-v1.27.0.sql').read_text())
assert snapshot(db) == before, 'Existing data changed during the additive upgrade'
assert db.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
assert db.execute('PRAGMA foreign_key_check').fetchall() == []
expected = sqlite3.connect(':memory:')
expected.executescript((root / 'schema.sql').read_text())
default_differences = []
for table, in expected.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
    structure = lambda connection: sorted(((row[1],row[2],row[3],row[5]) for row in connection.execute(f'PRAGMA table_info("{table}")')), key=repr)
    assert structure(db) == structure(expected), f'Schema mismatch: {table}'
    actual_defaults = {row[1]:row[4] for row in db.execute(f'PRAGMA table_info("{table}")')}
    for row in expected.execute(f'PRAGMA table_info("{table}")'):
        if actual_defaults[row[1]] != row[4]:
            default_differences.append({'table':table,'column':row[1],'production':actual_defaults[row[1]],'fresh':row[4]})
restored = sqlite3.connect(args.output / 'restored.sqlite')
restored.executescript(source)
assert snapshot(restored) == before
assert restored.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
assert restored.execute('PRAGMA foreign_key_check').fetchall() == []
report = {
    'source': str(args.input), 'existing_counts': {table: len(rows) for table, rows in before.items()},
    'applied_missing_v1_16_column': missing_newness, 'v1_27_runs': 2,
    'all_existing_values_preserved': True, 'column_contract_matches': True,
    'historical_default_differences': default_differences,
    'integrity': 'ok', 'foreign_keys': 'ok', 'full_sql_recovery': 'ok'
}
(args.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False))
