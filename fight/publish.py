"""
Prompt-to-YouTube pipeline for one matchup:

  1. voices  - ElevenLabs lines for both fighters (skips existing; free key is enough)
  2. art     - PixelLab sprites for both fighters (free generations only; skips existing)
  3. render  - balance, seed search, video + 8-bit SFX + announcer + voices
  4. upload  - YouTube Data API, using out/<a>_vs_<b>/youtube.json

    python publish.py vampire necromancer                    # full pipeline, public upload
    python publish.py vampire necromancer --privacy private
    python publish.py vampire necromancer --no-upload        # stop after rendering
    python publish.py specs/king_vs_knight.json --privacy unlisted

Steps 1-2 never fail the run: missing voices/art just fall back (silent / drawn).
"""

import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable


def step(title):
    print(f"\n=== {title} ===", flush=True)


def run(args, required=True):
    res = subprocess.run([PY] + args, cwd=HERE)
    if required and res.returncode != 0:
        sys.exit(f"failed: {' '.join(args)}")
    return res.returncode == 0


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("what", nargs="+", help="two character ids, or one spec .json")
    ap.add_argument("--privacy", choices=["private", "unlisted", "public"], default="public")
    ap.add_argument("--no-upload", action="store_true")
    ap.add_argument("--skip-assets", action="store_true", help="don't try to make missing voices/art")
    ap.add_argument("--seed", type=int, help="replay this seed of the last run instead of searching")
    args = ap.parse_args()

    sys.path.insert(0, HERE)
    from fightsim.spec import load_spec

    if len(args.what) == 2:
        ids, name = args.what, f"{args.what[0]}_vs_{args.what[1]}"
    else:
        spec_path = args.what[0] if os.path.exists(args.what[0]) else os.path.join(HERE, args.what[0])
        raw = load_spec(spec_path)
        ids = [f.get("id") for f in raw["fighters"]]
        name = os.path.splitext(os.path.basename(spec_path))[0]
    out_dir = os.path.join(HERE, "out", name)

    if not args.skip_assets:
        step("1/4 voices (ElevenLabs)")
        if not run(["tools/voice_gen.py", "--only", ",".join(ids)], required=False):
            print("  voices skipped (no key, no quota or API error); the fight still has SFX")
        step("2/4 art (PixelLab, free generations only)")
        if not run(["tools/pixellab_gen.py", "--only", ",".join(ids)], required=False):
            print("  art incomplete; missing sprites use the drawn fallback")

    step("3/4 render")
    cmd = ["make_fight.py"] + args.what
    if args.seed is not None:
        cmd += ["--seed", str(args.seed)]
    run(cmd)

    if args.no_upload:
        print(f"\nRendered: {os.path.join(out_dir, 'video.mp4')} (upload skipped)")
        return
    step(f"4/4 upload to YouTube ({args.privacy})")
    from tools.youtube_upload import upload
    result = upload(out_dir, args.privacy)
    print(f"\nDone: {result['url']}")


if __name__ == "__main__":
    main()
