import json
from pathlib import Path
import re
import tempfile
import unittest

from section_illustrations import apply_section_illustrations, plain_text, SITE


class IllustrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.manifest = Path(self.temp.name) / "illustrations.json"
        self.sections = json.loads(Path(__file__).with_name("illustrations.json").read_text(encoding="utf-8"))["sections"]

    def save_manifest(self):
        self.manifest.write_text(json.dumps({"sections": self.sections}), encoding="utf-8")

    def test_adds_all_missing_artwork_without_changing_story_or_original_art(self):
        for item in self.sections:
            if not item["image"]:
                item["image"] = f'../images/ep{item["episode"]}_{item["section"]}.jpg'
        self.save_manifest()
        for episode in ["001", "002"]:
            original = (SITE / "episodes" / f"{episode}.html").read_text(encoding="utf-8")
            updated = apply_section_illustrations(episode, original, self.manifest)
            self.assertEqual(len(re.findall(r"<img\b", updated)), 7)
            stripped = re.sub(r'<figure class="story-picture" data-section-illustration="\d+">.*?</figure>', '', updated, flags=re.S)
            original_without_managed = re.sub(r'<figure class="story-picture" data-section-illustration="\d+">.*?</figure>', '', original, flags=re.S)
            self.assertEqual(re.sub(r"\s+", "", stripped), re.sub(r"\s+", "", original_without_managed))
            self.assertEqual(apply_section_illustrations(episode, updated, self.manifest), updated)

    def test_unchanged_episodes_are_preserved(self):
        self.save_manifest()
        original = (SITE / "episodes" / "003.html").read_text(encoding="utf-8")
        self.assertEqual(apply_section_illustrations(3, original, self.manifest), original)

    def test_heading_drift_is_rejected(self):
        self.sections[6]["heading"] = "wrong section"
        self.save_manifest()
        original = (SITE / "episodes" / "001.html").read_text(encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "heading changed"):
            apply_section_illustrations(1, original, self.manifest)


if __name__ == "__main__":
    unittest.main()
