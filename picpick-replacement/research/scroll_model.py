"""Bounded reconstruction of PicPick 7.4.1's first-step image matching.

Derived from 0x01566b6c, 0x01567c88, 0x009e047c and 0x009e0788.
This is an analysis model, not execution of PicPick and not a production engine.
Use viewport heights >= 600 for the recovered fallback search coordinates.
"""
from dataclasses import dataclass
import numpy as np


@dataclass(frozen=True)
class Match:
    offset: int
    path: str
    similarity: float


def find_offset(previous, current, weights=(21, 71, 8)):
    """RGB uint8 arrays. Weights were read from the original process's settings."""
    a, b = np.asarray(previous), np.asarray(current)
    if a.shape != b.shape or a.ndim != 3 or a.shape[2] != 3:
        raise ValueError("Expected equally sized RGB viewport arrays")
    height, width = a.shape[:2]
    if width <= 100 or height < 600:
        raise ValueError("This verification model covers widths > 100 and heights >= 600")
    if np.array_equal(a, b):
        return Match(0, "unchanged", 1.0)
    reference = a[height-100:height-50, 50:width-50]
    for offset in range(301):
        if np.array_equal(reference, b[height-100-offset:height-50-offset, 50:width-50]):
            return Match(offset, "exact-strip", 1.0)
    # Default CompareWith mode: integer weighted brightness and normalized absolute difference.
    a = (a.astype(np.int32) * weights).sum(axis=2) // 100
    b = (b.astype(np.int32) * weights).sum(axis=2) // 100
    height_half = height // 2
    reference = a[height_half:height_half*2, 50:width-50]
    best = Match(0, "brightness-fallback", 0.0)
    for offset in range(301):
        candidate = b[height_half-offset:height_half*2-offset, 50:width-50]
        similarity = 1.0 - float(np.abs(reference-candidate).mean()) / 255.0
        if similarity > best.similarity:
            best = Match(offset, "brightness-fallback", similarity)
        if similarity == 1.0:
            break
    return best


def replay(accumulated_path, current_path):
    from PIL import Image
    with Image.open(accumulated_path) as accumulated, Image.open(current_path) as current:
        previous = accumulated.crop((0, accumulated.height-current.height, current.width, accumulated.height)).convert("RGB")
        return find_offset(previous, current.convert("RGB"))


if __name__ == "__main__":
    import argparse, json
    from dataclasses import asdict
    parser = argparse.ArgumentParser(description="Local-only replay of recovered PicPick image matching")
    parser.add_argument("accumulated_png")
    parser.add_argument("unaligned_frame_png")
    args = parser.parse_args()
    print(json.dumps(asdict(replay(args.accumulated_png, args.unaligned_frame_png)), indent=2))
