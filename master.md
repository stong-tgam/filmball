# Video Generation Pipeline (Local AI Edition)

An automated, end-to-end workflow for generating satisfying 2D physics-based animation videos using local Large Language Models (LLMs) and Python.

## 🚀 Overview

This project leverages **Ollama** (running `gemma4:26b`) to transform a simple text concept into a fully functional, executable Python simulation. The pipeline handles everything from conceptual breakdown and procedural audio generation to complex physics code synthesis.

## 🤖 Multi-Agent Orchestration Workflow

The project is evolving towards a self-correcting, multi-agent architecture designed to ensure high-fidelity video generation through an iterative feedback loop.

### The Agent Squad

1.  **The Coder Agent (The Fixer)**
    *   **Focus**: Debugging and Code Repair.
    
    Analyzes tracebacks from `generated_simulation.py` and applies precise fixes to the generated Python code, ensuring runtime stability.

2.  **The Tester Agent (The Executor)**
    *   **Focus**: Pipeline Validation.
    
    Responsible for running `video_generator_pipeline.py`. It ensures that all stages—from concept breakdown to audio synthesis—complete without breaking the orchestration logic.

3.  **The Video Reviewer Agent (The Critic)**
    *   **Focus**: Quality Assurance & Visual Verification.
    
    Inspects the final simulation output and compares it against the original user concept. If a discrepancy is found (e.g., incorrect shapes or missing effects), it generates a detailed feedback report for regeneration.

4.  **The Conductor Agent (The Orchestrator)**
    *   **Focus**: Workflow Management & Feedback Loop.
    
    The central intelligence that manages the lifecycle of all other agents. It receives error reports from the **Reviewer** and instructs the pipeline to regenerate code with updated instructions, driving the loop until perfection is achieved.

## 🛠️ Tech Stack

- **Orchestration**: Python 3.10+
- **LLM Engine**: [Ollama](httpss://ollama.com/) (Model: `gemma4:26 
- **Physics Engine**: [Pymunk](https://github.com/ochprydz/Pymunk) (7.0+)
- **Graphics & Audio**: [Pygame / Pygame-ce](https://www.pygame.org/)
- **Configuration**: YAML
- **Dependencies**: `openai` (for Ollama API), `pyyaml`, `numpy`

## 📂 Project Structure

- `video_generator_pipeline.py`: The main orchestration engine that manages the 4-step pipeline.
- `config.yaml`: User configuration file containing the video concept and duration.
- `collision.wav`: (Generated) A procedurally created audio asset for physics impacts.
- `generated_simulation.py`: (Generated) The final, executable Python script containing the animation logic.

## ⚙️ Setup & Execution

### 1. Prerequisites
Ensure [Ollama](https://ollama.com/) is installed and the model is pulled:
```bash
ollama pull gemma4:26b
```

### 2. Installation
Install the required Python dependencies:
```bash
pip install openai pygame pymunk pyyaml
```

### 3. Configuration
Edit `config.yaml` to define your vision:
```yaml
video_concept: "A glowing neon blue sphere bouncing inside a hexagon"
duration_seconds: 15
```

### 4. Run the Pipeline
Execute the main script:
```bash
py video_generator_pipeline.py
```

## 🧠 Implementation Notes & Lessons Learned

- **Pymunk 7+ Compatibility**: The pipeline was updated to use `space.on_collision` instead of the deprecated `add_collision_handler` to ensure compatibility with modern Pymunk versions.
- **Audio Integrity**: Transitioned from writing dummy text to generating real PCM byte streams using the `wave` and `struct` modules, preventing Pygame loading errors.
- **Prompt Engineering**: The system prompt for the LLM is strictly tuned to output raw Python code without markdown blocks to prevent execution failures during the `subprocess` phase.
