import os
import re
import json
import subprocess
import sys
import yaml
from openai import OpenAI
import wave
import struct
import math

# ── LLM Client ────────────────────────────────────────────────────────────────
local_client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
LOCAL_MODEL = "gemma4:26b"

# ── Constants ──────────────────────────────────────────────────────────────────
SIM_RAW_VIDEO = "simulation_raw.mp4"
OUTPUT_VIDEO = "output.mp4"
SCENE_FILE = "scene.json"
WIDTH, HEIGHT, FPS = 720, 1280, 60

VALID_SHAPES = {"circle", "triangle", "square", "pentagon", "hexagon",
                "octagon", "star", "rectangle"}
VALID_RULES = {"spawn_ball", "change_color", "increase_speed", "none"}

# ── Scene Generation Prompt ────────────────────────────────────────────────────

SCENE_PROMPT = """
You are a scene config generator for a 2D ball-bounce physics animation engine.
Convert the user's video concept into a JSON scene configuration.

Return ONLY valid JSON matching this exact schema:
{
  "container": {
    "shape": "circle|triangle|square|pentagon|hexagon|octagon|star|rectangle",
    "radius": 100-500 (size of the container),
    "rotation_speed": 0.0-0.05 (radians per frame, 0 = static),
    "color": [r, g, b] (0-255),
    "thickness": 2-8,
    "glow": true/false
  },
  "balls": {
    "count": 1-5 (starting balls),
    "radius": 5-40,
    "color": [r, g, b] (0-255),
    "glow": true/false,
    "speed": 150-500 (initial speed)
  },
  "physics": {
    "elasticity": 0.8-1.0,
    "gravity": [0, 0] (use [0, 0] for zero-g, [0, 500] for downward)
  },
  "rules": {
    "on_collision": "spawn_ball|change_color|increase_speed|none",
    "max_balls": 20-100
  },
  "background_color": [r, g, b] (dark colors work best),
  "sfx_description": "2-4 word sound effect name"
}

Use neon/bright colors for container and balls on a dark background.
"""


# ── Utility Functions ──────────────────────────────────────────────────────────

def llm_call(system_prompt, user_content, temperature=0.1, json_mode=False):
    kwargs = {
        "model": LOCAL_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    response = local_client.chat.completions.create(**kwargs)
    return response.choices[0].message.content.strip()


def load_config(filepath="config.yaml"):
    print(f"Loading configuration from {filepath}...")
    try:
        with open(filepath, 'r') as file:
            return yaml.safe_load(file)
    except FileNotFoundError:
        print(f"Error: Could not find {filepath}.")
        sys.exit(1)


def clamp_color(c):
    if not isinstance(c, list) or len(c) != 3:
        return [0, 200, 255]
    return [max(0, min(255, int(v))) for v in c]


def sanitize_scene(scene):
    """Apply defaults and clamp values so any LLM output becomes valid."""
    cont = scene.setdefault("container", {})
    cont.setdefault("shape", "circle")
    if cont["shape"] not in VALID_SHAPES:
        cont["shape"] = "circle"
    cont["radius"] = max(100, min(500, int(cont.get("radius", 300))))
    cont["rotation_speed"] = max(-0.1, min(0.1, float(cont.get("rotation_speed", 0))))
    cont["color"] = clamp_color(cont.get("color", [0, 200, 255]))
    cont["thickness"] = max(1, min(10, int(cont.get("thickness", 3))))
    cont.setdefault("glow", False)

    balls = scene.setdefault("balls", {})
    balls["count"] = max(1, min(10, int(balls.get("count", 1))))
    balls["radius"] = max(5, min(50, int(balls.get("radius", 20))))
    balls["color"] = clamp_color(balls.get("color", [0, 255, 255]))
    balls.setdefault("glow", True)
    balls["speed"] = max(100, min(600, int(balls.get("speed", 300))))

    phys = scene.setdefault("physics", {})
    phys["elasticity"] = max(0.5, min(1.0, float(phys.get("elasticity", 1.0))))
    grav = phys.get("gravity", [0, 0])
    if not isinstance(grav, list) or len(grav) != 2:
        grav = [0, 0]
    phys["gravity"] = [max(-500, min(500, float(grav[0]))),
                       max(-500, min(500, float(grav[1])))]

    rules = scene.setdefault("rules", {})
    rules.setdefault("on_collision", "none")
    if rules["on_collision"] not in VALID_RULES:
        rules["on_collision"] = "none"
    rules["max_balls"] = max(10, min(200, int(rules.get("max_balls", 50))))

    scene["background_color"] = clamp_color(scene.get("background_color", [5, 5, 15]))
    scene.setdefault("sfx_description", "impact thud")

    return scene


def generate_sfx(description):
    """Creates a valid sine wave WAV file with decay envelope."""
    print(f"  [SFX] Generating collision.wav for: '{description}'")
    sample_rate = 44100
    duration = 0.5
    frequency = 440.0
    num_samples = int(sample_rate * duration)

    with wave.open("collision.wav", "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for i in range(num_samples):
            t = i / sample_rate
            envelope = math.exp(-10 * t)
            sample = int(32767.0 * math.sin(2.0 * math.pi * frequency * t) * envelope)
            wav_file.writeframesraw(struct.pack('<h', sample))

    with wave.open("collision.wav", "rb") as f:
        print(f"  [SFX] Valid WAV: {f.getparams()}")


# ── Scene Config Generator ─────────────────────────────────────────────────────

def generate_scene_config(concept, max_retries=3):
    """Ask the LLM to produce a scene config from the user concept."""
    print("\n[Scene Generator] Converting concept to scene config...")

    for attempt in range(1, max_retries + 1):
        try:
            raw = llm_call(SCENE_PROMPT, concept, temperature=0.1, json_mode=True)
            # Strip markdown fences if present
            raw = re.sub(r'^\s*```[a-zA-Z]*\s*\n', '', raw)
            raw = re.sub(r'\n\s*```\s*$', '', raw)
            scene = json.loads(raw.strip())
            scene = sanitize_scene(scene)
            print(f"[Scene Generator] Config generated (attempt {attempt})")
            return scene
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            print(f"  [!] Attempt {attempt}/{max_retries}: Invalid JSON — {e}")

    print("[Scene Generator] All retries failed. Using defaults.")
    return sanitize_scene({})


# ── Simulation Runner ──────────────────────────────────────────────────────────

def run_simulation(duration):
    """Run the fixed engine with the recorder wrapper."""
    print("\n[Runner] Starting simulation with video recording...")

    for stale in (SIM_RAW_VIDEO, OUTPUT_VIDEO):
        if os.path.exists(stale):
            os.remove(stale)

    wrapper_code = (
        "import recorder\n"
        "import simulation_engine\n"
        "\n"
        f'recorder.start("{SIM_RAW_VIDEO}", {WIDTH}, {HEIGHT}, {FPS})\n'
        "try:\n"
        f'    scene = simulation_engine.load_scene("{SCENE_FILE}")\n'
        f"    engine = simulation_engine.SimulationEngine(scene, {duration})\n"
        "    engine.run()\n"
        "except SystemExit:\n"
        "    pass\n"
        "finally:\n"
        "    recorder.stop()\n"
    )
    wrapper_path = "_run_with_recording.py"
    with open(wrapper_path, "w", encoding="utf-8") as f:
        f.write(wrapper_code)

    timeout = duration + 60
    try:
        result = subprocess.run(
            [sys.executable, wrapper_path],
            capture_output=True, text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        print(f"[Runner] Timed out after {timeout}s")
        return False
    finally:
        if os.path.exists(wrapper_path):
            os.remove(wrapper_path)

    if result.returncode != 0:
        stderr = result.stderr.strip()
        lines = stderr.splitlines()
        short = "\n".join(lines[-10:]) if len(lines) > 10 else stderr
        print(f"[Runner] Error:\n{short}")
        return False

    # Validate output video
    if not os.path.exists(SIM_RAW_VIDEO):
        print(f"[Runner] '{SIM_RAW_VIDEO}' not created.")
        return False

    size = os.path.getsize(SIM_RAW_VIDEO)
    if size < 1024:
        print(f"[Runner] '{SIM_RAW_VIDEO}' too small ({size} bytes)")
        return False

    # ffprobe validation (optional)
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height,nb_frames",
             "-of", "json", SIM_RAW_VIDEO],
            capture_output=True, text=True, timeout=10,
        )
        if probe.returncode == 0:
            info = json.loads(probe.stdout)
            streams = info.get("streams", [])
            if streams:
                s = streams[0]
                print(f"  [ffprobe] {s.get('width')}x{s.get('height')}, "
                      f"frames={s.get('nb_frames', '?')}")
    except (FileNotFoundError, Exception):
        pass

    print(f"[Runner] Video recorded ({size:,} bytes)")
    return True


def mux_audio_video():
    """Mux the silent video with collision.wav into the final output."""
    print("\n[Muxer] Combining video + audio...")
    if not os.path.exists(SIM_RAW_VIDEO):
        print("[Muxer] No raw video found.")
        return False

    result = subprocess.run([
        "ffmpeg", "-y",
        "-i", SIM_RAW_VIDEO, "-i", "collision.wav",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest", OUTPUT_VIDEO,
    ], capture_output=True, text=True)

    if result.returncode != 0:
        print(f"[Muxer] Audio mux failed, falling back to video-only...")
        subprocess.run(
            ["ffmpeg", "-y", "-i", SIM_RAW_VIDEO, "-c:v", "copy", OUTPUT_VIDEO],
            capture_output=True,
        )

    if os.path.exists(OUTPUT_VIDEO) and os.path.getsize(OUTPUT_VIDEO) > 1024:
        size = os.path.getsize(OUTPUT_VIDEO)
        print(f"[Muxer] Done — '{OUTPUT_VIDEO}' ({size:,} bytes)")
        if os.path.exists(SIM_RAW_VIDEO):
            os.remove(SIM_RAW_VIDEO)
        return True

    print("[Muxer] Output file missing or too small.")
    return False


# ── Main Pipeline ──────────────────────────────────────────────────────────────

def run_pipeline(concept, duration):
    """Generate scene config from concept → render with fixed engine → mux audio."""
    # 1. LLM converts concept to scene config
    scene = generate_scene_config(concept)
    print(f"\n[Config] Scene:\n{json.dumps(scene, indent=2)}")

    # 2. Save scene config
    with open(SCENE_FILE, "w") as f:
        json.dump(scene, f, indent=2)

    # 3. Generate sound effect
    sfx_desc = scene.pop("sfx_description", "impact thud")
    generate_sfx(sfx_desc)

    # Re-save without sfx_description (engine doesn't need it)
    with open(SCENE_FILE, "w") as f:
        json.dump(scene, f, indent=2)

    # 4. Run simulation with recording
    if not run_simulation(duration):
        print("\n[Pipeline] Simulation failed.")
        return False

    # 5. Mux audio + video
    if not mux_audio_video():
        print("\n[Pipeline] Muxing failed.")
        return False

    print(f"\n[Pipeline] Complete! Output: {os.path.abspath(OUTPUT_VIDEO)}")
    return True


# ── Entry Point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("FILMBALL — Video Generation Pipeline")
    print("=" * 60)

    config = load_config("config.yaml")
    concept = config.get("video_concept", "A bouncing ball in a circle.")
    duration = config.get("duration_seconds", 10)

    success = run_pipeline(concept, duration)
    sys.exit(0 if success else 1)
    sys.exit(0 if success else 1)