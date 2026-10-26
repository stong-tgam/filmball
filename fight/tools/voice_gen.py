"""
Generate character voice lines with ElevenLabs text-to-speech.

Each character's "voice" block names a premade ElevenLabs voice and its lines
(ultimate shout, victory line, optional ability shout). Clips are saved to
characters/voice/<id>/<line>.mp3; the mixer plays them at the right moments.

    python tools/voice_gen.py --only vampire,necromancer
    python tools/voice_gen.py                    # every character, skipping existing clips
    python tools/voice_gen.py --only king --force

API key: ELEVENLABS_API_KEY in fight/.env (a text-to-speech-only key is enough).
"""

import argparse
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fightsim.spec import ROOT, list_characters, load_character  # noqa: E402

API = "https://api.elevenlabs.io/v1/text-to-speech"
MODEL = "eleven_multilingual_v2"
# shouted battle lines: low stability + high style = more energy
SETTINGS = {"stability": 0.3, "similarity_boost": 0.8, "style": 0.65, "use_speaker_boost": True}
LOG = os.path.join(ROOT, "audio", "voice_log.jsonl")


def api_key():
    key = os.environ.get("ELEVENLABS_API_KEY")
    env = os.path.join(ROOT, ".env")
    if not key and os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            name, _, value = line.strip().partition("=")
            if name.strip() == "ELEVENLABS_API_KEY":
                key = value.strip().strip('"').strip("'")
    if not key:
        sys.exit("No ELEVENLABS_API_KEY in fight/.env")
    return key


def tts(key, voice_id, text, settings):
    body = json.dumps({"text": text, "model_id": MODEL, "voice_settings": settings}).encode()
    req = urllib.request.Request(f"{API}/{voice_id}?output_format=mp3_44100_128", data=body, method="POST",
                                 headers={"xi-api-key": key, "Content-Type": "application/json",
                                          "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma list of character ids")
    ap.add_argument("--force", action="store_true", help="regenerate existing clips")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    ids = args.only.split(",") if args.only else list_characters()
    key = None if args.dry_run else api_key()
    chars = 0
    for cid in ids:
        v = load_character(cid).get("voice")
        if not v:
            print(f"  {cid}: no voice block, skipped")
            continue
        for line, text in v["lines"].items():
            out = os.path.join(ROOT, "characters", "voice", cid, f"{line}.mp3")
            if os.path.exists(out) and not args.force:
                continue
            print(f"  {cid}.{line} ({v['voice_name']}): {text!r}", flush=True)
            if args.dry_run:
                continue
            try:
                audio = tts(key, v["voice_id"], text, dict(SETTINGS, **v.get("settings", {})))
            except urllib.error.HTTPError as e:
                sys.exit(f"ElevenLabs HTTP {e.code}: {e.read().decode(errors='replace')[:300]}")
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(out, "wb") as f:
                f.write(audio)
            chars += len(text)
            os.makedirs(os.path.dirname(LOG), exist_ok=True)
            with open(LOG, "a", encoding="utf-8") as f:
                f.write(json.dumps({"time": datetime.datetime.now().isoformat(timespec="seconds"),
                                    "line": f"{cid}.{line}", "voice": v["voice_name"], "chars": len(text)}) + "\n")
    print(f"done ({chars} characters of text sent)")


if __name__ == "__main__":
    main()
