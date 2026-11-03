"""Real-FFmpeg batch tests; no UI or live Mac required."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "standardize_mp3.py"
spec = importlib.util.spec_from_file_location("standardize_mp3", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
FFMPEG = os.environ.get("TEST_FFMPEG")


@unittest.skipUnless(FFMPEG, "Set TEST_FFMPEG to the installed FFmpeg executable")
class BatchTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "來源"
        self.source.mkdir()
        self.output = self.root / "輸出"

    def tearDown(self):
        self.temporary.cleanup()

    def make_audio(self, path, container="mp3", frequency=440):
        subprocess.run([FFMPEG, "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                        f"sine=frequency={frequency}:duration=0.7", "-c:a", "libmp3lame",
                        "-f", container, "-y", str(path)], check=True,
                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)

    def run_batch(self):
        return module.Converter(self.source, self.output, FFMPEG, 2).run(lambda event: None)

    def test_nested_normal_and_mislabeled_mp4_become_valid_mp3_without_source_changes(self):
        nested = self.source / "子資料夾"
        nested.mkdir()
        normal, hybrid = nested / "正常.mp3", nested / "錯誤封裝.mp3"
        self.make_audio(normal)
        self.make_audio(hybrid, "mp4")
        hybrid.write_bytes(b"ID3\x03\x00\x00\x00\x00\x00\x00" + hybrid.read_bytes())
        before = {p.name: module.sha256(p) for p in (normal, hybrid)}
        self.assertFalse(module.is_mp3(hybrid))
        self.assertEqual(self.run_batch()["ok"], 2)
        converter = module.Converter(self.source, self.output, FFMPEG)
        for source in (normal, hybrid):
            converter.validate(self.output / source.relative_to(self.source))
            self.assertEqual(module.sha256(source), before[source.name])

    def test_failed_input_never_produces_a_final_file(self):
        (self.source / "破損.mp3").write_bytes(b"This is not audio")
        result = self.run_batch()
        self.assertEqual(result["failed"], 1)
        self.assertFalse((self.output / "破損.mp3").exists())

    def test_resume_verifies_output_and_reprocesses_changed_source(self):
        source = self.source / "一集.mp3"
        self.make_audio(source)
        self.assertEqual(self.run_batch()["ok"], 1)
        self.assertEqual(self.run_batch()["reused"], 1)
        (self.output / source.name).write_bytes(b"bad output")
        self.assertEqual(self.run_batch()["reused"], 0)
        self.make_audio(source, frequency=880)
        self.assertEqual(self.run_batch()["reused"], 0)

    def test_source_and_output_must_not_overlap(self):
        with self.assertRaises(ValueError):
            module.Converter(self.source, self.source / "output", FFMPEG)

    def test_cli_progress_survives_a_non_chinese_windows_console(self):
        self.make_audio(self.source / "中文標題.mp3")
        environment = dict(os.environ, PYTHONIOENCODING="cp1252")
        result = subprocess.run([sys.executable, str(SCRIPT), "--source", str(self.source),
                                 "--output", str(self.output), "--ffmpeg", FFMPEG],
                                env=environment, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", errors="replace"))
        self.assertIn("中文標題.mp3", result.stdout.decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
