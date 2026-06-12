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

# 1. Local Ollama Client - Updated for Gemma4:26b
local_client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
LOCAL_MODEL = "gemma4:26b"

def load_config(filepath="config.yaml"):
    """Reads the YAML configuration file."""
    print(f"Loading configuration from {filepath}...")
    try:
        with open(filepath, 'r') as file:
            return yaml.safe_load(file)
    except FileNotFoundError:
        print(f"Error: Could not find {filepath}. Please create it first.")
        sys.exit(1)

def breakdown_concept(user_idea):
    print("\n[1/4] Breaking down the concept into visual and audio components...")
    
    system_prompt = """
    You are a technical director. 
    1. Break the user's concept into a JSON object with keys "visual_logic" and "sfx_prompt".
    2. "sfx_prompt" MUST be a extremely concise, descriptive sound effect name (max 5 words). 
       Example: "Glass ping reverb", "Metallic hollow thud".
    3. NEVER use sentences, descriptions, or explanations in the SFX prompt.
    4. STRICTLY AVOID any character repetition or stuttering.
    Return ONLY valid JSON.
    """
    
    response = local_client.chat.completions.create(
        model=LOCAL_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_idea}
        ],
        temperature=0.1, # Lowered to 0.1 to completely prevent word-repetition loops
        response_format={"type": "json_object"}
    )
    
    return json.loads(response.choices[0].message.content.strip())

def generate_sfx(sfx_prompt):
    print(f"[2/4] Generating audio setup. SFX Prompt: '{sfx_prompt}'")
    # Creates a valid (but simple) sine wave WAV file with an envelope so it sounds like a real impact
    sample_rate = 44100
    duration = 0.5  # Increased duration to 0.5s for a more substantial sound
    frequency = 440.0  # A4 note
    num_samples = int(sample_rate * duration)
    
    with wave.open("collision.wav", "w") as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        
        for i in range(num_samples):
            t = i / sample_rate
            # Sine wave with exponential decay envelope to simulate an impact/decaying sound
            envelope = math.exp(-10 * t) 
            sample = int(32767.0 * math.sin(2.0 * math.pi * frequency * t) * envelope)
            wav_file.writeframesraw(struct.pack('<h', sample))

def verify_audio_file(filepath):
    print(f"[Verification] Checking if {filepath} is a valid WAV file...")
    try:
        with wave.open(filepath, "rb") as f:
            params = f.getparams()
            print(f"  [OK] Valid WAV found: {params}")
    except Exception as e:
        print(f"  [ERROR] Audio verification failed for {filepath}: {e}")
        sys.exit(1)

def generate_physics_code(visual_logic, duration):
    print(f"\n[3/4] Writing Pygame/Pymunk script for a {duration}-second video...")
    
    system_prompt = f"""
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
    
    response = local_client.chat.completions.create(
        model=LOCAL_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": visual_logic}
        ],
        temperature=0.1
    )
    
    raw_code = response.choices[0].message.content.strip()
    if raw_code.startswith("```"):
        raw_code = re.sub(r'^```[a-zA-Z]*\n|```$', '', raw_code, flags=re.MULTILINE)
    return raw_code

def execute_simulation(code_string):
    print("[4/4] Launching the simulation engine...")
    with open("generated_simulation.py", "w", encoding="utf-8") as f:
        f.write(code_string)
        
    try:
        subprocess.run([sys.executable, "generated_simulation.py"], check=True)
        print("\nSimulation Finished!")
    except subprocess.CalledProcessError as e:
        print(f"\nExecution Error: {e}")

if __name__ == "__main__":
    print("=" * 60)
    print("VIDEO GENERATION PIPELINE")
    print("=" * 60)

    config = load_config("config.yaml")
    concept = config.get("video_concept", "A bouncing ball in a box.")
    duration = config.get("duration_seconds", 30)
    
    breakdown = breakdown_concept(concept)
    print(f"Breakdown Output: {json.dumps(breakdown, indent=4)}")
    generate_sfx(breakdown["sfx_prompt"])
    verify_audio_file("collision.wav")
    
    code = generate_physics_code(breakdown["visual_logic"], duration)
    execute_simulation(code)