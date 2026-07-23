from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from math import ceil
from typing import Any


class RunMode(str, Enum):
    SIMULATION = "simulation"
    HARDWARE = "hardware"


class ControllerState(str, Enum):
    IDLE = "idle"
    VALIDATING = "validating"
    PRECONDITIONING = "preconditioning"
    ACQUIRING = "acquiring"
    ANALYZING = "analyzing"
    COMPLETE = "complete"
    ABORTED = "aborted"
    ERROR = "error"


@dataclass(frozen=True)
class DeviceGeometry:
    area_cm2: float
    thickness_nm: float
    label: str = "device"

    @property
    def area_m2(self) -> float:
        return self.area_cm2 * 1e-4

    @property
    def thickness_m(self) -> float:
        return self.thickness_nm * 1e-9


@dataclass(frozen=True)
class AcquisitionSettings:
    sample_interval_s: float
    capture_duration_s: float
    current_range_a: float
    nplc: float = 0.01
    autozero_enabled: bool = False
    filter_enabled: bool = False

    @property
    def point_count(self) -> int:
        return max(2, ceil(self.capture_duration_s / self.sample_interval_s) + 1)


@dataclass(frozen=True)
class BaceRecipe:
    recipe_id: str
    device: DeviceGeometry
    precondition_voltage_v: float
    extraction_voltage_v: float
    precondition_duration_s: float
    rest_duration_s: float
    repetitions: int
    current_compliance_a: float
    acquisition: AcquisitionSettings
    pixel: str | None = None
    exclude_initial_s: float = 1e-4
    baseline_fraction: float = 0.15
    tags: dict[str, str] = field(default_factory=dict)

    @property
    def delta_voltage_v(self) -> float:
        return self.extraction_voltage_v - self.precondition_voltage_v

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class HardwareApproval:
    approval_id: str
    recipe_digest: str
    approved_by: str
    expires_unix_s: float
    single_use: bool = True


@dataclass
class TransientRecord:
    run_id: str
    recipe_id: str
    mode: RunMode
    time_s: list[float]
    current_a: list[float]
    source_voltage_v: list[float]
    instrument_id: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AnalysisResult:
    run_id: str
    baseline_current_a: float
    initial_ionic_current_a: float
    extracted_charge_c: float
    areal_charge_c_m2: float
    apparent_ion_density_m3: float
    initial_current_density_a_m2: float
    estimated_field_v_m: float
    apparent_conductivity_s_m: float | None
    settled_ratio: float
    quality_flags: list[str] = field(default_factory=list)


@dataclass
class ExperimentResult:
    recipe: BaceRecipe
    records: list[TransientRecord]
    analyses: list[AnalysisResult]
    state: ControllerState
    audit_events: list[dict[str, Any]]
