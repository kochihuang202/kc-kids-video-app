"""Install only the authorized episode 001/002 artwork and rebuild hook."""
import hashlib
import json
from pathlib import Path
import shutil

from PIL import Image
from section_illustrations import apply_section_illustrations

HERE = Path(__file__).resolve().parent
SITE = Path(r"C:\Users\ji3cp\Documents\xiyouji-reader")
ENGINE = Path(r"C:\Users\ji3cp\Documents\FXN-Antigravity")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    generated = json.loads((HERE / "generated.json").read_text(encoding="utf-8"))
    manifest = json.loads((HERE / "illustrations.json").read_text(encoding="utf-8"))
    if len(generated) != 8 or {(s["episode"], s["section"]) for s in generated} != {
        ("001", 7), *(("002", n) for n in range(1, 8))
    }:
        raise SystemExit("All eight reviewed images are required before installation")
    backups = HERE / "backups"
    backups.mkdir(exist_ok=True)
    before_other_episodes = {p.name: digest(p) for p in (SITE / "episodes").glob("*.html")
                             if p.stem not in ["001", "002"]}
    for entry in generated:
        staged = HERE / "images" / entry["filename"]
        Image.open(entry["source"]).convert("RGB").save(staged, quality=90, optimize=True)
        target = SITE / "images" / entry["filename"]
        if target.exists() and digest(target) != digest(staged):
            raise SystemExit(f"Refusing to overwrite a different existing image: {target}")
        shutil.copy2(staged, target)
        section = next(s for s in manifest["sections"] if (s["episode"], s["section"]) == (entry["episode"], entry["section"]))
        section.update(image="../images/" + entry["filename"], status="generated", alt=entry["alt"])
    manifest_path = HERE / "illustrations.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    for episode in ["001", "002"]:
        page = SITE / "episodes" / f"{episode}.html"
        backup = backups / page.name
        if not backup.exists():
            shutil.copy2(page, backup)
        original = page.read_text(encoding="utf-8")
        updated = apply_section_illustrations(episode, original, manifest_path)
        if updated != original:
            page.write_text(updated, encoding="utf-8")
    # Keep future 001~010 builds manifest-driven. Unlisted episodes pass through unchanged.
    compiler = ENGINE / "recompile_all_10_episodes.py"
    original_compiler = compiler.read_text(encoding="utf-8")
    updated_compiler = original_compiler
    if "from section_illustrations import apply_section_illustrations" not in updated_compiler:
        anchor = "from journey_glossary_master import MASTER_GLOSSARY"
        if updated_compiler.count(anchor) != 1:
            raise SystemExit("Compiler import anchor changed")
        updated_compiler = updated_compiler.replace(anchor, anchor + "\nfrom section_illustrations import apply_section_illustrations", 1)
    if "full_html = apply_section_illustrations(ep_num, full_html)" not in updated_compiler:
        anchor = "    full_html = render_unified_page(ep_num, ep_title, heading_ruby, body_inner_html, compiled_glossary)"
        if updated_compiler.count(anchor) != 1:
            raise SystemExit("Compiler render anchor changed")
        updated_compiler = updated_compiler.replace(anchor, anchor + "\n    full_html = apply_section_illustrations(ep_num, full_html)", 1)
    if updated_compiler != original_compiler:
        backup = backups / compiler.name
        if not backup.exists():
            shutil.copy2(compiler, backup)
        compiler.write_text(updated_compiler, encoding="utf-8")
    shutil.copy2(HERE / "section_illustrations.py", ENGINE / "section_illustrations.py")
    shutil.copy2(manifest_path, ENGINE / "illustrations.json")
    # Preserve the installed integration in this Git-managed deliverable directory.
    snapshot = HERE / "engine"
    snapshot.mkdir(exist_ok=True)
    shutil.copy2(compiler, snapshot / compiler.name)
    pages = HERE / "pages"
    pages.mkdir(exist_ok=True)
    for episode in ["001", "002"]:
        shutil.copy2(SITE / "episodes" / f"{episode}.html", pages / f"{episode}.html")
    for filename, before in before_other_episodes.items():
        if digest(SITE / "episodes" / filename) != before:
            raise SystemExit(f"Unrelated episode changed during installation: {filename}")
    print(json.dumps({"installed_new_images": len(generated), "episodes": ["001", "002"],
                      "unrelated_episode_hashes_unchanged": len(before_other_episodes), "rebuild_hook": str(compiler)}))


if __name__ == "__main__":
    main()
