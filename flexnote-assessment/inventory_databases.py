"""Read-only SQLite metadata inventory. Never prints note content or credentials."""
import argparse
import json
import pathlib
import sqlite3


def inspect(path):
    db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    db.execute('PRAGMA query_only=ON')
    tables = db.execute("SELECT name,sql FROM sqlite_master WHERE type='table'").fetchall()
    result = {'filename': path.name, 'bytes': path.stat().st_size,
              'journal_mode': db.execute('PRAGMA journal_mode').fetchone()[0],
              'tables': [row[0] for row in tables], 'counts': {}}
    known = {row[0] for row in tables}
    for table in ['spaces', 'noteCards', 'noteCardInstances', 'whiteBoardList',
                  'files', 'noteCardContentVersions', 'whiteboardContentVersions']:
        if table in known:
            result['counts'][table] = db.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
    if 'knex_migrations' in known:
        result['migrations'] = [row[0] for row in db.execute('SELECT name FROM knex_migrations ORDER BY id')]
    if path.name == 'main.db':
        # Technical IDs and flags only; intentionally omit workspace names/user details.
        result['spaces'] = [{'id': row[0], 'isTrashed': row[1]} for row in db.execute('SELECT id,isTrashed FROM spaces')]
        result['schema'] = {row[0]: row[1] for row in tables}
    db.close()
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root', type=pathlib.Path)
    ap.add_argument('output', type=pathlib.Path)
    args = ap.parse_args()
    paths = [args.root/'main.db', *sorted(args.root.glob('db_*.sqlite3'))]
    results = [inspect(path) for path in paths]
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps([{'alias': 'catalog' if i == 0 else f'W{i-1}',
                       'bytes': r['bytes'], 'journal': r['journal_mode'],
                       'tables': len(r['tables']), 'counts': r['counts'],
                       'migrations': len(r.get('migrations', []))} for i,r in enumerate(results)]))


if __name__ == '__main__':
    main()
