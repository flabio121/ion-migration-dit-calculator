# BACE AI Lab Controller Roadmap

## Phase 0 — Requirements and source reconciliation

Inputs still needed:

- original `BACE keithley prog.zip`
- current local Keithley 2460 GUI source, if it differs from `MultiplexSolarSim`
- device wiring and polarity diagram
- approved device voltage/current limits
- device areas and absorber thicknesses
- Keithley firmware version and connection mode
- relay model and channel mapping
- example raw BACE files and expected results

Deliverables:

- command crosswalk from the original program to the new adapter
- verified sign convention
- lab-approved safety policy
- reference BACE recipe and expected transient regions

Exit gate: no physical-device testing until the wiring, sign convention, and limits are documented.

## Phase 1 — Simulation and offline analysis

Build:

- synthetic electronic + ionic transient generator
- baseline selection, spike exclusion, charge integration, apparent ion density
- initial-current versus field fitting for ionic conductivity
- uncertainty and repeatability metrics
- structured JSON/CSV/NPZ export
- regression fixtures from known datasets

Exit gate:

- synthetic charge recovered within 2%
- conductivity slope recovered within 5%
- all safety-policy tests pass
- complete recipe and audit log can reproduce every analysis

## Phase 2 — Keithley 2460 adapter, dummy load only

Build:

- VISA discovery with exact model verification
- fixed current range and compliance configuration
- source polarity conversion isolated in one tested function
- 2460 internal trigger/buffer or TSP acquisition
- relative timestamps and source readback
- error-queue capture
- output-off and relay isolation in all exit paths
- operator emergency-stop path

Test loads:

- resistor for polarity/current verification
- RC network for step timing and transient-shape verification

Exit gate:

- measured resistor agrees with expected value within instrument/load tolerance
- RC time constant agrees with reference within 5%
- no missing or nonmonotonic timestamps
- output and relays return to safe state after success, timeout, exception, and abort
- compliance and range events are detected and flagged

## Phase 3 — Supervised device measurements

Build:

- GUI/CLI recipe review screen
- exact-recipe human approval token
- one device/pixel per approval
- preflight checklist
- raw data package and automatic analysis
- repeatability checks and degradation stop conditions

Initial operation:

- one conservative recipe
- one device
- dark measurement
- human present
- no automatic follow-up recipe

Exit gate:

- repeatable transient shape and charge
- polarity reverses consistently with field direction
- baseline and integration windows are stable
- results agree with manual analysis and reference code

## Phase 4 — AI-supervised experiment selection

The LLM may:

- inspect prior results
- propose the next recipe inside an approved envelope
- adjust capture duration, fixed range, and repetitions
- request additional field points
- stop a campaign when quality or degradation limits are reached
- generate analysis summaries and experiment rationale

The LLM may not:

- send raw SCPI or VISA commands
- alter safety limits
- create its own approval
- bypass rest periods or stop conditions
- select unapproved relay channels
- run after a compliance, wiring, or identity fault

Exit gate:

- campaign planner passes simulated fault-injection tests
- every action is attributable and reproducible
- independent watchdog can force output off without the LLM

## Phase 5 — Bounded autonomous discovery

A human approves a campaign envelope containing:

- devices and pixels
- voltage and current limits
- recipe parameter ranges
- maximum runs and total energized time
- degradation and repeatability thresholds
- allowed adaptation rules
- campaign expiration

The AI selects experiments only within that signed envelope. A separate deterministic policy engine approves or rejects every proposed run.

Exit gate: formal lab review after substantial supervised operation. Unrestricted unattended operation is outside the initial scope.
