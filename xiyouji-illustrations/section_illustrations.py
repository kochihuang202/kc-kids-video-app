"""Keep section illustrations in a separate manifest, preserved across rebuilds."""
from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
import re

SITE = Path(r"C:\Users\ji3cp\Documents\xiyouji-reader")
MANIFEST = Path(__file__).with_name("illustrations.json")
HEADINGS = re.compile(r"<h2\b[^>]*>.*?</h2>", re.S | re.I)
IMAGES = re.compile(r'<img\b[^>]*\bsrc=[\"\x27]([^\"\x27]+)[\"\x27][^>]*>', re.I)


def plain_text(markup):
    markup = re.sub(r"<rt\b[^>]*>.*?</rt>", "", markup, flags=re.S | re.I)
    markup = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", "", markup, flags=re.S | re.I)
    markup = re.sub(r"</(?:p|h2|div|figcaption)>", "\n", markup, flags=re.I)
    return html.unescape(re.sub(r"<[^>]*>", "", markup)).strip()


def section_spans(markup):
    headings = list(HEADINGS.finditer(markup))
    for index, heading in enumerate(headings):
        end = headings[index + 1].start() if index + 1 < len(headings) else len(markup)
        yield index + 1, heading, end


def inventory(site=SITE):
    entries = []
    for page in sorted((site / "episodes").glob("[0-9][0-9][0-9].html")):
        markup = page.read_text(encoding="utf-8")
        for section, heading, end in section_spans(markup):
            body = markup[heading.end():end]
            # The last section ends before the bottom navigation, not at the end of the page.
            body = re.split(r'<(?:nav|footer)\b|<div\b[^>]*class="[^\"]*(?:bottom-nav|end-nav)', body, maxsplit=1)[0]
            sources = IMAGES.findall(body)
            entries.append({
                "episode": page.stem,
                "section": section,
                "heading": plain_text(heading.group()),
                "story": plain_text(body),
                "existing_images": sources,
                "image": sources[0] if sources else None,
                "status": "existing" if sources else "pending",
            })
    return entries


def apply_section_illustrations(episode_number, markup, manifest_path=MANIFEST):
    if not manifest_path.exists():
        return markup
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    episode = f"{int(episode_number):03d}"
    entries = {item["section"]: item for item in manifest["sections"]
               if item["episode"] == episode and item.get("image")}
    edits = []
    for section, heading, end in section_spans(markup):
        item = entries.get(section)
        if not item:
            continue
        if plain_text(heading.group()) != item["heading"]:
            raise ValueError(f"{episode}/{section}: section heading changed; review artwork mapping")
        existing = IMAGES.findall(markup[heading.end():end])
        if existing:
            if item["image"] not in existing:
                raise ValueError(f"{episode}/{section}: unexpected existing illustration")
            continue
        source = html.escape(item["image"], quote=True)
        alt = html.escape(item.get("alt", item["heading"]), quote=True)
        figure = (f'\n<figure class="story-picture" data-section-illustration="{section}">\n'
                  f'  <img src="{source}" alt="{alt}" loading="lazy" decoding="async">\n'
                  '</figure>\n')
        edits.append((heading.end(), figure))
    for position, figure in reversed(edits):
        markup = markup[:position] + figure + markup[position:]
    return markup


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["inventory", "apply", "verify"])
    parser.add_argument("--site", type=Path, default=SITE)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    args = parser.parse_args()
    if args.command == "inventory":
        if args.manifest.exists():
            raise SystemExit("Manifest already exists; refusing to overwrite reviewed assignments")
        sections = inventory(args.site)
        args.manifest.write_text(json.dumps({"site": str(args.site), "sections": sections},
                                           ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"sections": len(sections), "pending": sum(s["status"] == "pending" for s in sections)}))
        return
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    changed = []
    if args.command == "apply":
        for episode in sorted({s["episode"] for s in manifest["sections"] if s.get("image")}):
            page = args.site / "episodes" / f"{episode}.html"
            before = page.read_text(encoding="utf-8")
            after = apply_section_illustrations(episode, before, args.manifest)
            if after != before:
                page.write_text(after, encoding="utf-8")
                changed.append(episode)
        print(json.dumps({"changed": changed}))
    errors = []
    scope = set(manifest.get("scope", []))
    sections = [s for s in inventory(args.site) if not scope or s["episode"] in scope]
    covered = sum(bool(s["existing_images"]) for s in sections)
    for section in sections:
        for source in section["existing_images"]:
            image = (args.site / "episodes" / source).resolve()
            if not image.is_relative_to(args.site.resolve()) or not image.is_file():
                errors.append(f'{section["episode"]}/{section["section"]}: missing/invalid {source}')
    print(json.dumps({"sections": len(sections), "illustrated": covered, "pending": len(sections) - covered,
                      "errors": errors}, ensure_ascii=False))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
