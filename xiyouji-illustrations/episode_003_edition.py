"""Carry reviewed story and glossary editions through normal recompiles."""
from pathlib import Path
import re


def apply_episode_003_edition(episode_number, markup):
    if episode_number not in {3, 4}:
        return markup
    edition = Path(__file__).with_name(f"episode_{episode_number:03d}_reviewed.html").read_text(encoding="utf-8")
    for pattern in (
        r"<h2\b.*?(?=<!-- 章節底部翻頁列 -->|<footer\b)",
        r"window\.GLOSSARY_DATA\s*=\s*\{[^\n]*\};",
    ):
        block = re.search(pattern, edition, re.S)
        if block is None:
            raise ValueError("Reviewed episode 003 is missing a required block")
        markup, count = re.subn(pattern, lambda _: block.group(), markup, count=1, flags=re.S)
        if count != 1:
            raise ValueError("Episode 003 build template changed")
    return markup
