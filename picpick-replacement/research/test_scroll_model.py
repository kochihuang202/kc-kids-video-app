"""Checks of recovered search behavior, not a substitute for running original PicPick."""
import unittest
import numpy as np
from scroll_model import find_offset


class RecoveredScrollTests(unittest.TestCase):
    def setUp(self):
        self.source = np.random.default_rng(74).integers(0, 256, (1200, 240, 3), dtype=np.uint8)
        self.first = self.source[:720].copy()
        self.next = self.source[100:820].copy()

    def test_unchanged_page_returns_zero(self):
        match = find_offset(self.first, self.first.copy())
        self.assertEqual((match.offset, match.path), (0, "unchanged"))

    def test_measured_displacement_from_exact_strip(self):
        match = find_offset(self.first, self.next)
        self.assertEqual((match.offset, match.path), (100, "exact-strip"))

    def test_autoplay_outside_strip_does_not_change_displacement(self):
        self.next[130:320, :150] = 0
        match = find_offset(self.first, self.next)
        self.assertEqual((match.offset, match.path), (100, "exact-strip"))

    def test_changed_strip_uses_brightness_fallback(self):
        self.next[520:570, 60:180] = 0
        match = find_offset(self.first, self.next)
        self.assertEqual((match.offset, match.path), (100, "brightness-fallback"))
        self.assertGreater(match.similarity, .8)

    def test_search_boundary_includes_300(self):
        match = find_offset(self.first, self.source[300:1020])
        self.assertEqual((match.offset, match.path), (300, "exact-strip"))

    def test_explicitly_rejects_unverified_small_viewports(self):
        with self.assertRaises(ValueError):
            find_offset(self.first[:300], self.next[:300])


if __name__ == "__main__":
    unittest.main()
