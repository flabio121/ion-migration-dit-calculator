from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict, dataclass, field

from .models import BaceRecipe, HardwareApproval, RunMode


class SafetyViolation(ValueError):
    def __init__(self, violations: list[str]):
        self.violations = violations
        super().__init__("; ".join(violations))


@dataclass(frozen=True)
class SafetyPolicy:
    """Hard experiment limits. Hardware is disabled until explicitly approved."""

    hardware_enabled: bool = False
    max_abs_voltage_v: float = 1.5
    max_voltage_step_v: float = 1.5
    max_current_compliance_a: float = 0.010
    max_precondition_duration_s: float = 120.0
    max_capture_duration_s: float = 60.0
    min_sample_interval_s: float = 5e-4
    max_sample_interval_s: float = 1.0
    max_points: int = 100_000
    max_repetitions: int = 10
    min_rest_duration_s: float = 1.0
    min_area_cm2: float = 1e-4
    max_area_cm2: float = 10.0
    min_thickness_nm: float = 50.0
    max_thickness_nm: float = 5_000.0
    allowed_pixels: tuple[str, ...] = field(default_factory=tuple)

    def validate(self, recipe: BaceRecipe, mode: RunMode) -> list[str]:
        v: list[str] = []
        values = (recipe.precondition_voltage_v, recipe.extraction_voltage_v)
        if any(abs(value) > self.max_abs_voltage_v for value in values):
            v.append(f"absolute voltage exceeds {self.max_abs_voltage_v:g} V")
        if abs(recipe.delta_voltage_v) > self.max_voltage_step_v:
            v.append(f"voltage step exceeds {self.max_voltage_step_v:g} V")
        if not 0 < recipe.current_compliance_a <= self.max_current_compliance_a:
            v.append(f"current compliance must be within (0, {self.max_current_compliance_a:g}] A")
        if not 0 <= recipe.precondition_duration_s <= self.max_precondition_duration_s:
            v.append("preconditioning duration is outside policy")
        if not 0 < recipe.acquisition.capture_duration_s <= self.max_capture_duration_s:
            v.append("capture duration is outside policy")
        if not self.min_sample_interval_s <= recipe.acquisition.sample_interval_s <= self.max_sample_interval_s:
            v.append("sample interval is outside policy")
        if recipe.acquisition.point_count > self.max_points:
            v.append(f"point count exceeds {self.max_points}")
        if not 1 <= recipe.repetitions <= self.max_repetitions:
            v.append("repetition count is outside policy")
        if recipe.repetitions > 1 and recipe.rest_duration_s < self.min_rest_duration_s:
            v.append(f"rest duration must be at least {self.min_rest_duration_s:g} s")
        if not self.min_area_cm2 <= recipe.device.area_cm2 <= self.max_area_cm2:
            v.append("device area is outside policy")
        if not self.min_thickness_nm <= recipe.device.thickness_nm <= self.max_thickness_nm:
            v.append("device thickness is outside policy")
        if recipe.exclude_initial_s < 0 or recipe.exclude_initial_s >= recipe.acquisition.capture_duration_s:
            v.append("initial exclusion window must be inside the capture")
        if not 0.02 <= recipe.baseline_fraction <= 0.5:
            v.append("baseline fraction must be between 0.02 and 0.5")
        if recipe.acquisition.current_range_a < recipe.current_compliance_a:
            v.append("current range must be at least the compliance setting")
        if self.allowed_pixels and recipe.pixel not in self.allowed_pixels:
            v.append(f"pixel {recipe.pixel!r} is not allowlisted")
        if mode is RunMode.HARDWARE and not self.hardware_enabled:
            v.append("hardware execution is disabled by policy")
        return v

    def require_valid(self, recipe: BaceRecipe, mode: RunMode) -> None:
        violations = self.validate(recipe, mode)
        if violations:
            raise SafetyViolation(violations)

    def to_dict(self) -> dict:
        return asdict(self)


def recipe_digest(recipe: BaceRecipe) -> str:
    payload = json.dumps(recipe.to_dict(), sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


def validate_hardware_approval(recipe: BaceRecipe, approval: HardwareApproval | None) -> None:
    violations: list[str] = []
    if approval is None:
        violations.append("hardware run requires a human approval object")
    else:
        if approval.recipe_digest != recipe_digest(recipe):
            violations.append("approval does not match the exact recipe")
        if not approval.approved_by.strip():
            violations.append("approval must identify the human approver")
        if approval.expires_unix_s <= time.time():
            violations.append("hardware approval has expired")
    if violations:
        raise SafetyViolation(violations)
