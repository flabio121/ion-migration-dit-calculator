# Legacy LabVIEW BACE Program Review

## Scope

This document records a read-only static inspection of the uploaded archive `BACE keithley prog (2).zip`.

No VI was executed, no instrument session was opened, and no hardware command was sent. The review used archive inspection, file signatures, hashes, visible strings, resource identifiers, and dependency names embedded in the LabVIEW files.

The `.vi` format is a proprietary LabVIEW resource container. The exact block-diagram wiring, numeric defaults, loop order, and hidden driver commands still need to be verified in LabVIEW or through an exported block diagram before physical-device use.

## Archive inventory

| File | Size | SHA-256 |
|---|---:|---|
| `transient_j_of_V_with_prebias_integratedC_v2.vi` | 234,516 bytes | `447f74a9517522df06b44b0475ce907b4a4533cc3e5efbe5436a6e2fe038c020` |
| `transient_j_of_V_with_prebias_integratedC_v2a_fixedREAD.vi` | 234,587 bytes | `a19cd9aa3cb684e83522f2465b5a321398cfc53cefe609e9b07d8da7b25158a5` |
| `transient_j_of_V_with_prebias_integratedC_wKeithley617.vi` | 224,594 bytes | `91af09db039fd7e0cae583da1358179e9e982d2e6a69f94e005d76b68ca73b1a` |

All three files identify as National Instruments LabVIEW Virtual Instruments.

## High-confidence findings

### 1. The intended measurement is a prebias voltage-step transient with integrated charge

The filenames establish the main workflow:

- current density as a function of time after a voltage change
- a prebias or preconditioning stage
- integrated charge or capacitance output

This is consistent with a BACE-style measurement, but the exact sign convention and integration boundaries are not recoverable from filenames alone.

### 2. The two main versions use the NI Keithley 24XX LabVIEW driver

Visible dependency names include:

- `Keithley 24XX.lvlib/Initialize.vi`
- `Configure Measurement.vi`
- `Configure Output.vi`
- `Enable Output.vi`
- `Read (Single Point).vi`
- `Configure Settling Delay.vi`
- `Configure Autozero.vi`
- `Configure NPLC Caching.vi`
- `Configure Integration Filter.vi`
- `Configure Concurrent Measurements.vi`
- `Close.vi`

The program therefore delegates low-level SCPI to the NI instrument-driver VIs. Raw SCPI strings are not visible in the uploaded files.

### 3. The acquisition likely uses repeated single-point reads

The dependency `Read (Single Point).vi` is present, while no visible trigger-model, trace-buffer, or TSP function names were found.

The most likely architecture is therefore:

1. configure source and measurement settings
2. apply a prebias
3. change the source condition
4. repeatedly call a single-point read inside a LabVIEW loop
5. build time/current arrays in the host program
6. integrate the resulting trace

This is an inference from the dependency graph and must be confirmed from the block diagram.

For the Keithley 2460 port, this pattern should not be copied literally. Host-timed single reads introduce USB, VISA, OS, and application-loop jitter. The replacement should use the 2460 internal trigger model or a bounded TSP script with timestamped buffer acquisition.

### 4. The program explicitly configures timing and measurement-quality controls

The dependency set shows that the original author considered:

- settling delay
- autozero
- NPLC
- digital or integration filtering
- concurrent measurement configuration

These settings must become explicit fields in the new recipe and raw-data metadata. They must not remain hidden inside an instrument-driver default.

### 5. The original program performs numerical integration in LabVIEW

`Uneven Numeric Integration.vi` is embedded as a dependency.

This strongly suggests that the current/time samples are not assumed to be perfectly evenly spaced. The Python implementation should preserve the real timestamps and integrate against the timestamp vector rather than multiplying a summed current by a nominal interval.

The analysis module should use trapezoidal integration of the baseline-corrected current and retain:

- raw timestamps
- actual sample intervals
- excluded electronic/capacitive region
- baseline region
- integration start and stop
- signed and absolute charge

### 6. The VIs read external delimited files

Dependencies include:

- `Read Delimited Spreadsheet.vi`
- `Read Delimited Spreadsheet (DBL).vi`
- file-dialog and file-existence utilities

The files may load a voltage recipe, timing table, calibration, or previous data. The exact file schema is unknown until the front panel and diagram are opened.

The new system should replace implicit spreadsheet inputs with a versioned typed recipe, while optionally supporting import of the original file format after it is identified.

### 7. `v2a_fixedREAD` should be treated as the preferred reference

The archive includes both `v2` and `v2a_fixedREAD`. The latter is 71 bytes larger and appears to be a revised compiled VI.

The name indicates that a read-path bug was corrected. Because binary LabVIEW resources change broadly after a block-diagram edit, a binary diff cannot identify the exact logical change.

The port should use `v2a_fixedREAD` as the primary behavioral reference and compare its block diagram against `v2` specifically around:

- read ordering
- returned measurement channel
- current versus voltage field selection
- array indexing
- read timing
- status/error handling

### 8. The files are not standalone

They reference NI driver libraries and standard/custom subVIs that are not included in the ZIP. The VIs may open with missing dependencies unless the corresponding LabVIEW instrument driver and utility libraries are installed.

A complete reproducibility package should eventually include:

- exact LabVIEW version
- exact Keithley 24XX driver version
- all custom subVIs
- any external recipe/calibration files
- screenshots or exports of the front panel and block diagram

### 9. The source diagram appears to be present, but protection status is unresolved

The LabVIEW resource containers include both front-panel and block-diagram heap resources (`FPHb` and `BDHb`). This indicates the files are not simple stripped executables.

A `BDPW` resource is also present. Its presence alone does not prove that the diagram is password locked. LabVIEW must be used to determine whether the block diagram can be opened normally.

### 10. The `wKeithley617` filename needs clarification

The third file is named for a Keithley 617, but its visible dependencies still include the Keithley 24XX driver library and single-point read functions.

Possible explanations include:

- the 617 is used through an additional path that is not obvious from visible strings
- the file name reflects a historical adaptation
- a 24XX source meter and 617 electrometer were both involved
- the VI was copied and renamed without fully replacing the driver

Do not infer the actual wiring or instrument roles from the filename. This variant must be opened in LabVIEW before it influences the 2460 design.

## Compatibility conclusion for the Keithley 2460

The uploaded VIs are useful as a scientific and workflow reference, but they are not a direct 2460 implementation.

The Keithley 2460 belongs to a newer touchscreen SourceMeter platform. Even where familiar SCPI commands overlap, the old 24XX driver abstraction, return fields, trigger behavior, buffering, ranges, and status handling should not be assumed compatible.

The new adapter should be written specifically for the 2460 and should implement:

- exact model and firmware identity check
- explicit source-voltage polarity conversion
- fixed current range for each transient
- approved current compliance
- explicit NPLC, autozero, and filter settings
- internal timestamped acquisition
- source readback where available
- compliance/status capture per run
- error-queue capture
- output-off and relay isolation in every exit path
- deterministic abort behavior

## Porting strategy

### Preserve from the legacy program

- prebias/preconditioning concept
- user-defined voltage and timing recipe
- explicit settling, NPLC, autozero, and filtering controls
- real timestamp handling
- uneven-time numerical integration
- file-backed reproducibility
- current-density and integrated-charge outputs

### Replace rather than copy

- NI 24XX driver dependency
- host-timed single-point acquisition
- hidden instrument defaults
- untyped spreadsheet configuration
- direct GUI ownership of hardware
- implicit sign and unit conventions

### Add for AI-safe operation

- typed recipe schema
- deterministic safety-policy validation
- exact recipe approval hash
- instrument adapter with no generic raw-command method
- audit trail for every proposal, approval, run, error, and result
- simulation and RC dummy-load validation
- campaign stop conditions
- independent physical emergency stop

## Information still required before hardware code

1. Open `transient_j_of_V_with_prebias_integratedC_v2a_fixedREAD.vi` in LabVIEW.
2. Capture the complete front panel.
3. Export or screenshot the complete block diagram, including every case and sequence frame.
4. Record all default control values and units.
5. Identify the exact LabVIEW and Keithley driver versions.
6. Resolve every missing subVI.
7. Identify any delimited input-file format and provide one example.
8. Document the physical wiring and current/voltage sign convention.
9. Provide the Keithley 2460 firmware version and connection mode.
10. Provide one accepted legacy BACE trace and manually calculated charge result.
11. Define lab-approved voltage, compliance, duration, and energized-time limits.

## Immediate next implementation milestone

Do not connect a solar cell yet.

The next code milestone should be a `Keithley2460BaceAdapter` whose acquisition method is exercised only against a resistor and an RC dummy load. The adapter should return a `TransientRecord` containing real timestamps, current, source settings, status flags, identity, and error information. Only after the RC time constant, polarity, teardown, abort, and compliance behavior are verified should a supervised device recipe be enabled.
