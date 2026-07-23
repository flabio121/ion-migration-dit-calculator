from dataclasses import asdict
from pprint import pprint

from bace_lab import (
    AcquisitionSettings,
    BaceController,
    BaceRecipe,
    DeviceGeometry,
    LabToolbox,
    RunMode,
    SafetyPolicy,
)
from bace_lab.instruments.simulated import SimulatedBaceInstrument


def main() -> None:
    recipe = BaceRecipe(
        recipe_id="simulation-smoke-test",
        device=DeviceGeometry(area_cm2=0.09, thickness_nm=500, label="synthetic-cell"),
        precondition_voltage_v=1.0,
        extraction_voltage_v=0.0,
        precondition_duration_s=5.0,
        rest_duration_s=2.0,
        repetitions=3,
        current_compliance_a=0.005,
        acquisition=AcquisitionSettings(
            sample_interval_s=0.001,
            capture_duration_s=2.0,
            current_range_a=0.01,
        ),
        exclude_initial_s=0.003,
        baseline_fraction=0.15,
    )

    policy = SafetyPolicy()
    instrument = SimulatedBaceInstrument()
    controller = BaceController(instrument, policy, mode=RunMode.SIMULATION)
    tools = LabToolbox(controller, policy)

    pprint(tools.capabilities())
    pprint(tools.register_recipe(recipe))
    summary = tools.run_registered_recipe(recipe.recipe_id)
    pprint(summary)

    print("\nFirst analysis:")
    pprint(asdict(controller.run(recipe).analyses[0]))


if __name__ == "__main__":
    main()
