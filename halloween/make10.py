"""10-second Halloween door combos: ElevenLabs sound beds + voice lines, mixed with ffmpeg."""
import json, os, re, subprocess, sys, urllib.request, urllib.error
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "fight", "tools"))
from voice_gen import api_key, tts
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
HERE = os.path.dirname(os.path.abspath(__file__)); P = os.path.join(HERE, "parts")
KEY = api_key(); credits = 0; chars = 0

def sfx(name, text, d):
    global credits
    path = os.path.join(P, name + ".mp3")
    if os.path.exists(path): return
    body = json.dumps({"text": text, "duration_seconds": d, "prompt_influence": 0.6}).encode()
    req = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", data=body,
          method="POST", headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        open(path, "wb").write(r.read()); credits += int(r.headers.get("character-cost") or 0)

def say(name, voice, text, st):
    global chars
    path = os.path.join(P, name + ".mp3")
    if os.path.exists(path): return
    open(path, "wb").write(tts(KEY, voice, text, st)); chars += len(text)

def dur(f):
    e = subprocess.run([FF, "-i", f], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", e).groups(); return int(h)*3600+int(m)*60+float(s)

def shift(r): return f"asetrate=44100*{r},aresample=44100,atempo={1/r:.4f}"
def cut(n): return f"atrim=0:{n},afade=t=out:st={n-0.5}:d=0.5"
FX = {"deep": shift(0.8) + ",aecho=0.8:0.6:90|180:0.3|0.15,volume=1.7",
      "ghost": shift(0.88) + ",aecho=0.8:0.7:110|220:0.35|0.2,volume=2.2",
      "witch": shift(0.92) + ",aecho=0.8:0.6:70|140:0.25|0.12,volume=1.6",
      "zombie": shift(0.72) + ",aecho=0.8:0.6:60|120:0.3|0.15,volume=1.8",
      "child": shift(1.08) + ",aecho=0.8:0.8:150|300:0.4|0.25,volume=1.8",
      "dry": "volume=1.4",
      "bright": "aecho=0.8:0.5:60:0.15,volume=1.5"}

def mix(out, parts, total=10.0):
    args, fc, labels = [FF, "-y", "-loglevel", "error"], [], []
    for i, (f, t, flt) in enumerate(parts):
        args += ["-i", os.path.join(P, f + ".mp3")]
        fc.append(f"[{i}:a]{flt + ',' if flt else ''}adelay={int(t*1000)}:all=1[a{i}]"); labels.append(f"[a{i}]")
    fc.append(f"{''.join(labels)}amix=inputs={len(parts)}:normalize=0,alimiter=limit=0.95,loudnorm=I=-14:TP=-1,"
              f"atrim=0:{total},afade=t=out:st={total-0.6}:d=0.6[o]")
    subprocess.run(args + ["-filter_complex", ";".join(fc), "-map", "[o]", "-ar", "44100", "-b:a", "192k",
                           os.path.join(HERE, out)], check=True)
    print(out, round(dur(os.path.join(HERE, out)), 2), "s")

SPOOKY = {"stability": 0.35, "similarity_boost": 0.8, "style": 0.5, "use_speaker_boost": True}
SOFT = {"stability": 0.5, "similarity_boost": 0.8, "style": 0.3, "use_speaker_boost": False}
BRIAN, GEORGE, BILL, LILY, MATILDA, CALLUM = ("nPczCjzI2devNBz1zQrb", "JBFqnCBsd6RMkjVDRZzb", "pqHfZKP75CvOlQylNhV4",
                                              "pFZP5JQG7iQjIQuC4Bku", "XrExE9yKIg1WjnnlVkGX", "N2lVS1w4EtoT3dr4eOWO")
os.makedirs(P, exist_ok=True)

# 4: haunted mansion host
sfx("d_bed", "haunted mansion ambience, creepy pipe organ chord, distant thunder, howling wind", 10)
sfx("d_end", "heavy iron gate slamming shut with a loud echoing clang", 2)
say("d_line1", GEORGE, "Good evening... and welcome... to my haunted house.", SPOOKY)
say("d_line2", GEORGE, "Many come in... for candy. Few... ever leave.", SPOOKY)
# 5: creepy children
sfx("e_bed", "old wind-up music box playing a slow eerie lullaby, slightly out of tune, faint wind", 10)
sfx("e_end", "creepy children giggling softly in an empty room, echo", 2.5)
say("e_line1", LILY, "Hello... will you play with us?", SOFT)
say("e_line2", LILY, "We've been so lonely... stay with us... forever.", SOFT)
# 6: witch's cauldron
sfx("f_bed", "bubbling witch cauldron, crackling fire, crows cawing, spooky forest night", 10)
sfx("f_end", "old witch cackling laugh, high pitched and wicked, long", 3)
say("f_line1", MATILDA, "Eye of newt... and toe of frog...", SPOOKY)
say("f_line2", MATILDA, "Ooh! A trick-or-treater! Just what my potion needs!", SPOOKY)
# 7: graveyard zombie (kid-friendly twist)
sfx("g_bed", "graveyard at night, owl hooting, crickets, dirt and gravel shifting, zombie groaning low", 10)
sfx("g_end", "spooky cartoon organ sting, playful halloween ending", 2)
say("g_line1", BILL, "Braaains... braaains...", SPOOKY)
say("g_line2", BILL, "Oh, candy? Even better! Happy Halloween!", SPOOKY)
# 8: chains and the keeper
sfx("h_bed", "dungeon ambience, heavy chains dragging slowly on stone, slow heavy footsteps approaching, dripping water", 10)
sfx("h_end", "deep evil demonic man laughing, echoing in a dungeon", 2.5)
say("h_line1", CALLUM, "Who goes there?", SPOOKY)
say("h_line2", CALLUM, "Take your candy... and run... before I catch you.", SPOOKY)

L = lambda n: dur(os.path.join(P, n + ".mp3"))
def combo(out, k, fx, endfx="", bedvol=0.55, t1=1.2, gap=0.5, endgap=0.2):
    a = t1 + L(k + "_line1") + gap
    e = a + L(k + "_line2") + endgap
    e = min(e, 10 - 2.0)
    mix(out, [(k + "_bed", 0, f"volume={bedvol}"), (k + "_line1", t1, FX[fx]), (k + "_line2", a, FX[fx]),
              (k + "_end", e, endfx or "volume=1.0")])
    if a + L(k + "_line2") > 9.5: print("  warning: line runs past the end")

combo("4_haunted_mansion.mp3", "d", "deep")
combo("5_creepy_children.mp3", "e", "child")
combo("6_witch_cauldron.mp3", "f", "witch")
combo("7_graveyard_zombie.mp3", "g", "zombie")
combo("8_dungeon_keeper.mp3", "h", "deep")
# friendly ones, 5 s: a short sound, one compliment, a happy ending sound
HAPPY = {"stability": 0.4, "similarity_boost": 0.8, "style": 0.6, "use_speaker_boost": True}
JESSICA = "cgSgspJ2msm6clMCkdW9"
sfx("i_start", "magical sparkle chime glissando, bright and whimsical", 1.5)
sfx("i_end", "small crowd of kids cheering and clapping happily", 2)
say("i_line", JESSICA, "Wow! I LOVE your costume! Happy Halloween!", HAPPY)
sfx("j_start", "cartoon ghost whoosh flying past, playful", 1.2)
sfx("j_end", "friendly cartoon ghost giggle, cute", 1.5)
say("j_line", LILY, "Boo! ... Just kidding! You look amazing tonight!", HAPPY)
sfx("k_start", "witch cauldron bubbling then a happy magical pop with sparkles", 1.5)
sfx("k_end", "cheerful spooky xylophone halloween jingle ending", 2)
say("k_line", MATILDA, "Ooh, what a wonderful costume! Take an extra treat, dearie!", HAPPY)

def nice(out, k, fx, t1=0.7):
    e = min(t1 + L(k + "_line") + 0.1, 5 - 1.6)
    mix(out, [(k + "_start", 0, "volume=0.8"), (k + "_line", t1, FX[fx]), (k + "_end", e, "volume=0.9")], total=5.0)
    if t1 + L(k + "_line") > 4.8: print("  warning: line runs past the end")

LIAM, WILL, SARAH = "TX3LPaxmHKxFdv7VOQHJ", "bIHbv24MWmeRgasZH58o", "EXAVITQu4vr4xnSDxMaL"
sfx("l_start", "drum roll then a bright trumpet fanfare, short", 1.5)
sfx("l_end", "game show winner ding ding ding with confetti pop", 1.5)
say("l_line", LIAM, "Whoa! Best costume on the street! You win Halloween!", HAPPY)
sfx("m_start", "doorbell ding dong, cheerful", 1.2)
sfx("m_end", "happy spooky organ flourish, playful halloween", 1.5)
say("m_line", WILL, "Hey there, superstar! Have a spooktacular night!", HAPPY)
sfx("n_start", "cute bat wings fluttering and squeaking, playful", 1.2)
sfx("n_end", "magical twinkling sparkle sound, gentle and happy", 1.5)
say("n_line", SARAH, "Aww, you look adorable! Thanks for visiting, enjoy your treats!", HAPPY)

nice("9_love_your_costume.mp3", "i", "bright")
nice("10_friendly_ghost.mp3", "j", "bright")
nice("11_extra_treat.mp3", "k", "bright")
nice("12_best_costume.mp3", "l", "bright")
nice("13_spooktacular.mp3", "m", "bright")
nice("14_adorable.mp3", "n", "bright")
print(f"ElevenLabs: {credits} sound-effect credits, {chars} speech characters")
