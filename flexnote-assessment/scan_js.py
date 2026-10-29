"""Bounded, inert text locations for minified JavaScript evidence. No evaluation."""
import argparse
import hashlib
import json
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

ap = argparse.ArgumentParser()
ap.add_argument('file', type=pathlib.Path)
ap.add_argument('patterns', nargs='+')
ap.add_argument('--context', type=int, default=160)
ap.add_argument('--limit', type=int, default=4)
args = ap.parse_args()
data = args.file.read_bytes()
text = data.decode('utf-8')
print(json.dumps({'file': str(args.file), 'sha256': hashlib.sha256(data).hexdigest(), 'offset_unit': 'Python Unicode code points'}))
for pattern in args.patterns:
    hits = list(re.finditer(pattern, text))
    print(json.dumps({'pattern': pattern, 'matches': len(hits), 'locations': [{'offset': m.start(), 'snippet': text[max(0,m.start()-args.context):m.end()+args.context]} for m in hits[:args.limit]]}, ensure_ascii=False))
