import numpy as np

from bace_lab.analysis import analyze_transient, fit_ionic_conductivity
from bace_lab.models import AcquisitionSettings, BaceRecipe, DeviceGeometry
from bace_lab.instruments.simulated import SimulatedBaceInstrument


def make_recipe(recipe_id: str = "test", extraction_voltage_v: float = 0.0):
    return BaceRecipe(
        recipe_id=recipe_id,
        device=DeviceGeometry(area_cm2=0.09, thickness_nm=500),
        precondition_voltage_v=1.0,
        extraction_voltage_v=extraction_voltage_v,
        precondition_duration_s=5.0,
        rest_duration_s=2.0,
        repetitions=1,
        current_compliance_a=0.005,
        acquisition=AcquisitionSettings(
            sample_interval_s=0.001,
            capture_duration_s=3.0,
            current_range_a=0.01,
        ),
        exclude_initial_s=0.003,
        baseline_fraction=0.15,
    )


def test_simulated_conductivity_is_recovered():
    expected = 2e-8
    instrument = SimulatedBaceInstrument(
        ionic_conductivity_s_m=expected,
        noise_std_a=0.0,
        leakage_current_a=0.0,
    )
    recipe = make_recipe()
    result = analyze_transient(instrument.acquire_voltage_step(recipe, 1), recipe)
    assert result.apparent_conductivity_s_m is not None
    assert np.isclose(abs(result.apparent_conductivity_s_m), expected, rtol=0.05)


def test_field_series_fit_recovers_conductivity():
    expected = 2e-8
    instrument = SimulatedBaceInstrument(
        ionic_conductivity_s_m=expected,
        noise_std_a=0.0,
        leakage_current_a=0.0,
    )
    analyses = []
    for index, extraction in enumerate((0.2, 0.0, -0.2), start=1):
        recipe = make_recipe(f"field-{index}", extraction)
        analyses.append(analyze_transient(instrument.acquire_voltage_step(recipe, 1), recipe))

    slope, intercept = fit_ionic_conductivity(analyses)
    assert np.isclose(slope, expected, rtol=0.05)
    assert abs(intercept) < 1e-6
