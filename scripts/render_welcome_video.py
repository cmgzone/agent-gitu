"""Render a deterministic 1080p/30fps Agent Gitu welcoming video with synchronized audio.

Generates a 48kHz stereo soundtrack via scripts/welcome_audio.py, renders all 420
video frames deterministically in headless Chromium (scripts/welcome-video.html),
and encodes both:
  - assets/agent-gitu-welcome.mp4  (H.264 + AAC, universal playback)
  - assets/agent-gitu-welcome.webm (VP8 + Opus, web playback)
"""

from __future__ import annotations

import functools
import glob
import http.server
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from welcome_audio import synthesize_soundtrack

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_MP4 = ROOT / "assets" / "agent-gitu-welcome.mp4"
OUT_WEBM = ROOT / "assets" / "agent-gitu-welcome.webm"
FPS = 30
DURATION = 14.0
FRAMES = int(FPS * DURATION)


def _supports_audio_encoders(ffmpeg_bin: str) -> bool:
    try:
        res = subprocess.run([ffmpeg_bin, "-encoders"], capture_output=True, text=True, timeout=5)
        out = (res.stdout or "") + (res.stderr or "")
        return "aac" in out and "libx264" in out
    except Exception:
        return False


def find_ffmpeg() -> tuple[str, bool]:
    """Return (ffmpeg_path, has_full_audio_video_encoders)."""
    candidates: list[str] = []
    if env_bin := os.environ.get("FFMPEG_BIN"):
        candidates.append(env_bin)
    if which_bin := shutil.which("ffmpeg"):
        candidates.append(which_bin)
    candidates.extend(
        sorted(
            glob.glob(str(pathlib.Path.home() / ".vscode/extensions/*/bin/ffmpeg.exe"))
            + glob.glob(str(pathlib.Path.home() / ".windsurf/extensions/*/bin/ffmpeg.exe")),
            reverse=True,
        )
    )
    for cand in candidates:
        if pathlib.Path(cand).is_file() and _supports_audio_encoders(cand):
            return cand, True

    pw_matches = sorted(
        glob.glob(
            str(pathlib.Path.home() / "AppData/Local/ms-playwright/**/ffmpeg-win64.exe"),
            recursive=True,
        )
    )
    if pw_matches:
        return pw_matches[-1], False
    raise FileNotFoundError("Could not find an ffmpeg executable")


def start_server() -> tuple[http.server.ThreadingHTTPServer, int]:
    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, server.server_address[1]


def _drain(pipe, chunks: list[bytes]) -> threading.Thread:
    def _run():
        assert pipe is not None
        while True:
            data = pipe.read(4096)
            if not data:
                break
            chunks.append(data)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return t


def main() -> int:
    keyframe_dir = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if keyframe_dir:
        keyframe_dir.mkdir(parents=True, exist_ok=True)

    ffmpeg_bin, full_av = find_ffmpeg()
    server, port = start_server()
    OUT_WEBM.parent.mkdir(parents=True, exist_ok=True)

    tmp_dir = pathlib.Path(tempfile.mkdtemp(prefix="gitu_welcome_"))
    wav_path = tmp_dir / "soundtrack.wav"
    synthesize_soundtrack(wav_path, duration=DURATION)

    if full_av:
        ffmpeg_cmd = [
            ffmpeg_bin,
            "-y",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "-r",
            str(FPS),
            "-i",
            "pipe:0",
            "-i",
            str(wav_path),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "16",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-shortest",
            str(OUT_MP4),
        ]
    else:
        print("Warning: full ffmpeg with AAC/Opus encoders not found; rendering silent WebM via Playwright ffmpeg.", file=sys.stderr)
        ffmpeg_cmd = [
            ffmpeg_bin,
            "-y",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "-framerate",
            str(FPS),
            "-i",
            "pipe:0",
            "-c:v",
            "libvpx",
            "-b:v",
            "8M",
            "-crf",
            "8",
            "-deadline",
            "good",
            "-cpu-used",
            "2",
            "-pix_fmt",
            "yuv420p",
            str(OUT_WEBM),
        ]

    keyframe_indices = {
        int(1.6 * FPS): "keyframe_01_welcome.png",
        int(5.6 * FPS): "keyframe_02_teamwork.png",
        int(9.4 * FPS): "keyframe_03_connections.png",
        int(12.4 * FPS): "keyframe_04_squad.png",
    }

    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    stderr_chunks: list[bytes] = []
    stderr_thread = _drain(proc.stderr, stderr_chunks)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
            page.add_init_script("window.__RENDER_CONTROLLED__ = true;")
            page.goto(f"http://127.0.0.1:{port}/scripts/welcome-video.html", wait_until="networkidle")
            page.evaluate(
                """async () => {
                    await document.fonts.ready;
                    await Promise.all(
                        Array.from(document.images).map(img =>
                            img.complete ? img.decode().catch(() => {}) : new Promise(res => {
                                img.onload = () => res();
                                img.onerror = () => res();
                            })
                        )
                    );
                }"""
            )

            assert proc.stdin is not None
            for i in range(FRAMES):
                t = i / FPS
                page.evaluate("(t) => window.__setTime(t)", t)
                frame_bytes = page.screenshot(type="jpeg", quality=96)
                proc.stdin.write(frame_bytes)
                if keyframe_dir and i in keyframe_indices:
                    (keyframe_dir / keyframe_indices[i]).write_bytes(
                        page.screenshot(type="png")
                    )

            proc.stdin.close()
            browser.close()
    finally:
        server.shutdown()

    stderr_thread.join(timeout=5)
    stderr = b"".join(stderr_chunks).decode("utf-8", errors="replace")
    code = proc.wait()
    if code != 0:
        sys.stderr.write(stderr)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return code

    if full_av:
        # Also package WebM (VP8 + Opus) from the crisp MP4 + lossless WAV soundtrack
        webm_cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            str(OUT_MP4),
            "-i",
            str(wav_path),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "libvpx",
            "-b:v",
            "8M",
            "-crf",
            "8",
            "-deadline",
            "good",
            "-cpu-used",
            "2",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "libopus",
            "-b:a",
            "160k",
            "-shortest",
            str(OUT_WEBM),
        ]
        webm_res = subprocess.run(webm_cmd, capture_output=True)
        if webm_res.returncode != 0:
            sys.stderr.write(webm_res.stderr.decode("utf-8", errors="replace"))
            shutil.rmtree(tmp_dir, ignore_errors=True)
            return webm_res.returncode

    if keyframe_dir:
        shutil.copy2(wav_path, keyframe_dir / "soundtrack.wav")
    shutil.rmtree(tmp_dir, ignore_errors=True)

    if full_av:
        mp4_kb = OUT_MP4.stat().st_size // 1024
        webm_kb = OUT_WEBM.stat().st_size // 1024
        print(f"Rendered {FRAMES} frames ({DURATION}s @ {FPS}fps) with 48kHz stereo sound ->")
        print(f"  MP4 : {OUT_MP4} ({mp4_kb} KB)")
        print(f"  WebM: {OUT_WEBM} ({webm_kb} KB)")
    else:
        webm_kb = OUT_WEBM.stat().st_size // 1024
        print(f"Rendered {FRAMES} frames ({DURATION}s @ {FPS}fps) -> {OUT_WEBM} ({webm_kb} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
