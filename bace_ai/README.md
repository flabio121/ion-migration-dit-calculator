# BACE AI Lab Controller

Simulation-first framework for bias-assisted charge extraction (BACE) experiments with a future Keithley 2460 hardware adapter and an LLM supervisory layer.

## Design goal

Let an LLM perform the planning, analysis, troubleshooting, and bounded experiment selection that a trained operator would normally perform, without giving the model unrestricted access to the source meter, relays, operating system, or safety policy.

## Current status

The scaffold currently provides:

- typed BACE recipes and transient records
- hard safety-policy validation
- exact recipe hashing for human hardware approvals
- hardware disabled by default
- deterministic controller state machine
- guaranteed output-off and relay-disconnect teardown
- simulated ionic/electronic transient instrument
- charge, apparent ion-density, initial-current, and conductivity analysis
- allowlisted AI tools with no raw SCPI or VISA access
- audit events for every state transition and result

It does **not** yet control a physical Keithley. The first hardware implementation must be tested against an RC dummy load before a solar-cell device is connected.

## Proposed trust boundary

```text
LLM planner / analyst
        |
        | typed tool calls only
        v
LabToolbox
        |
        | recipe validation + approval check
        v
BaceController
        |
        | bounded instrument operations only
        v
Keithley2460BaceAdapter / relay adapter
```

The LLM never receives the VISA session or a generic `write()` method.

## Development workflow

```bash
cd bace_ai
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

## Planned hardware sequence

1. Verify output is off and source is at the configured safe voltage.
2. Isolate all relay channels.
3. Connect the selected pixel.
4. Configure fixed current range, NPLC, autozero, filtering, compliance, and buffer fields.
5. Apply the preconditioning voltage for the approved duration.
6. Run the voltage step and timestamped acquisition inside the 2460 trigger model or TSP script.
7. Return to 0 V, turn output off, and isolate the pixel.
8. Transfer the complete buffer and instrument error queue.
9. Analyze and persist raw data, recipe, policy, approval, code version, and audit log.

## Autonomy levels

- **Level 0 — analysis only:** Import and analyze existing BACE data.
- **Level 1 — simulation:** LLM can autonomously design and run simulated experiments.
- **Level 2 — supervised hardware:** Every exact recipe requires a human approval token.
- **Level 3 — bounded campaign:** A human approves a narrow experiment envelope; the LLM can choose recipes only inside it, with automatic stop conditions.
- **Level 4 — unattended operation:** Not recommended until extensive validation, independent interlocks, and lab approval exist.

The initial target is Level 2, followed by a carefully validated Level 3.
