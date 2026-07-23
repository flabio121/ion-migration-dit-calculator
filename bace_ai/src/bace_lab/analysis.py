from __future__ import annotations

import numpy as np

from .models import AnalysisResult, BaceRecipe, TransientRecord

ELEMENTARY_CHARGE_C = 1.602176634e-19


def _validate_record(record: TransientRecord) -> tuple[np.ndarray, np.ndarray]:
    time_s = np.asarray(record.time_s, dtype=float)
    current_a = np.asarray(record.current_a, dtype=float)
    if time_s.ndim != 1 or current_a.ndim != 1 or time_s.size != current_a.size:
        raise ValueError("time and current must be equal-length one-dimensional arrays")
    if time_s.size < 3:
        raise ValueError("transient requires at least three samples")
    if not np.all(np.isfinite(time_s)) or not np.all(np.isfinite(current_a)):
        raise ValueError("transient contains non-finite values")
    if np.any(np.diff(time_s) <= 0):
        raise ValueError("timestamps must be strictly increasing")
    return time_s, current_a


def analyze_transient(record: TransientRecord, recipe: BaceRecipe) -> AnalysisResult:
    time_s, current_a = _validate_record(record)

    baseline_count = max(3, int(round(time_s.size * recipe.baseline_fraction)))
    baseline_current_a = float(np.median(current_a[-baseline_count:]))
    ionic_current_a = current_a - baseline_current_a

    start_index = int(np.searchsorted(time_s, recipe.exclude_initial_s, side="left"))
    start_index = min(max(start_index, 0), time_s.size - 2)
    integration_time = time_s[start_index:]
    integration_current = ionic_current_a[start_index:]
    extracted_charge_c = float(np.trapz(integration_current, integration_time))

    initial_window = max(1, min(5, integration_current.size))
    initial_ionic_current_a = float(np.median(integration_current[:initial_window]))
    area_m2 = recipe.device.area_m2
    thickness_m = recipe.device.thickness_m
    areal_charge_c_m2 = extracted_charge_c / area_m2
    apparent_ion_density_m3 = abs(extracted_charge_c) / (
        ELEMENTARY_CHARGE_C * area_m2 * thickness_m
    )
    initial_current_density_a_m2 = initial_ionic_current_a / area_m2
    estimated_field_v_m = recipe.delta_voltage_v / thickness_m

    conductivity: float | None
    if abs(estimated_field_v_m) > 0:
        conductivity = initial_current_density_a_m2 / estimated_field_v_m
    else:
        conductivity = None

    head_scale = max(abs(initial_ionic_current_a), 1e-30)
    settled_ratio = float(abs(np.median(ionic_current_a[-baseline_count:])) / head_scale)

    flags: list[str] = []
    if record.metadata.get("compliance_hit"):
        flags.append("compliance_hit")
    if time_s[0] > recipe.exclude_initial_s:
        flags.append("first_sample_after_exclusion_window")
    if settled_ratio > 0.05:
        flags.append("transient_may_not_be_settled")
    if abs(extracted_charge_c) < 1e-15:
        flags.append("very_small_extracted_charge")
    if conductivity is not None and conductivity < 0:
        flags.append("conductivity_sign_check_required")

    return AnalysisResult(
        run_id=record.run_id,
        baseline_current_a=baseline_current_a,
        initial_ionic_current_a=initial_ionic_current_a,
        extracted_charge_c=extracted_charge_c,
        areal_charge_c_m2=areal_charge_c_m2,
        apparent_ion_density_m3=apparent_ion_density_m3,
        initial_current_density_a_m2=initial_current_density_a_m2,
        estimated_field_v_m=estimated_field_v_m,
        apparent_conductivity_s_m=conductivity,
        settled_ratio=settled_ratio,
        quality_flags=flags,
    )


def fit_ionic_conductivity(results: list[AnalysisResult]) -> tuple[float, float]:
    """Fit J0 = sigma * E + intercept for a voltage-step series."""

    if len(results) < 3:
        raise ValueError("at least three field points are required")
    field = np.asarray([r.estimated_field_v_m for r in results], dtype=float)
    current_density = np.asarray([r.initial_current_density_a_m2 for r in results], dtype=float)
    slope, intercept = np.polyfit(field, current_density, 1)
    return float(slope), float(intercept)
