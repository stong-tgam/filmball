"""
Fixed video recorder — patches pygame.display.flip() to pipe frames to ffmpeg.
The generated simulation code doesn't need to know about recording at all.
"""

import subprocess
import pygame
import os

_ffmpeg_proc = None
_original_flip = None


def start(output_path, width=720, height=1280, fps=60):
    """Patch pygame.display.flip to write every frame to ffmpeg."""
    global _ffmpeg_proc, _original_flip

    _original_flip = pygame.display.flip

    _ffmpeg_proc = subprocess.Popen([
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-pix_fmt", "rgb24",
        "-s", f"{width}x{height}",
        "-r", str(fps),
        "-i", "pipe:0",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        output_path,
    ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    def _patched_flip():
        _original_flip()
        screen = pygame.display.get_surface()
        if screen and _ffmpeg_proc and _ffmpeg_proc.stdin:
            try:
                _ffmpeg_proc.stdin.write(pygame.image.tobytes(screen, "RGB"))
            except (BrokenPipeError, OSError):
                pass

    pygame.display.flip = _patched_flip


def stop():
    """Close the ffmpeg pipe and restore the original flip."""
    global _ffmpeg_proc, _original_flip

    if _ffmpeg_proc and _ffmpeg_proc.stdin:
        try:
            _ffmpeg_proc.stdin.close()
        except OSError:
            pass
        _ffmpeg_proc.wait()
        stderr = _ffmpeg_proc.stderr.read().decode() if _ffmpeg_proc.stderr else ""
        if _ffmpeg_proc.returncode != 0:
            print(f"[recorder] ffmpeg exited with code {_ffmpeg_proc.returncode}")
            if stderr:
                print(f"[recorder] ffmpeg stderr (last 500 chars): {stderr[-500:]}")
        _ffmpeg_proc = None

    if _original_flip:
        pygame.display.flip = _original_flip
        _original_flip = None
