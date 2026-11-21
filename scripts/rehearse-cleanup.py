"""Archive retired values and rehearse v1.25/v1.26 against a SQL export, without remote access."""
import argparse, json, os, sqlite3
from pathlib import Path
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
os.umask(0o077)
connection = sqlite3.connect(args.output / 'upgraded.sqlite')
connection.row_factory = sqlite3.Row
connection.executescript(args.input.read_text())
connection.execute('PRAGMA foreign_keys=ON')
rows = lambda sql: [dict(row) for row in connection.execute(sql)]
tables = lambda: [row['name'] for row in rows("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")]
counts = lambda: {name: rows(f'SELECT COUNT(*) AS n FROM "{name}"')[0]['n'] for name in tables()}
before = counts()
archive = {
    'websites': rows('SELECT id,industry,wp_calculator_count,wp_article_count,operating_scenario,scenario_note FROM websites'),
    'domains': rows('SELECT id,website_id,computer_name,domain_role,is_primary FROM domains'),
    'adsense_income': rows('SELECT id,amount,amount_usd FROM adsense_income'),
    'website_batch_reviews': rows('SELECT id,scenario_counts,content_totals FROM website_batch_reviews'),
    'website_monitors': rows('SELECT website_id,required_text,forbidden_text,baseline_title,status,reason FROM website_monitors'),
    'website_monitor_checks': rows('SELECT * FROM website_monitor_checks WHERE outcome NOT IN (\'healthy\',\'failure\')'),
    'check_content_flags': rows('SELECT id,content_complete FROM website_monitor_checks'),
    'provider_resources': rows("SELECT * FROM provider_resources WHERE identifier='account:'||account_id AND resource_url IS NULL AND ip_address IS NULL"),
    'website_resources': rows("SELECT wr.* FROM website_resources wr JOIN provider_resources r ON r.id=wr.resource_id WHERE r.identifier='account:'||r.account_id AND r.resource_url IS NULL AND r.ip_address IS NULL"),
    'alertcfg': rows('SELECT * FROM alertcfg') if 'alertcfg' in before else []
}
(args.output / 'retired-values.json').write_text(json.dumps(archive, ensure_ascii=False, indent=2))
root = Path(__file__).resolve().parent.parent
for version in ['1.25.0', '1.26.0']:
    connection.executescript((root / f'schema-migration-v{version}.sql').read_text())
foreign_keys = rows('PRAGMA foreign_key_check')
integrity = rows('PRAGMA integrity_check')
after = counts()
expected = dict(before)
expected.pop('alertcfg', None)
expected['website_resources'] -= len(archive['website_resources'])
expected['provider_resources'] -= len(archive['provider_resources'])
expected['website_monitor_checks'] -= len(archive['website_monitor_checks'])
expected['website_accounts'] = len({(link['website_id'], resource['account_id']) for link in archive['website_resources'] for resource in archive['provider_resources'] if link['resource_id'] == resource['id']})
assert after == expected, (before, after, expected)
assert foreign_keys == [], foreign_keys
assert integrity == [{'integrity_check': 'ok'}], integrity
assert rows("SELECT name FROM sqlite_schema WHERE name LIKE 'trg_counts_%'") == []
report = {'source': str(args.input.resolve()), 'before': before, 'after': after, 'archived_legacy_checks': len(archive['website_monitor_checks']), 'archived_resources': len(archive['provider_resources']), 'archived_resource_links': len(archive['website_resources']), 'foreign_key_check': foreign_keys, 'integrity_check': 'ok'}
(args.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
connection.close()
print(json.dumps({key: report[key] for key in ['archived_legacy_checks','archived_resources','archived_resource_links','integrity_check']}, ensure_ascii=False))
