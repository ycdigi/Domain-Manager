"""Verify the additive prompt-library migration and full restore using a local SQL export."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
os.umask(0o077)
root = Path(__file__).resolve().parent.parent
args.output.mkdir(parents=True, exist_ok=False)
source = args.input.read_text()
db = sqlite3.connect(args.output / 'upgraded.sqlite')
db.executescript(source)
tables = [name for name, in db.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")]

def snapshot(connection):
    return {table: sorted(connection.execute(f'SELECT * FROM "{table}"').fetchall(), key=repr) for table in tables}

before = snapshot(db)
migration = (root / 'schema-migration-v1.31.0.sql').read_text()
for _ in range(2):
    db.executescript(migration)
    assert snapshot(db) == before, 'Migration changed existing data'
assert db.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
assert db.execute('PRAGMA foreign_key_check').fetchall() == []
fresh = sqlite3.connect(':memory:')
fresh.executescript((root / 'schema.sql').read_text())
for table in ['prompt_categories', 'prompts']:
    assert db.execute(f'PRAGMA table_info({table})').fetchall() == fresh.execute(f'PRAGMA table_info({table})').fetchall(), table
    assert db.execute(f'PRAGMA foreign_key_list({table})').fetchall() == fresh.execute(f'PRAGMA foreign_key_list({table})').fetchall(), table
    assert db.execute(f'PRAGMA index_list({table})').fetchall() == fresh.execute(f'PRAGMA index_list({table})').fetchall(), table
restored = sqlite3.connect(args.output / 'restored.sqlite')
restored.executescript(source)
assert snapshot(restored) == before
assert restored.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
assert restored.execute('PRAGMA foreign_key_check').fetchall() == []
report = {
    'source_sha256': hashlib.sha256(args.input.read_bytes()).hexdigest(),
    'existing_counts': {table: len(rows) for table, rows in before.items()},
    'migration_runs': 2, 'all_existing_values_preserved': True,
    'new_table_contract_matches': True, 'integrity': 'ok', 'foreign_keys': 'ok', 'full_sql_restore': 'ok'
}
(args.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False))
