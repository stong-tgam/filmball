"""
A row of frames from a video, for quick visual checks.

    python tools/frame_strip.py out/_tests/x/video_preview.mp4 out.png 0.4 0.6 0.9
Positions below 1 are fractions of the video length; 1 and above are seconds.
"""

import subprocess
import sys

import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()


def duration(video):
    err = subprocess.run([FF, "-i", video], capture_output=True, text=True).stderr
    line = next(x for x in err.splitlines() if "Duration" in x)
    h, m, s = line.split("Duration: ")[1].split(",")[0].split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def strip(video, out, positions, width=270):
    d = duration(video)
    ins = []
    for p in positions:
        ins += ["-ss", f"{p * d if p < 1 else p:.2f}", "-i", video]
    n = len(positions)
    filt = "".join(f"[{i}:v]scale={width}:-1[v{i}];" for i in range(n)) + \
        "".join(f"[v{i}]" for i in range(n)) + f"hstack=inputs={n}"
    subprocess.run([FF, "-v", "error", "-y", *ins, "-filter_complex", filt, "-frames:v", "1", out],
                   check=True, stdin=subprocess.DEVNULL)
    return d


if __name__ == "__main__":
    print(round(strip(sys.argv[1], sys.argv[2], [float(x) for x in sys.argv[3:]]), 1))
