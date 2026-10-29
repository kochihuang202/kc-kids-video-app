"""Read-only FlexNote data feasibility probe. Never writes source or logs note text.

Outputs may contain personal notes: use a PRIVATE output directory outside Git.
This is a relational losslessness experiment, not a FlexNote-compatible importer.
"""
import argparse
import base64
import collections
import hashlib
import json
import pathlib
import sqlite3

TABLES = set('noteCards noteCardInstances whiteBoardList whiteboardInstances connections sections textElements mindMaps mindMapInstances mindMapNodes files fileInstances pdfCards pdfCardInstances highlights highlightInstances videoHighlights videoHighlightInstances mediaCards mediaCardInstances tagList tagGroups cardTagList properties collections collectionViews collectionPropertyRelations objectPropertyRelations quickNotes todos noteHighlights noteHighlightInstances cardRemarks whiteboardContentVersions'.split())


def qi(s):
    return '"' + s.replace('"', '""') + '"'


def pack(v):
    # Every cell is tagged, so a user object cannot collide with a blob marker.
    if isinstance(v, bytes):
        return ['blob', base64.b64encode(v).decode('ascii')]
    return [type(v).__name__, v]


def unpack(v):
    return base64.b64decode(v[1]) if v[0] == 'blob' else v[1]


def canonical(row):
    return json.dumps([pack(v) for v in row], ensure_ascii=False, separators=(',', ':'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', type=pathlib.Path, required=True)
    ap.add_argument('--output', type=pathlib.Path, required=True)
    args = ap.parse_args()
    source = args.source.resolve(strict=True)
    output = args.output.resolve()
    if output == source or source in output.parents:
        raise ValueError('Output must be outside source')
    databases = sorted(source.glob('db_*.sqlite3'))
    if not databases:
        raise ValueError('No workspace databases found; cannot report a passing probe')
    output.mkdir(parents=True, exist_ok=False)
    summary = {'scope': 'allowlisted user-data tables only; no application roundtrip', 'databases': []}
    for ordinal, path in enumerate(databases):
        # Online backup API yields a consistent per-database snapshot, including WAL.
        # This does not establish a cross-database/attachment atomic snapshot.
        live = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
        live.execute('PRAGMA query_only=ON')
        snapshot_path = output / f'snapshot-{ordinal}.sqlite3'
        snapshot = sqlite3.connect(snapshot_path)
        live.backup(snapshot)
        live.close()
        assert snapshot.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        schema = snapshot.execute("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
        result = {'ordinal': ordinal, 'source_bytes': path.stat().st_size, 'snapshot_sha256': hashlib.sha256(snapshot_path.read_bytes()).hexdigest(), 'schema': {}, 'tables': {}, 'rows': 0}
        restored = sqlite3.connect(output / f'restored-{ordinal}.sqlite3')
        for name, ddl in schema:
            if ddl and 'CREATE VIRTUAL TABLE' in ddl.upper():
                result['schema'][name] = 'virtual table excluded; extension not loaded'
                continue
            columns = snapshot.execute(f'PRAGMA table_info({qi(name)})').fetchall()
            result['schema'][name] = [c[1:3] for c in columns]
            if name not in TABLES:
                continue
            rows = snapshot.execute(f'SELECT * FROM {qi(name)}').fetchall()
            encoded = {'table': name, 'ddl': ddl, 'columns': [c[1] for c in columns], 'rows': [[pack(v) for v in row] for row in rows]}
            dest = output / f'{ordinal}-{name}.json'
            dest.write_text(json.dumps(encoded, ensure_ascii=False, indent=2), encoding='utf-8')
            decoded = json.loads(dest.read_text(encoding='utf-8'))
            restored.execute(ddl)
            if rows:
                restored.executemany(f'INSERT INTO {qi(name)} VALUES ({",".join("?" for _ in columns)})', [[unpack(v) for v in row] for row in decoded['rows']])
            actual = restored.execute(f'SELECT * FROM {qi(name)}').fetchall()
            assert collections.Counter(map(canonical, rows)) == collections.Counter(map(canonical, actual)), name
            result['tables'][name] = {'rows': len(rows), 'roundtrip': 'pass'}
            result['rows'] += len(rows)
        restored.commit()
        assert restored.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        restored.close()
        snapshot.close()
        summary['databases'].append(result)
    (output / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'databases': len(summary['databases']), 'tables': sum(len(d['tables']) for d in summary['databases']), 'rows': sum(d['rows'] for d in summary['databases']), 'roundtrip': 'pass', 'summary': str(output / 'summary.json')}))


if __name__ == '__main__':
    main()
