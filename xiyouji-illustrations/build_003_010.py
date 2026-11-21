"""Add illustrations to the current seven-section HTML without rebuilding story text."""
import argparse
import json
from pathlib import Path
import re

from PIL import Image
from section_illustrations import apply_section_illustrations, plain_text, section_spans

HERE = Path(__file__).parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("site", type=Path)
    parser.add_argument("stage", type=Path)
    parser.add_argument("--assets", type=Path)
    parser.add_argument("--first", type=int, default=3)
    parser.add_argument("--last", type=int, default=10)
    args = parser.parse_args()
    episodes = range(args.first, args.last + 1)
    manifest = json.loads((HERE / "illustrations.json").read_text(encoding="utf-8"))
    manifest["sections"] = [s for s in manifest["sections"] if int(s["episode"]) not in episodes]
    assets = json.loads(args.assets.read_text(encoding="utf-8")) if args.assets else {}
    args.stage.mkdir(parents=True, exist_ok=True)
    pages = args.stage / "episodes"
    pages.mkdir(exist_ok=True)
    images = args.stage / "images"
    images.mkdir(exist_ok=True)
    rendered = {}
    asset_index = 0
    for episode in episodes:
        key = f"{episode:03d}"
        markup = (args.site / "episodes" / f"{key}.html").read_bytes().decode("utf-8")
        sections = list(section_spans(markup))
        if not sections:
            raise ValueError(f"Episode {episode} rendered {len(sections)} sections")
        rendered[key] = markup
        for section, heading, _ in sections:
            title = plain_text(heading.group())
            filename = f"ep{key}_{section:02d}.jpg"
            if assets:
                source = assets[str(asset_index)]
                with Image.open(source) as image:
                    if image.width < 1000 or not 1.7 < image.width / image.height < 1.85:
                        raise ValueError(f"Unexpected image size for {filename}")
                    image.convert("RGB").save(images / filename, quality=88, optimize=True)
                asset_index += 1
            manifest["sections"].append({"episode": key, "section": section, "heading": title,
                                         "image": f"../images/{filename}" if assets else None,
                                         "alt": re.sub(r"^.[、]", "", title)})
    if args.assets and set(assets) != {str(i) for i in range(asset_index)}:
        raise ValueError("Asset mapping must match one image per section")
    manifest["scope"] = sorted({item["episode"] for item in manifest["sections"]})
    manifest_path = args.stage / "illustrations.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    for key, markup in rendered.items():
        updated = apply_section_illustrations(key, markup, manifest_path)
        if updated.count('data-section-illustration=') != (len(list(section_spans(markup))) if assets else 0):
            raise ValueError(f"Wrong illustration count in episode {key}")
        without_figures = re.sub(r'\n<figure class="story-picture" data-section-illustration="\d+">\n.*?</figure>\n',
                                 "", updated, flags=re.S)
        if without_figures != markup:
            raise ValueError(f"Existing content changed in episode {key}")
        (pages / f"{key}.html").write_bytes(updated.encode("utf-8"))
    print(f"Staged {len(episodes)} episodes and {asset_index} illustrations.")


if __name__ == "__main__":
    main()
