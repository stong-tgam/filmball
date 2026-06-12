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
You are an expert Python developer using Pygame and Pymunk 7.0+. Write an executable Python script for a physics video.

CRITICAL REQUIREMENTS:
1. Window must be 720x1280 (vertical format).
2. Use Pymunk for perfect elastic collisions (elasticity = 1.0) and zero gravity.
3. Include an automated exit condition after EXACTLY {duration} seconds that cleanly closes the Pygame window using sys.exit().
4. You MUST use pygame.mixer.Sound('collision.wav') and play it on every Pymunk collision.
5. VERY IMPORTANT PYMUNK 7 SYNTAX: You MUST NOT use `space.add_collision_handler`. Use `space.on_collision(0, 0, begin=your_callback_function)`.
6. THE COLLISION CALLBACK FUNCTION signature MUST be exactly: `def collision_begin(arbiter, space, data):` or `def collision_begin(arbiter, space):`. Do NOT omit the `arbiter` or `space` arguments.
7. NEVER attach a shape directly to the space. Static boundary shapes MUST be attached to `space.static_body` (e.g., `pymunk.Segment(space.static_body, start, end, radius)`). Dynamic shapes MUST be attached to a `pymunk.Body`.
8. Write standard, clean Python. Do not use improper type hints like 'pygame variable_name'.
9. Output raw, executable Python code only. No markdown formatting.
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
Check whether the code correctly implements the concept.

Verify:
1. Are the correct shapes present (e.g., sphere, triangle, hexagon)?
2. Are visual effects described in the concept implemented (e.g., glowing, neon, colors)?
3. Does the physics behavior match (e.g., bouncing, spawning, gravity)?
4. Does the code look like it will run without runtime errors?

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


def tester_agent(code):
    """Runs the generated code and returns (success, stderr)."""
    print("\n[Tester] Executing simulation...")
    with open("generated_simulation.py", "w", encoding="utf-8") as f:
        f.write(code)

    result = subprocess.run(
        [sys.executable, "generated_simulation.py"],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        print("[Tester] Simulation completed successfully.")
        return True, ""
    else:
        stderr = result.stderr.strip()
        # Extract the last traceback for a concise error
        lines = stderr.splitlines()
        short = "\n".join(lines[-15:]) if len(lines) > 15 else stderr
        print(f"[Tester] Runtime error (exit {result.returncode}):\n{short}")
        return False, short


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

        # Step 5: Tester runs the simulation
        success, stderr = tester_agent(code)
        if success:
            print(f"\n[Conductor] Pipeline completed successfully on cycle {cycle}.")
            return True

        # Runtime failure — feed error back to coder for repair
        print("[Conductor] Runtime error. Attempting repair...")
        code = coder_agent_repair(code, stderr)
        if code is not None:
            # Re-test the repaired code
            success, stderr = tester_agent(code)
            if success:
                print(f"\n[Conductor] Pipeline completed (repaired) on cycle {cycle}.")
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