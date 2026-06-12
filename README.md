# Filmball — AI Video Generation Pipeline

An automated pipeline that turns text descriptions into physics-based ball-bounce animation videos using local LLMs and Python.

## How It Works

Describe a concept in plain English → a local LLM converts it to a scene config → a fixed rendering engine produces the video.

```
"A glowing neon blue ball inside a spinning triangle"  →  output.mp4
```

### Architecture: Fixed Engine + LLM as Config Generator

The LLM does **not** generate code. It generates a JSON scene configuration, which a fixed, tested rendering engine uses to produce the video. This eliminates syntax errors, API misuse, and broken code entirely.

```
config.yaml → LLM → scene.json → simulation_engine.py → recorder.py → output.mp4
```

### What the LLM produces (example):

```json
{
  "container": {
    "shape": "triangle",
    "radius": 300,
    "rotation_speed": 0.02,
    "color": [0, 200, 255],
    "glow": true
  },
  "balls": {
    "count": 1,
    "radius": 20,
    "color": [0, 255, 255],
    "glow": true,
    "speed": 300
  },
  "physics": { "elasticity": 1.0, "gravity": [0, 0] },
  "rules": { "on_collision": "spawn_ball", "max_balls": 50 },
  "background_color": [5, 5, 15]
}
```

Invalid values are automatically clamped to safe ranges. Even a bad LLM response produces a valid video.

## Project Structure

```
filmball/
├── video_generator_pipeline.py   # Pipeline: LLM → config → engine → mux
├── simulation_engine.py          # Fixed Pygame/Pymunk renderer
├── recorder.py                   # Video recorder (patches pygame.display.flip)
├── config.yaml                   # User concept + duration
├── scene.json                    # LLM-generated scene config (auto-created)
├── collision.wav                 # Generated sound effect (auto-created)
└── output.mp4                    # Final video output (auto-created)
```

## Setup

### Prerequisites

- Python 3.10+
- [Ollama](https://ollama.com/) with a model pulled
- ffmpeg installed (`brew install ffmpeg` on macOS)

### Install Dependencies

```bash
pip install openai pygame pymunk pyyaml
```

### Pull the LLM Model

```bash
ollama pull gemma4:26b
```

To use a different model, change `LOCAL_MODEL` in `video_generator_pipeline.py`.

## Usage

### 1. Edit `config.yaml`

```yaml
video_concept: "A glowing neon blue ball trapped inside a large spinning triangle. Every time the ball hits a wall, a new ball spawns."
duration_seconds: 5
```

### 2. Run the Pipeline

```bash
python3 video_generator_pipeline.py
```

The pipeline will:

1. Send your concept to the LLM → get a scene config (JSON)
2. Sanitize and validate the config
3. Generate a collision sound effect
4. Render the simulation with the fixed engine while recording frames
5. Mux video + audio into `output.mp4`

### 3. Run the Engine Standalone (for testing)

```bash
python3 simulation_engine.py scene.json 5
```

## Supported Features

### Container Shapes

`circle`, `triangle`, `square`, `pentagon`, `hexagon`, `octagon`, `star`, `rectangle`

### Collision Rules

| Rule             | Effect                             |
| ---------------- | ---------------------------------- |
| `spawn_ball`     | New ball spawns at collision point |
| `change_color`   | Ball changes to a random color     |
| `increase_speed` | Ball speeds up by 5% (capped)      |
| `none`           | No special effect                  |

### Other

- Container rotation (configurable speed)
- Neon glow effects on container and balls
- Zero gravity or custom gravity
- Configurable elasticity, ball count, max balls

## Configuration

| Field              | Description                                | Default  |
| ------------------ | ------------------------------------------ | -------- |
| `video_concept`    | Plain English description of the animation | Required |
| `duration_seconds` | Length of the video in seconds             | `10`     |

## Supported Models

Any Ollama-compatible model works. Since the LLM only outputs JSON (not code), even small models work well:

| Model                | Quality  | Notes                       |
| -------------------- | -------- | --------------------------- |
| `gemma4:26b`         | Good     | Default                     |
| `qwen2.5-coder:14b+` | Good     | Strong at structured output |
| `llama3.1:8b`        | Adequate | Smallest viable option      |
