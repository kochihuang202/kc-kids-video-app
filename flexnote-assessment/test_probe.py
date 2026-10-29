import hashlib
import json
import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import unittest


class ProbeTests(unittest.TestCase):
    def test_real_files_roundtrip_and_source_unchanged(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            source = root / 'source'
            source.mkdir()
            dbpath = source / 'db_fixture.sqlite3'
            db = sqlite3.connect(dbpath)
            db.executescript('CREATE TABLE noteCards(id TEXT PRIMARY KEY, content TEXT, extra BLOB, n INTEGER); CREATE TABLE noteCardInstances(id TEXT PRIMARY KEY, objectId TEXT, whiteboardId TEXT); CREATE TABLE users(secret TEXT);')
            db.execute('INSERT INTO noteCards VALUES(?,?,?,?)', ('卡-1', '{"type":"doc","text":"中文🧠\\n表格"}', b'\x00\xff', 9223372036854775807))
            db.executemany('INSERT INTO noteCardInstances VALUES(?,?,?)', [('a','卡-1','w1'), ('b','卡-1','w2')])
            db.execute('INSERT INTO users VALUES(?)', ('must-not-export',))
            db.commit()
            db.close()
            before = hashlib.sha256(dbpath.read_bytes()).digest()
            script = pathlib.Path(__file__).with_name('probe_data.py')
            result = subprocess.run([sys.executable, str(script), '--source', str(source), '--output', str(root/'out')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(hashlib.sha256(dbpath.read_bytes()).digest(), before)
            self.assertFalse((root/'out'/'0-users.json').exists())
            restored = sqlite3.connect(root/'out'/'restored-0.sqlite3')
            self.assertEqual(restored.execute('SELECT count(DISTINCT whiteboardId) FROM noteCardInstances WHERE objectId=?', ('卡-1',)).fetchone()[0], 2)
            self.assertEqual(restored.execute('SELECT extra,n FROM noteCards').fetchone(), (b'\x00\xff',9223372036854775807))
            restored.close()
            again = subprocess.run([sys.executable, str(script), '--source', str(source), '--output', str(root/'out')], capture_output=True)
            self.assertNotEqual(again.returncode, 0)


if __name__ == '__main__':
    unittest.main()
