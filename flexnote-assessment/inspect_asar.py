"""Read an Electron ASAR without executing application code.

Write inventory or exact selected files to a PRIVATE analysis directory.
Never distribute extracted proprietary application code with this repository.
"""
import argparse
import hashlib
import json
import pathlib
import struct


def inventory(path):
    with path.open('rb') as f:
        raw = f.read(16)
        if len(raw) != 16:
            raise ValueError('Truncated ASAR header')
        size, header_size, payload_size, string_size = struct.unpack('<4I', raw)
        if size != 4 or string_size > header_size - 8 or header_size > path.stat().st_size:
            raise ValueError('Invalid ASAR header sizes')
        header = json.loads(f.read(string_size))
    entries = []

    def walk(node, prefix=''):
        for name, entry in node.get('files', {}).items():
            logical = prefix + name
            if 'files' in entry:
                walk(entry, logical + '/')
            else:
                entries.append({'path': logical, **entry})
    walk(header)
    return 8 + header_size, entries


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('asar', type=pathlib.Path)
    ap.add_argument('output', type=pathlib.Path)
    ap.add_argument('--select', action='append', default=[])
    args = ap.parse_args()
    path = args.asar.resolve(strict=True)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    base, entries = inventory(path)
    root_hash = hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()
    (output/'inventory.json').write_text(json.dumps({'asar_sha256': root_hash, 'data_offset': base, 'entries': entries}, indent=2), encoding='utf-8')
    lookup = {e['path']: e for e in entries}
    receipts = []
    with path.open('rb') as f:
        for logical in args.select:
            e = lookup[logical]
            dest = (output/logical).resolve()
            if output not in dest.parents or 'link' in e:
                raise ValueError('Unsafe or linked member')
            if e.get('unpacked'):
                data = (path.parent/(path.name+'.unpacked')/logical).read_bytes()
                offset = None
            else:
                offset = base + int(e['offset'])
                f.seek(offset)
                data = f.read(e['size'])
            if len(data) != e['size']:
                raise ValueError('Truncated member')
            digest = hashlib.sha256(data).hexdigest()
            integrity = e.get('integrity')
            if integrity and integrity.get('algorithm') == 'SHA256' and digest != integrity['hash']:
                raise ValueError('Member integrity mismatch')
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists() and dest.read_bytes() != data:
                raise ValueError('Refusing to replace different extracted bytes')
            dest.write_bytes(data)
            receipts.append({'path': logical, 'offset': offset, 'bytes': len(data), 'sha256': digest})
    (output/'selection-receipt.json').write_text(json.dumps({'asar_sha256': root_hash, 'files': receipts}, indent=2), encoding='utf-8')
    print(json.dumps({'asar_sha256': root_hash, 'members': len(entries), 'selected': receipts}))


if __name__ == '__main__':
    main()
