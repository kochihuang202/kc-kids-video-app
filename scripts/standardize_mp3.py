"""Make a separate, verified MP3 copy tree. Never modify the source tree."""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def is_mp3(path: Path) -> bool:
    """Check the bytes after any ID3 tag, rather than trusting the extension."""
    size = path.stat().st_size
    with path.open("rb") as stream:
        while True:
            position = stream.tell()
            head = stream.read(10)
            if head[:3] != b"ID3":
                break
            if len(head) != 10 or any(byte & 128 for byte in head[6:10]):
                return False
            tag_size = sum(byte << shift for byte, shift in zip(head[6:10], (21, 14, 7, 0)))
            end = position + 10 + tag_size + (10 if head[3] == 4 and head[5] & 16 else 0)
            if end >= size:
                return False
            stream.seek(end)
    return (len(head) >= 4 and head[0] == 255 and head[1] & 224 == 224
            and head[1] & 6 != 0 and (head[1] >> 3) & 3 != 1)


class Converter:
    def __init__(self, source: Path, output: Path, ffmpeg: str, workers: int = 2):
        self.source = source.resolve()
        self.output = output.resolve()
        if (self.source == self.output or self.source.is_relative_to(self.output)
                or self.output.is_relative_to(self.source)):
            raise ValueError("來源與輸出必須是互不包含的不同資料夾。")
        self.ffmpeg = ffmpeg
        self.workers = workers
        self.state = self.output.parent / (self.output.name + "-processing")
        self.state.mkdir(parents=True, exist_ok=True)
        self.output.mkdir(parents=True, exist_ok=True)
        self.journal = self.state / "results.jsonl"
        self.stop = threading.Event()

    def command(self, arguments: list[str]) -> str:
        result = subprocess.run(
            [self.ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "warning", *arguments],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=600,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        messages = result.stderr.decode("utf-8", errors="replace")
        if result.returncode:
            raise RuntimeError(messages[-5000:] or f"FFmpeg exit {result.returncode}")
        return messages

    def remux(self, source: Path, destination: Path, force_mp3: bool = False) -> str:
        return self.command([
            *(["-f", "mp3"] if force_mp3 else []), "-i", str(source),
            "-map", "0:a:0", "-c:a", "copy", "-map_metadata", "-1",
            "-id3v2_version", "3", "-write_id3v1", "0", "-write_xing", "1",
            "-f", "mp3", "-y", str(destination),
        ])

    def validate(self, path: Path) -> None:
        if not is_mp3(path):
            raise RuntimeError("輸出不是標準 MP3 檔頭。")
        # Decode every sample. A filename/header-only check cannot detect a bad tail.
        self.command(["-xerror", "-i", str(path), "-map", "0:a:0", "-f", "null", os.devnull])

    def convert(self, path: Path, previous: dict) -> dict:
        relative = path.relative_to(self.source)
        destination = self.output / relative
        original = path.stat()
        record = {"file": str(relative), "input_size": original.st_size,
                  "input_mtime_ns": original.st_mtime_ns}
        if (previous.get("status") == "ok" and previous.get("input_size") == original.st_size
                and previous.get("input_mtime_ns") == original.st_mtime_ns
                and destination.is_file() and sha256(destination) == previous.get("sha256")):
            return {**previous, "reused": True}
        with tempfile.TemporaryDirectory(prefix="mp3-", dir=self.state) as temporary:
            work = Path(temporary)
            local = work / "source.bin"
            shutil.copyfile(path, local)  # Read the network file only once.
            after = path.stat()
            if (after.st_size, after.st_mtime_ns) != (original.st_size, original.st_mtime_ns):
                raise RuntimeError("來源在讀取時被修改；請重新執行。")
            first, final = work / "first.mp3", work / "final.mp3"
            warnings = []
            mode = "remux"
            try:
                warnings.append(self.remux(local, first))
                # Re-read the first copy as actual MP3 frames. This discards stray
                # MP4/ID3 packets without assuming that packet zero is always bad.
                self.remux(first, final, force_mp3=True)
                self.validate(final)
            except (RuntimeError, subprocess.TimeoutExpired) as error:
                warnings.append(str(error))
                mode = "encode"
                # Only use encoding if MP3 stream-copy is impossible. No loudness,
                # tempo, trim or volume filters; fail on actual decode errors.
                self.command(["-xerror", "-i", str(local), "-map", "0:a:0",
                              "-c:a", "libmp3lame", "-q:a", "2", "-ar", "44100", "-ac", "2",
                              "-map_metadata", "-1", "-id3v2_version", "3", "-f", "mp3", "-y", str(final)])
                self.validate(final)
            destination.parent.mkdir(parents=True, exist_ok=True)
            digest = sha256(final)
            output_size = final.stat().st_size
            os.replace(final, destination)
        return {**record, "status": "ok", "reused": False, "mode": mode,
                "output_size": output_size, "sha256": digest,
                "input_notes": "\n".join(warnings)[-5000:]}

    def run(self, emit) -> dict:
        files = sorted(path for path in self.source.rglob("*")
                       if path.is_file() and not path.is_symlink() and not path.name.startswith("._")
                       and path.suffix.lower() == ".mp3")
        if not files:
            raise ValueError("來源資料夾內找不到 MP3。")
        previous = {}
        if self.journal.exists():
            for line in self.journal.read_text(encoding="utf-8").splitlines():
                try:
                    item = json.loads(line)
                    previous[item["file"]] = item
                except (ValueError, KeyError):
                    continue
        counts = {"total": len(files), "done": 0, "ok": 0, "failed": 0, "reused": 0}
        emit({"kind": "progress", **counts, "file": "準備處理…"})
        # Two independent files overlap network reads and decoding, without
        # starting one FFmpeg process per file simultaneously.
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.workers) as pool:
            pending = {}
            remaining = iter(files)
            def enqueue():
                if self.stop.is_set():
                    return
                path = next(remaining, None)
                if path is not None:
                    pending[pool.submit(self.convert, path, previous.get(str(path.relative_to(self.source)), {}))] = path
            for _ in range(self.workers):
                enqueue()
            while pending:
                ready, _ = concurrent.futures.wait(pending, return_when=concurrent.futures.FIRST_COMPLETED)
                for future in ready:
                    path = pending.pop(future)
                    try:
                        item = future.result()
                        counts["ok"] += 1
                        counts["reused"] += int(item.get("reused", False))
                    except Exception as error:
                        item = {"file": str(path.relative_to(self.source)), "status": "failed", "error": str(error)}
                        counts["failed"] += 1
                    counts["done"] += 1
                    with self.journal.open("a", encoding="utf-8") as stream:
                        stream.write(json.dumps(item, ensure_ascii=False) + "\n")
                    emit({"kind": "progress", **counts, "file": item["file"]})
                    enqueue()
        summary = {**counts, "stopped": self.stop.is_set(), "output": str(self.output),
                   "report": str(self.journal), "finished_at": time.strftime("%Y-%m-%d %H:%M:%S")}
        summary_path = self.state / "summary.json"
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        emit({"kind": "finished", **summary})
        return summary


def gui(converter: Converter):
    import tkinter as tk
    from tkinter import messagebox, ttk
    root = tk.Tk()
    root.title("MP3 整理進度 — 完成後可直接貼回 Mac")
    root.geometry("760x340")
    root.minsize(620, 320)
    box = ttk.Frame(root, padding=24)
    box.pack(fill="both", expand=True)
    title = tk.StringVar(value="正在讀取音訊清單…")
    detail = tk.StringVar(value="原始資料夾只讀取；完成檔案輸出到另一個資料夾。")
    filename = tk.StringVar(value="")
    ttk.Label(box, textvariable=title, font=("Microsoft JhengHei UI", 16, "bold")).pack(anchor="w")
    bar = ttk.Progressbar(box, mode="determinate")
    bar.pack(fill="x", pady=18)
    ttk.Label(box, textvariable=detail).pack(anchor="w")
    ttk.Label(box, textvariable=filename, wraplength=700).pack(anchor="w", pady=12)
    ttk.Label(box, text=str(converter.output), wraplength=700).pack(anchor="w")
    buttons = ttk.Frame(box)
    buttons.pack(side="bottom", fill="x", pady=(18, 0))
    def open_path(path):
        if os.name == "nt":
            os.startfile(path)
    ttk.Button(buttons, text="開啟輸出資料夾", command=lambda: open_path(converter.output)).pack(side="left")
    ttk.Button(buttons, text="開啟處理報告", command=lambda: open_path(converter.state)).pack(side="left", padx=8)
    stop_button = ttk.Button(buttons, text="處理完目前檔案後停止", command=converter.stop.set)
    stop_button.pack(side="right")
    events = queue.Queue()
    finished = False
    started = time.monotonic()
    def work():
        try:
            converter.run(events.put)
        except Exception as error:
            events.put({"kind": "error", "message": str(error)})
    def update():
        nonlocal finished
        try:
            while True:
                event = events.get_nowait()
                if event["kind"] == "error":
                    title.set("處理中止，請查看訊息")
                    filename.set(event["message"])
                    finished = True
                else:
                    bar.configure(maximum=event["total"], value=event["done"])
                    title.set(f"進度 {event['done']} / {event['total']}")
                    elapsed = int(time.monotonic() - started)
                    detail.set(f"成功 {event['ok']}　失敗 {event['failed']}　已完成略過 {event['reused']}　經過 {elapsed // 60} 分 {elapsed % 60} 秒")
                    filename.set(event.get("file", ""))
                    if event["kind"] == "finished":
                        finished = True
                        title.set("已停止，重新執行可接續" if event["stopped"] else "處理完成" if not event["failed"] else "處理結束，有檔案需要查看報告")
                        filename.set("完成的 MP3 已放在輸出資料夾，可自行貼回同名資料夾。")
                        root.bell()
                if finished:
                    stop_button.state(["disabled"])
        except queue.Empty:
            pass
        root.after(500, update)
    def close():
        if finished:
            root.destroy()
        elif messagebox.askyesno("停止處理？", "將處理完目前檔案後停止；已完成的檔案會保留。"):
            converter.stop.set()
            root.iconify()
    root.protocol("WM_DELETE_WINDOW", close)
    threading.Thread(target=work, daemon=False).start()
    root.after(100, update)
    root.mainloop()


def main():
    for stream in (sys.stdout, sys.stderr):
        if stream is not None and hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--ffmpeg", default=None)
    parser.add_argument("--workers", type=int, default=2, choices=range(1, 5))
    parser.add_argument("--gui", action="store_true")
    args = parser.parse_args()
    candidates = [args.ffmpeg, shutil.which("ffmpeg"),
                  str(Path.cwd() / "node_modules/ffmpeg-static/ffmpeg.exe"),
                  str(Path(__file__).resolve().parents[1] / "node_modules/ffmpeg-static/ffmpeg.exe")]
    ffmpeg = next((value for value in candidates if value and Path(value).is_file()), None)
    if not ffmpeg:
        parser.error("找不到 FFmpeg；請用 --ffmpeg 指定 ffmpeg.exe。")
    converter = Converter(args.source, args.output, ffmpeg, args.workers)
    if args.gui:
        gui(converter)
    else:
        result = converter.run(lambda event: print(json.dumps(event, ensure_ascii=False), flush=True))
        return 1 if result["failed"] or result["stopped"] else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
