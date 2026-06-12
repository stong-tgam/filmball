import os
import re
import json
import subprocess
import sys
import ast
import yaml
from openai import OpenAI
import wave
import struct
import math

# ── LLM Client ────────────────────────────────────────────────────────────────
local_client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
LOCAL_MODEL = "gemma4:26b"

# ── Constants ──────────────────────────────────────────────────────────────────
SIM_RAW_VIDEO = "simulation_raw.mp4"   # silent video from generated sim
OUTPUT_VIDEO = "output.mp4"            # final muxed video with audio
WIDTH, HEIGHT, FPS = 720, 1280, 60

# ── Agent System Prompts ───────────────────────────────────────────────────────

DIRECTOR_PROMPT = """
You are a technical director.
1. Break the user's concept into a JSON object with keys "visual_logic" and "sfx_prompt".
2. "sfx_prompt" MUST be an extremely concise, descriptive sound effect name (max 5 words).
   Example: "Glass ping reverb", "Metallic hollow thud".
3. NEVER use sentences, descriptions, or explanations in the SFX prompt.
4. STRICTLY AVOID any character repetition or stuttering.
Return ONLY valid JSON.
"""

CODER_PROMPT_TEMPLATE = """
You are an expert Python developer using Pygame and Pymunk 7.0+.
Write an executable Python script for a physics simulation.

CRITICAL REQUIREMENTS:
1. Window must be 720x1280 (vertical format). FPS = 60.
2. Use Pymunk for perfect elastic collisions (elasticity = 1.0) and zero gravity.
3. Include an automated exit condition after EXACTLY {duration} seconds that cleanly calls pygame.quit() then sys.exit().
4. You MUST use pygame.mixer.Sound('collision.wav') and play it on every Pymunk collision.
5. VERY IMPORTANT PYMUNK 7 SYNTAX: You MUST NOT use `space.add_collision_handler`. Use `space.on_collision(0, 0, begin=your_callback_function)`.
6. THE COLLISION CALLBACK FUNCTION signature MUST be exactly: `def collision_begin(arbiter, space, data):` or `def collision_begin(arbiter, space):`.
7. NEVER attach a shape directly to the space. Static boundary shapes MUST be attached to `space.static_body`. Dynamic shapes MUST be attached to a `pymunk.Body`.
8. Write standard, clean Python. No improper type hints.
9. Output raw, executable Python code only. No markdown formatting.
10. Do NOT include any video recording, ffmpeg, or file-writing code. Just render to the Pygame window.
"""

REPAIR_PROMPT = (
    "You are a Python code repair assistant. "
    "The user will give you broken Python code and the error. "
    "Return ONLY the complete fixed Python code. "
    "No markdown fences, no explanations."
)

REVIEWER_PROMPT = """
You are a code reviewer for Pygame/Pymunk physics simulations.
The user will give you the original video concept and the generated Python code.

Verify:
1. Are the correct shapes present (e.g., sphere, triangle, hexagon)?
2. Are visual effects described in the concept implemented (e.g., glowing, neon, colors)?
3. Does the physics behavior match (e.g., bouncing, spawning, gravity)?
4. Does the code look like it will run without runtime errors?
5. Does it call pygame.quit() and sys.exit() after the duration elapses?
6. The code should NOT contain any ffmpeg or video recording logic — that is handled externally.

Return ONLY a JSON object with:
- "passed": true/false
- "issues": ["list of specific problems found"] (empty list if passed)
"""


# ── Utility Functions ──────────────────────────────────────────────────────────

def llm_call(system_prompt, user_content, temperature=0.1, json_mode=False):
    """Shared LLM call wrapper."""
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


def strip_markdown_fences(code):
    """Remove markdown code fences the LLM may wrap around the output."""
    code = re.sub(r'^\s*```[a-zA-Z]*\s*\n', '', code)
    code = re.sub(r'\n\s*```\s*$', '', code)
    return code.strip()


def validate_syntax(code_string):
    """Return None if code is valid Python, or the error message if not."""
    try:
        ast.parse(code_string)
        return None
    except SyntaxError as e:
        return f"SyntaxError at line {e.lineno}: {e.msg}"


def load_config(filepath="config.yaml"):
    """Reads the YAML configuration file."""
    print(f"Loading configuration from {filepath}...")
    try:
        with open(filepath, 'r') as file:
            return yaml.safe_load(file)
    except FileNotFoundError:
        print(f"Error: Could not find {filepath}. Please create it first.")
        sys.exit(1)


def generate_sfx(sfx_prompt):
    """Creates a valid sine wave WAV file with decay envelope."""
    print(f"  [SFX] Generating collision.wav for: '{sfx_prompt}'")
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

    # Verify the generated file
    with wave.open("collision.wav", "rb") as f:
        params = f.getparams()
        print(f"  [SFX] Valid WAV: {params}")


# ── Agent Functions ────────────────────────────────────────────────────────────

def director_agent(concept):
    """Breaks a concept into visual_logic and sfx_prompt."""
    print("\n[Director] Breaking down concept...")
    raw = llm_call(DIRECTOR_PROMPT, concept, temperature=0.1, json_mode=True)
    result = json.loads(raw)
    print(f"[Director] Visual: {result['visual_logic']}")
    print(f"[Director] SFX:    {result['sfx_prompt']}")
    return result


def coder_agent(visual_logic, duration):
    """Generates the simulation code from a visual description."""
    print("\n[Coder] Generating Pygame/Pymunk script...")
    prompt = CODER_PROMPT_TEMPLATE.format(duration=duration)
    raw = llm_call(prompt, visual_logic, temperature=0.1)
    return strip_markdown_fences(raw)


def coder_agent_repair(code, error_msg, max_retries=3):
    """Fixes broken code by feeding the error back to the LLM."""
    for attempt in range(1, max_retries + 1):
        print(f"  [Coder/Repair] Attempt {attempt}/{max_retries} — {error_msg}")
        raw = llm_call(
            REPAIR_PROMPT,
            f"Error:\n{error_msg}\n\nFull code:\n{code}",
            temperature=0.0,
        )
        code = strip_markdown_fences(raw)
        error_msg = validate_syntax(code)
        if error_msg is None:
            print("  [Coder/Repair] Syntax fixed.")
            return code
    print("  [Coder/Repair] Failed after all retries.")
    return None


def tester_agent(code, duration):
    """Writes the simulation, runs it with the recorder wrapper, validates output."""
    print("\n[Tester] Executing simulation with recorder...")
    with open("generated_simulation.py", "w", encoding="utf-8") as f:
        f.write(code)

    # Clean up stale output
    for stale in (SIM_RAW_VIDEO, OUTPUT_VIDEO):
        if os.path.exists(stale):
            os.remove(stale)

    # Build a wrapper that starts the recorder, runs the sim, stops recording.
    # The generated code never needs to know about ffmpeg.
    wrapper_code = (
        "import recorder\n"
        "import sys\n"
        "\n"
        f"recorder.start(\"{SIM_RAW_VIDEO}\", {WIDTH}, {HEIGHT}, {FPS})\n"
        "try:\n"
        "    exec(open(\"generated_simulation.py\").read())\n"
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
        msg = f"Simulation timed out after {timeout}s (expected {duration}s)"
        print(f"[Tester] FAIL: {msg}")
        return False, msg
    finally:
        if os.path.exists(wrapper_path):
            os.remove(wrapper_path)

    # Check for runtime errors
    if result.returncode != 0:
        stderr = result.stderr.strip()
        lines = stderr.splitlines()
        short = "\n".join(lines[-15:]) if len(lines) > 15 else stderr
        print(f"[Tester] Runtime error (exit {result.returncode}):\n{short}")
        return False, short

    # ── Validate the output video ───────────────────────────────────────
    if not os.path.exists(SIM_RAW_VIDEO):
        msg = f"Simulation exited but '{SIM_RAW_VIDEO}' was not created. Recorder may have failed."
        print(f"[Tester] FAIL: {msg}")
        return False, msg

    file_size = os.path.getsize(SIM_RAW_VIDEO)
    if file_size < 1024:
        msg = f"'{SIM_RAW_VIDEO}' is only {file_size} bytes — likely corrupt."
        print(f"[Tester] FAIL: {msg}")
        return False, msg

    probe_ok, probe_msg = validate_video_with_ffprobe(SIM_RAW_VIDEO)
    if not probe_ok:
        print(f"[Tester] FAIL: {probe_msg}")
        return False, probe_msg

    print(f"[Tester] PASSED — '{SIM_RAW_VIDEO}' ({file_size:,} bytes)")
    return True, ""


def validate_video_with_ffprobe(filepath):
    """Use ffprobe to check a video file has at least one video stream."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height,duration,nb_frames",
             "-of", "json", filepath],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return False, f"ffprobe error: {result.stderr.strip()}"
        info = json.loads(result.stdout)
        streams = info.get("streams", [])
        if not streams:
            return False, "ffprobe found no video streams in the file"
        s = streams[0]
        print(f"  [ffprobe] {s.get('width')}x{s.get('height')}, "
              f"frames={s.get('nb_frames', '?')}, dur={s.get('duration', '?')}s")
        return True, ""
    except FileNotFoundError:
        # ffprobe not installed — skip deep validation
        print("  [ffprobe] not found, skipping deep validation")
        return True, ""
    except Exception as e:
        return False, f"ffprobe exception: {e}"


def mux_audio_video():
    """Mux the silent simulation video with collision.wav into the final output."""
    print("\n[Muxer] Combining video + audio...")
    if not os.path.exists(SIM_RAW_VIDEO):
        print("[Muxer] No raw video to mux.")
        return False

    audio_file = "collision.wav"
    cmd = [
        "ffmpeg", "-y",
        "-i", SIM_RAW_VIDEO,
        "-i", audio_file,
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        OUTPUT_VIDEO,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # If audio mux fails, fall back to video-only copy
        print(f"[Muxer] Audio mux failed: {result.stderr.strip()[:200]}")
        print("[Muxer] Falling back to video-only output...")
        subprocess.run(
            ["ffmpeg", "-y", "-i", SIM_RAW_VIDEO, "-c:v", "copy", OUTPUT_VIDEO],
            capture_output=True,
        )

    if os.path.exists(OUTPUT_VIDEO) and os.path.getsize(OUTPUT_VIDEO) > 1024:
        size = os.path.getsize(OUTPUT_VIDEO)
        print(f"[Muxer] DONE — '{OUTPUT_VIDEO}' ({size:,} bytes)")
        # Clean up intermediate file
        if os.path.exists(SIM_RAW_VIDEO):
            os.remove(SIM_RAW_VIDEO)
        return True
    else:
        print("[Muxer] Output file missing or too small.")
        return False


def reviewer_agent(concept, code):
    """Reviews generated code against the original concept."""
    print("\n[Reviewer] Checking code against concept...")
    raw = llm_call(
        REVIEWER_PROMPT,
        f"Concept: {concept}\n\nGenerated code:\n{code}",
        temperature=0.1,
        json_mode=True,
    )
    result = json.loads(raw)
    if result.get("passed"):
        print("[Reviewer] PASSED — code matches concept.")
    else:
        issues = result.get("issues", [])
        print(f"[Reviewer] FAILED — {len(issues)} issue(s):")
        for i, issue in enumerate(issues, 1):
            print(f"  {i}. {issue}")
    return result


# ── Conductor Loop ─────────────────────────────────────────────────────────────

def run_pipeline(concept, duration, max_cycles=3):
    """Main orchestration loop that coordinates all agents."""
    # Step 1: Director breaks down the concept
    breakdown = director_agent(concept)
    generate_sfx(breakdown["sfx_prompt"])

    feedback = None  # Accumulated feedback for regeneration

    for cycle in range(1, max_cycles + 1):
        print(f"\n{'='*60}")
        print(f"PIPELINE CYCLE {cycle}/{max_cycles}")
        print(f"{'='*60}")

        # Step 2: Coder generates (or regenerates with feedback)
        visual_input = breakdown["visual_logic"]
        if feedback:
            visual_input += (
                "\n\nPREVIOUS ATTEMPT FAILED. Fix these issues:\n"
                + "\n".join(f"- {f}" for f in feedback)
            )
        code = coder_agent(visual_input, duration)

        # Step 3: Syntax validation + repair
        error = validate_syntax(code)
        if error:
            print(f"  [!] Syntax error in generated code: {error}")
            code = coder_agent_repair(code, error)
            if code is None:
                print("[Conductor] Coder could not fix syntax. Retrying full generation...")
                feedback = (feedback or []) + ["Code had unfixable syntax errors"]
                continue

        # Step 4: Reviewer checks concept alignment
        review = reviewer_agent(concept, code)
        if not review.get("passed"):
            issues = review.get("issues", ["Unknown issue"])
            feedback = issues
            print(f"[Conductor] Reviewer rejected code. Regenerating...")
            continue

        # Step 5: Tester runs the simulation and validates video output
        success, stderr = tester_agent(code, duration)
        if success:
            # Step 6: Mux audio into the final video
            if mux_audio_video():
                print(f"\n[Conductor] Pipeline completed successfully on cycle {cycle}.")
                print(f"[Conductor] Output: {os.path.abspath(OUTPUT_VIDEO)}")
                return True
            else:
                feedback = (feedback or []) + ["Video muxing failed"]
                continue

        # Runtime failure — feed error back to coder for repair
        print("[Conductor] Runtime error. Attempting repair...")
        code = coder_agent_repair(code, stderr)
        if code is not None:
            # Re-test the repaired code
            success, stderr = tester_agent(code, duration)
            if success:
                if mux_audio_video():
                    print(f"\n[Conductor] Pipeline completed (repaired) on cycle {cycle}.")
                    print(f"[Conductor] Output: {os.path.abspath(OUTPUT_VIDEO)}")
                    return True

        feedback = (feedback or []) + [f"Runtime error: {stderr[:200]}"]
        print(f"[Conductor] Cycle {cycle} failed. Retrying...")

    print(f"\n[Conductor] All {max_cycles} cycles exhausted. Pipeline failed.")
    return False


# ── Entry Point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("VIDEO GENERATION PIPELINE — Multi-Agent")
    print("=" * 60)

    config = load_config("config.yaml")
    concept = config.get("video_concept", "A bouncing ball in a box.")
    duration = config.get("duration_seconds", 30)

    success = run_pipeline(concept, duration)
    sys.exit(0 if success else 1)