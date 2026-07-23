import time

import pytest

from bace_lab.models import (
    AcquisitionSettings,
    BaceRecipe,
    DeviceGeometry,
    HardwareApproval,
    RunMode,
)
from bace_lab.safety import (
    SafetyPolicy,
    SafetyViolation,
    recipe_digest,
    validate_hardware_approval,
)


def recipe(**overrides):
    values = {
        "recipe_id": "test",
        "device": DeviceGeometry(area_cm2=0.09, thickness_nm=500),
        "precondition_voltage_v": 1.0,
        "extraction_voltage_v": 0.0,
        "precondition_duration_s": 5.0,
        "rest_duration_s": 2.0,
        "repetitions": 2,
        "current_compliance_a": 0.005,
        "acquisition": AcquisitionSettings(
            sample_interval_s=0.001,
            capture_duration_s=2.0,
            current_range_a=0.01,
        ),
    }
    values.update(overrides)
    return BaceRecipe(**values)


def test_simulation_recipe_is_valid():
    SafetyPolicy().require_valid(recipe(), RunMode.SIMULATION)


def test_hardware_is_disabled_by_default():
    with pytest.raises(SafetyViolation, match="hardware execution is disabled"):
        SafetyPolicy().require_valid(recipe(), RunMode.HARDWARE)


def test_overvoltage_is_rejected():
    violations = SafetyPolicy().validate(
        recipe(precondition_voltage_v=2.0), RunMode.SIMULATION
    )
    assert any("absolute voltage" in item for item in violations)


def test_approval_is_bound_to_exact_recipe():
    approved = recipe()
    approval = HardwareApproval(
        approval_id="approval-1",
        recipe_digest=recipe_digest(approved),
        approved_by="human.operator",
        expires_unix_s=time.time() + 60,
    )
    validate_hardware_approval(approved, approval)

    changed = recipe(extraction_voltage_v=-0.1)
    with pytest.raises(SafetyViolation, match="does not match"):
        validate_hardware_approval(changed, approval)
